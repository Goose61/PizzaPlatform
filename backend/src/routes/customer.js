const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const recaptchaService = require('../services/recaptchaService');
const emailVerificationService = require('../services/emailVerificationService');
const { getClientIP, getUserAgent, getSecurityInfo, generateCorrelationId } = require('../utils/ipHelper');
const nodemailer = require('nodemailer');

const router = express.Router();

// Rate limiting for customer authentication - more lenient in development
const customerAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 5 : 50, // 50 attempts in dev, 5 in prod
  message: { error: 'Too many authentication attempts from this IP, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for localhost in development
    if (process.env.NODE_ENV !== 'production') {
      const ip = req.ip || req.connection.remoteAddress;
      return ip === '127.0.0.1' || ip === '::1' || ip?.startsWith('192.168.') || ip?.startsWith('10.');
    }
    return false;
  }
});

const customerRegisterLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: process.env.NODE_ENV === 'production' ? 3 : 20, // 20 attempts in dev, 3 in prod
  message: { error: 'Too many registration attempts from this IP, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for localhost in development
    if (process.env.NODE_ENV !== 'production') {
      const ip = req.ip || req.connection.remoteAddress;
      return ip === '127.0.0.1' || ip === '::1' || ip?.startsWith('192.168.') || ip?.startsWith('10.');
    }
    return false;
  }
});

// Helper for sending emails
async function sendEmail(to, subject, htmlContent) {
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const mailOptions = {
    from: process.env.EMAIL_FROM || 'noreply@pizzaplatform.com',
    to: to,
    subject: subject,
    html: htmlContent,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`📧 Email sent to ${to.substring(0, 2)}**@${to.split('@')[1]}`);
  } catch (error) {
    console.error(`❌ Error sending email to ${to}:`, error);
    throw new Error('Failed to send email');
  }
}

// Helper for security event logging
async function logSecurityEvent(user, eventType, req, additionalData = {}) {
  const correlationId = additionalData.correlationId || generateCorrelationId();
  const securityInfo = getSecurityInfo(req);
  
  try {
    if (user && user.addSecurityEvent) {
      await user.addSecurityEvent(
        eventType,
        securityInfo.ip,
        securityInfo.userAgent,
        correlationId,
        { ...additionalData, ...securityInfo.headers }
      );
    }
    
    console.log(`🔒 Security Event: ${eventType} for ${user?.email || 'unknown'} [${correlationId}] from IP: ${securityInfo.ip}`);
  } catch (error) {
    console.error('Failed to log security event:', error);
  }
}

/**
 * @route POST /api/customer/register
 * @desc Register a new customer account
 * @access Public
 */
router.post('/register',
  customerRegisterLimiter,
  [
    body('firstName').isString().isLength({ min: 1, max: 50 }).trim().withMessage('First name is required'),
    body('lastName').isString().isLength({ min: 1, max: 50 }).trim().withMessage('Last name is required'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 8, max: 200 }).withMessage('Password must be at least 8 characters'),
    body('phoneNumber').optional({ nullable: true, checkFalsy: true }).isMobilePhone().withMessage('Invalid phone number'),
    body('referralCode').optional().isString().isLength({ max: 50 }).withMessage('Invalid referral code'),
    body('emailMarketing').optional().isBoolean().withMessage('Marketing preference must be boolean'),
    body('registrationSource').optional().isIn(['direct', 'gift_card', 'business_referral']).withMessage('Invalid registration source'),
    body('recaptchaToken').optional().isString().withMessage('Invalid reCAPTCHA token')
  ],
  async (req, res) => {
    const correlationId = generateCorrelationId();
    const securityInfo = getSecurityInfo(req);
    
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
      }

      const { 
        firstName, 
        lastName, 
        email, 
        password, 
        phoneNumber, 
        referralCode, 
        emailMarketing = false,
        registrationSource = 'direct',
        recaptchaToken 
      } = req.body;

      // Verify reCAPTCHA Enterprise v3 (optional in development)
      if (process.env.RECAPTCHA_SECRET_KEY && process.env.NODE_ENV === 'production') {
        const recaptchaResult = await recaptchaService.verifyRecaptcha(recaptchaToken, 'CUSTOMER_REGISTER');
        if (!recaptchaResult.success) {
          console.warn(`🤖 reCAPTCHA Enterprise failed for customer registration: ${email} [${correlationId}] - Score: ${recaptchaResult.score}, Reason: ${recaptchaResult.reason}`);
          return res.status(400).json({
            error: 'Security verification failed. Please try again.',
            code: 'RECAPTCHA_FAILED'
          });
        }
        console.log(`✅ reCAPTCHA Enterprise passed for customer registration ${email} - Score: ${recaptchaResult.score}`);
      } else if (process.env.NODE_ENV !== 'production') {
        console.log(`⚠️ reCAPTCHA Enterprise skipped for customer registration in development mode`);
      }

      // Verify email address with Verifalia
      if (emailVerificationService.isConfigured) {
        try {
          console.log(`📧 Verifying customer email with Verifalia: ${email.substring(0, 2)}**@${email.split('@')[1]} [${correlationId}]`);
          const emailResult = await emailVerificationService.verifyEmail(email);
          
          if (emailResult.classification === 'Undeliverable') {
            console.warn(`📧 Customer registration with undeliverable email: ${email.substring(0, 2)}**@${email.split('@')[1]} [${correlationId}]`);
            return res.status(400).json({ 
              error: 'Email address appears invalid. Please check and try again.',
              code: 'EMAIL_VERIFICATION_FAILED'
            });
          }
          
          if (emailResult.classification === 'Risky') {
            console.warn(`⚠️ Customer registration with risky email: ${email.substring(0, 2)}**@${email.split('@')[1]} [${correlationId}]`);
            // Continue but log for review
          }
          
          console.log(`✅ Customer email verified: ${email.substring(0, 2)}**@${email.split('@')[1]} - ${emailResult.classification} [${correlationId}]`);
        } catch (emailError) {
          console.warn(`⚠️ Email verification failed for customer ${email}: ${emailError.message} [${correlationId}]`);
          // Continue with registration even if email verification fails (for reliability)
        }
      }

      // Check if user already exists
      const existingUser = await User.findByEmail(email);
      if (existingUser) {
        console.warn(`👤 Customer registration attempt with existing email: ${email.substring(0, 2)}**@${email.split('@')[1]} [${correlationId}]`);
        return res.status(400).json({ error: 'An account with this email already exists' });
      }

      // Hash password
      const passwordHash = await User.hashPassword(password);

      // Generate email verification token
      const emailVerificationToken = crypto.randomBytes(32).toString('hex');
      const emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      // Create user
      const newUser = new User({
        email,
        passwordHash,
        emailVerificationToken,
        emailVerificationExpires,
        isEmailVerified: false,
        isActive: true,
        role: 'customer',
        registrationSource,
        // Registration IP tracking for security
        registrationIP: securityInfo.ip,
        registrationUserAgent: securityInfo.userAgent,
        registrationTimestamp: new Date(),
        preferences: {
          emailNotifications: emailMarketing,
          securityAlerts: true
        },
        // Customer profile data
        profile: {
          firstName,
          lastName,
          phoneNumber: phoneNumber || null
        },
        // Initialize wallet and payment tracking
        wallet: {
          pizzaSPLBalance: 0,
          usdcBalance: 0,
          lastBalanceUpdate: new Date(),
          walletType: 'phantom'
        },
        payments: {
          totalTransactions: 0,
          totalVolume: 0,
          pizzaSPLRewardsEarned: 0,
          preferredPaymentMethod: 'usdc',
          favoriteBusinesses: []
        },
        giftCards: [],
        loginHistory: []
      });

      // Handle referral code if provided
      if (referralCode) {
        // TODO: Process referral code and award bonuses
        newUser.referralData = {
          code: referralCode,
          processed: false
        };
      }

      await newUser.save();

      // Log security event
      await logSecurityEvent(newUser, 'account_created', req, { correlationId, registrationSource });

      // Send verification email
      try {
        const verificationLink = `${req.protocol}://${req.get('host')}/api/customer/verify-email/${emailVerificationToken}`;
        
        await sendEmail(
          email,
          'Welcome to Pizza Platform - Verify Your Email',
          `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #e67e22, #d35400); padding: 2rem; text-align: center; color: white;">
              <h1 style="margin: 0; font-size: 2rem;">🍕 Welcome to Pizza Platform!</h1>
              <p style="margin: 0.5rem 0 0 0; font-size: 1.1rem;">Thanks for joining our pizza rewards community</p>
            </div>
            
            <div style="padding: 2rem; background: #f8f9fa;">
              <h2 style="color: #e67e22; margin-top: 0;">Hi ${firstName}!</h2>
              
              <p>We're excited to have you join Pizza Platform! To get started earning pizza rewards, please verify your email address by clicking the button below:</p>
              
              <div style="text-align: center; margin: 2rem 0;">
                <a href="${verificationLink}" style="background: linear-gradient(135deg, #e67e22, #d35400); color: white; padding: 1rem 2rem; text-decoration: none; border-radius: 10px; font-weight: bold; display: inline-block;">
                  ✅ Verify My Email Address
                </a>
              </div>
              
              <p style="font-size: 0.9rem; color: #6c757d;">If the button doesn't work, copy and paste this link into your browser:</p>
              <p style="font-size: 0.8rem; word-break: break-all; background: #fff; padding: 1rem; border-radius: 5px; border: 1px solid #dee2e6;">${verificationLink}</p>
              
              <div style="background: #fff; padding: 1.5rem; border-radius: 10px; margin: 2rem 0; border-left: 4px solid #e67e22;">
                <h3 style="color: #e67e22; margin-top: 0; font-size: 1.2rem;">🎉 What's Next?</h3>
                <ul style="margin: 0; padding-left: 1.5rem;">
                  <li><strong>Earn Rewards:</strong> Get 0.3 $PIZZA tokens for every $15 purchase</li>
                  <li><strong>Find Partners:</strong> Discover participating pizza shops near you</li>
                  <li><strong>Gift Cards:</strong> Buy and redeem NFT-based pizza gift cards</li>
                  <li><strong>Track Progress:</strong> Monitor your spending and loyalty rewards</li>
                </ul>
              </div>
              
              <p style="font-size: 0.9rem; color: #6c757d;">This verification link will expire in 24 hours. If you didn't create this account, please ignore this email.</p>
              
              <div style="text-align: center; margin-top: 2rem; padding-top: 2rem; border-top: 1px solid #dee2e6;">
                <p style="margin: 0; color: #6c757d; font-size: 0.8rem;">
                  Best regards,<br>
                  The Pizza Platform Team<br>
                  <a href="mailto:support@pizzaplatform.com" style="color: #e67e22;">support@pizzaplatform.com</a>
                </p>
              </div>
            </div>
          </div>
          `
        );
        
        console.log(`📧 Verification email sent to customer: ${email.substring(0, 2)}**@${email.split('@')[1]} [${correlationId}]`);
      } catch (emailError) {
        console.error(`❌ Failed to send verification email to ${email}:`, emailError);
        // Don't fail registration if email sending fails
      }

      console.log(`✅ Customer account created: ${email.substring(0, 2)}**@${email.split('@')[1]} [${correlationId}]`);

      res.status(201).json({
        success: true,
        message: 'Account created successfully! Please check your email to verify your account.',
        email: email,
        userId: newUser._id,
        emailVerificationRequired: true
      });

    } catch (error) {
      console.error('Customer registration error:', error);
      res.status(500).json({ error: 'Registration failed. Please try again.' });
    }
  }
);

/**
 * @route POST /api/customer/login
 * @desc Customer login
 * @access Public
 */
router.post('/login',
  customerAuthLimiter,
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').isString().isLength({ min: 1, max: 200 }).withMessage('Password is required'),
    body('recaptchaToken').optional().isString().withMessage('Invalid reCAPTCHA token')
  ],
  async (req, res) => {
    const correlationId = generateCorrelationId();
    const securityInfo = getSecurityInfo(req);
    
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
      }

      const { email, password, recaptchaToken } = req.body;

      // Verify reCAPTCHA Enterprise v3 (optional in development)
      if (process.env.RECAPTCHA_SECRET_KEY && process.env.NODE_ENV === 'production') {
        const recaptchaResult = await recaptchaService.verifyRecaptcha(recaptchaToken, 'CUSTOMER_LOGIN');
        if (!recaptchaResult.success) {
          console.warn(`🤖 reCAPTCHA Enterprise failed for customer login: ${email} [${correlationId}] - Score: ${recaptchaResult.score}, Reason: ${recaptchaResult.reason}`);
          return res.status(400).json({
            error: 'Security verification failed. Please try again.',
            code: 'RECAPTCHA_FAILED'
          });
        }
        console.log(`✅ reCAPTCHA Enterprise passed for customer login ${email} - Score: ${recaptchaResult.score}`);
      } else if (process.env.NODE_ENV !== 'production') {
        console.log(`⚠️ reCAPTCHA Enterprise skipped for customer login in development mode`);
      }

      // Find user
      const user = await User.findByEmail(email);
      if (!user) {
        console.warn(`👤 Customer login attempt for non-existent user: ${email.substring(0, 2)}**@${email.split('@')[1]} [${correlationId}]`);
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      // Check if account is locked
      if (user.isLocked) {
        await logSecurityEvent(user, 'login_failed', req, { 
          reason: 'account_locked',
          correlationId
        });
        console.warn(`🔒 Customer login attempt for locked account: ${email.substring(0, 2)}**@${email.split('@')[1]} [${correlationId}]`);
        return res.status(401).json({ error: 'Account temporarily locked due to failed login attempts' });
      }

      // Check if account is active
      if (!user.isActive) {
        await logSecurityEvent(user, 'login_failed', req, { 
          reason: 'account_inactive',
          correlationId
        });
        console.warn(`❌ Customer login attempt for inactive account: ${email.substring(0, 2)}**@${email.split('@')[1]} [${correlationId}]`);
        return res.status(401).json({ error: 'Account is inactive. Please contact support.' });
      }

      // Verify password
      const validPassword = await user.comparePassword(password);
      if (!validPassword) {
        await user.incrementLoginAttempts();
        // Log failed login attempt
        await user.addLoginAttempt(securityInfo.ip, securityInfo.userAgent, false);
        await logSecurityEvent(user, 'login_failed', req, { 
          reason: 'invalid_password',
          failedAttempts: user.failedLoginAttempts + 1,
          correlationId
        });
        console.warn(`❌ Invalid password for customer: ${email.substring(0, 2)}**@${email.split('@')[1]} [${correlationId}] from IP: ${securityInfo.ip}`);
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      // Reset failed login attempts on successful password verification
      await user.resetLoginAttempts();

      // Check email verification status
      if (!user.isEmailVerified) {
        console.warn(`📧 Customer login with unverified email: ${email.substring(0, 2)}**@${email.split('@')[1]} [${correlationId}] from IP: ${securityInfo.ip}`);
        return res.status(403).json({ 
          error: 'Please verify your email address before logging in. Check your inbox for the verification link.',
          code: 'EMAIL_NOT_VERIFIED',
          email: email
        });
      }

      // Log successful login attempt with IP tracking
      await user.addLoginAttempt(securityInfo.ip, securityInfo.userAgent, true);
      
      // Update last login is handled by addLoginAttempt method
      await user.save();

      // Generate JWT token
      const token = jwt.sign(
        { 
          userId: user._id, 
          email: user.email, 
          role: user.role 
        },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      // Log successful login
      await logSecurityEvent(user, 'login_success', req, { correlationId });
      console.log(`✅ Customer login successful: ${email.substring(0, 2)}**@${email.split('@')[1]} [${correlationId}] from IP: ${securityInfo.ip}`);

      res.json({
        success: true,
        message: 'Login successful',
        token,
        user: {
          id: user._id,
          email: user.email,
          firstName: user.profile?.firstName,
          lastName: user.profile?.lastName,
          role: user.role,
          isEmailVerified: user.isEmailVerified,
          lastLogin: user.lastLogin,
          pizzaRewards: user.wallet?.pizzaSPLBalance || 0,
          totalTransactions: user.payments?.totalTransactions || 0
        }
      });

    } catch (error) {
      console.error('Customer login error:', error);
      res.status(500).json({ error: 'Login failed. Please try again.' });
    }
  }
);

/**
 * @route GET /api/customer/verify-email/:token
 * @desc Verify customer email address
 * @access Public
 */
router.get('/verify-email/:token', async (req, res) => {
  const correlationId = generateCorrelationId();
  
  try {
    const { token } = req.params;

    if (!token || token.length !== 64) {
      return res.status(400).send(`
        <div style="text-align: center; font-family: Arial, sans-serif; padding: 2rem;">
          <h1 style="color: #dc3545;">❌ Invalid Verification Link</h1>
          <p>This verification link is invalid or malformed.</p>
          <a href="pages/customer-login.html" style="color: #e67e22;">Return to Login</a>
        </div>
      `);
    }

    // Find user with this token
    const user = await User.findOne({
      emailVerificationToken: token,
      emailVerificationExpires: { $gt: new Date() }
    });

    if (!user) {
      console.warn(`📧 Invalid or expired email verification token [${correlationId}]`);
      return res.status(400).send(`
        <div style="text-align: center; font-family: Arial, sans-serif; padding: 2rem;">
          <h1 style="color: #dc3545;">❌ Verification Link Expired</h1>
          <p>This verification link has expired or is invalid.</p>
          <p>Please request a new verification email from the login page.</p>
          <a href="pages/customer-login.html" style="color: #e67e22;">Return to Login</a>
        </div>
      `);
    }

    // Update user verification status
    user.isEmailVerified = true;
    user.emailVerificationToken = null;
    user.emailVerificationExpires = null;
    await user.save();

    // Log verification event
    await logSecurityEvent(user, 'email_verified', req, { correlationId });
    console.log(`✅ Customer email verified: ${user.email.substring(0, 2)}**@${user.email.split('@')[1]} [${correlationId}]`);

    res.send(`
      <div style="text-align: center; font-family: Arial, sans-serif; padding: 2rem;">
        <div style="background: linear-gradient(135deg, #e67e22, #d35400); color: white; padding: 2rem; border-radius: 10px; margin-bottom: 2rem;">
          <h1 style="margin: 0;">🎉 Email Verified Successfully!</h1>
          <p style="margin: 0.5rem 0 0 0;">Welcome to Pizza Platform!</p>
        </div>
        
        <div style="background: #f8f9fa; padding: 2rem; border-radius: 10px; margin-bottom: 2rem;">
          <h2 style="color: #e67e22; margin-top: 0;">🍕 You're All Set!</h2>
          <p>Your account has been verified and is now active. You can:</p>
          <ul style="text-align: left; display: inline-block;">
            <li>Sign in to your account</li>
            <li>Start earning pizza rewards</li>
            <li>Purchase and redeem gift cards</li>
            <li>Track your favorite pizza shops</li>
          </ul>
        </div>
        
        <a href="pages/customer-login.html" style="background: linear-gradient(135deg, #e67e22, #d35400); color: white; padding: 1rem 2rem; text-decoration: none; border-radius: 10px; font-weight: bold; display: inline-block;">
          🔑 Sign In to Your Account
        </a>
      </div>
    `);

  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).send(`
      <div style="text-align: center; font-family: Arial, sans-serif; padding: 2rem;">
        <h1 style="color: #dc3545;">❌ Verification Error</h1>
        <p>An error occurred while verifying your email. Please try again later.</p>
        <a href="/pages/customer-login.html" style="color: #e67e22;">Return to Login</a>
      </div>
    `);
  }
});

/**
 * @route POST /api/customer/resend-verification
 * @desc Resend email verification
 * @access Public
 */
router.post('/resend-verification',
  customerAuthLimiter,
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required')
  ],
  async (req, res) => {
    const correlationId = generateCorrelationId();
    
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
      }

      const { email } = req.body;

      const user = await User.findByEmail(email);
      if (!user) {
        // Don't reveal if email exists for security
        return res.json({ 
          success: true, 
          message: 'If an account with that email exists, a verification email has been sent.' 
        });
      }

      if (user.isEmailVerified) {
        return res.status(400).json({ error: 'Email is already verified.' });
      }

      // Generate new verification token
      const emailVerificationToken = crypto.randomBytes(32).toString('hex');
      const emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      user.emailVerificationToken = emailVerificationToken;
      user.emailVerificationExpires = emailVerificationExpires;
      await user.save();

      // Send verification email
      try {
        const verificationLink = `${req.protocol}://${req.get('host')}/api/customer/verify-email/${emailVerificationToken}`;
        
        await sendEmail(
          email,
          'Pizza Platform - Verify Your Email Address',
          `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #e67e22, #d35400); padding: 2rem; text-align: center; color: white;">
              <h1 style="margin: 0; font-size: 2rem;">🍕 Verify Your Email</h1>
            </div>
            
            <div style="padding: 2rem; background: #f8f9fa;">
              <p>Please verify your email address by clicking the button below:</p>
              
              <div style="text-align: center; margin: 2rem 0;">
                <a href="${verificationLink}" style="background: linear-gradient(135deg, #e67e22, #d35400); color: white; padding: 1rem 2rem; text-decoration: none; border-radius: 10px; font-weight: bold; display: inline-block;">
                  ✅ Verify My Email Address
                </a>
              </div>
              
              <p style="font-size: 0.9rem; color: #6c757d;">This link will expire in 24 hours.</p>
            </div>
          </div>
          `
        );
        
        console.log(`📧 Verification email resent to customer: ${email.substring(0, 2)}**@${email.split('@')[1]} [${correlationId}]`);
      } catch (emailError) {
        console.error(`❌ Failed to resend verification email to ${email}:`, emailError);
        return res.status(500).json({ error: 'Failed to send verification email.' });
      }

      res.json({ 
        success: true, 
        message: 'Verification email sent successfully.' 
      });

    } catch (error) {
      console.error('Resend verification error:', error);
      res.status(500).json({ error: 'Failed to resend verification email.' });
    }
  }
);

/**
 * @route POST /api/customer/forgot-password
 * @desc Request password reset
 * @access Public
 */
router.post('/forgot-password',
  customerAuthLimiter,
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required')
  ],
  async (req, res) => {
    const correlationId = generateCorrelationId();
    
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
      }

      const { email } = req.body;

      const user = await User.findByEmail(email);
      if (!user) {
        // Don't reveal if email exists for security
        return res.json({ 
          success: true, 
          message: 'If an account with that email exists, password reset instructions have been sent.' 
        });
      }

      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      user.resetPasswordToken = resetToken;
      user.resetPasswordExpires = resetExpires;
      await user.save();

      // Send reset email
      try {
        const resetLink = `${req.protocol}://${req.get('host')}/pages/customer-reset-password.html?token=${resetToken}`;
        
        await sendEmail(
          email,
          'Pizza Platform - Password Reset Request',
          `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #e67e22, #d35400); padding: 2rem; text-align: center; color: white;">
              <h1 style="margin: 0; font-size: 2rem;">🔐 Password Reset</h1>
            </div>
            
            <div style="padding: 2rem; background: #f8f9fa;">
              <p>You requested a password reset for your Pizza Platform account.</p>
              
              <div style="text-align: center; margin: 2rem 0;">
                <a href="${resetLink}" style="background: linear-gradient(135deg, #e67e22, #d35400); color: white; padding: 1rem 2rem; text-decoration: none; border-radius: 10px; font-weight: bold; display: inline-block;">
                  🔑 Reset My Password
                </a>
              </div>
              
              <p style="font-size: 0.9rem; color: #6c757d;">This link will expire in 1 hour. If you didn't request this reset, please ignore this email.</p>
            </div>
          </div>
          `
        );
        
        console.log(`📧 Password reset email sent to customer: ${email.substring(0, 2)}**@${email.split('@')[1]} [${correlationId}]`);
      } catch (emailError) {
        console.error(`❌ Failed to send password reset email to ${email}:`, emailError);
        return res.status(500).json({ error: 'Failed to send password reset email.' });
      }

      await logSecurityEvent(user, 'password_reset_requested', req, { correlationId });

      res.json({ 
        success: true, 
        message: 'Password reset instructions have been sent to your email.' 
      });

    } catch (error) {
      console.error('Forgot password error:', error);
      res.status(500).json({ error: 'Failed to process password reset request.' });
    }
  }
);

module.exports = router;


