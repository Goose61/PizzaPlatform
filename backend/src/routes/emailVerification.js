const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { body, query, validationResult } = require('express-validator');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const EmailVerificationService = require('../services/emailVerificationService');
const secretManager = require('../config/secrets');

const router = express.Router();
const emailVerificationService = new EmailVerificationService();

// Rate limiters for email verification endpoints
const emailVerificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 verification attempts per window
  message: { 
    error: 'Too many email verification attempts from this IP',
    code: 'RATE_LIMITED'
  },
  standardHeaders: true,
  legacyHeaders: false
});

const emailResendLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 resend attempts per hour
  message: { 
    error: 'Too many email resend attempts. Please wait before requesting another verification email.',
    code: 'RESEND_RATE_LIMITED'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * @route POST /api/email/verify-address
 * @desc Real-time email address verification using Verifalia
 * @access Public (for registration forms)
 */
router.post('/verify-address',
  emailVerificationLimiter,
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('recaptchaToken').optional().isString().withMessage('Invalid reCAPTCHA token')
  ],
  async (req, res) => {
    const correlationId = crypto.randomBytes(16).toString('hex');

    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
      }

      const { email, recaptchaToken } = req.body;

      // Verify reCAPTCHA Enterprise v3 when configured
      if (process.env.RECAPTCHA_SECRET_KEY) {
        const { verifyRecaptcha } = require('../services/recaptchaService');
        const recaptchaResult = await verifyRecaptcha(recaptchaToken, 'EMAIL_VERIFY');
        if (!recaptchaResult.success) {
          console.warn(`🤖 reCAPTCHA Enterprise failed for email verification: ${email} [${correlationId}] - Score: ${recaptchaResult.score}`);
          return res.status(400).json({ 
            error: 'Security verification failed. Please try again.',
            code: 'RECAPTCHA_FAILED'
          });
        }
        console.log(`✅ reCAPTCHA Enterprise passed for email verification ${email} - Score: ${recaptchaResult.score}`);
      }

      console.log(`📧 Real-time email verification requested: ${emailVerificationService.sanitizeEmailForLogging(email)} [${correlationId}]`);

      // Verify email with Verifalia
      const verificationResult = await emailVerificationService.verifyEmail(email);

      // Log verification result
      console.log(`📊 Email verification result for ${emailVerificationService.sanitizeEmailForLogging(email)}: ${verificationResult.classification} [${correlationId}]`);

      // Prepare response
      const response = {
        success: true,
        email: email,
        isValid: verificationResult.isValid,
        isRisky: verificationResult.isRisky,
        classification: verificationResult.classification,
        suggestions: verificationResult.suggestions,
        timestamp: verificationResult.timestamp,
        correlationId
      };

      // Include additional details if email is invalid or risky
      if (!verificationResult.isValid || verificationResult.isRisky) {
        response.details = {
          subClassification: verificationResult.subClassification,
          reason: verificationResult.classification
        };
      }

      res.json(response);

    } catch (error) {
      console.error(`❌ Email verification error [${correlationId}]:`, error);
      res.status(500).json({ 
        error: 'Email verification failed',
        correlationId
      });
    }
  }
);

/**
 * @route POST /api/email/send-verification
 * @desc Send email verification link to user
 * @access Public (for new registrations)
 */
router.post('/send-verification',
  emailResendLimiter,
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('userId').optional().isMongoId().withMessage('Valid user ID required'),
    body('resend').optional().isBoolean().withMessage('Resend flag must be boolean')
  ],
  async (req, res) => {
    const correlationId = crypto.randomBytes(16).toString('hex');

    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
      }

      const { email, userId, resend = false } = req.body;

      // Find user
      let user;
      if (userId) {
        user = await User.findById(userId);
      } else {
        user = await User.findOne({ email });
      }

      if (!user) {
        // Don't reveal whether user exists
        console.warn(`👤 Email verification requested for non-existent user: ${emailVerificationService.sanitizeEmailForLogging(email)} [${correlationId}]`);
        return res.json({ 
          success: true, 
          message: 'If an account with this email exists, a verification email has been sent.'
        });
      }

      // Check if already verified
      if (user.isEmailVerified && !resend) {
        return res.json({ 
          success: true, 
          message: 'Email is already verified.'
        });
      }

      // Generate verification token
      const tokenData = emailVerificationService.generateVerificationToken(email, user._id.toString());
      
      // Update user with verification token
      user.emailVerificationToken = tokenData.token;
      user.emailVerificationExpires = tokenData.expiresAt;
      await user.save();

      // Send verification email via Brevo SMTP
      await sendVerificationEmail(email, tokenData.token, correlationId);

      console.log(`📧 Email verification sent: ${emailVerificationService.sanitizeEmailForLogging(email)} [${correlationId}]`);

      res.json({ 
        success: true, 
        message: 'Verification email sent successfully.',
        expiresAt: tokenData.expiresAt
      });

    } catch (error) {
      console.error(`❌ Send verification email error [${correlationId}]:`, error);
      res.status(500).json({ 
        error: 'Failed to send verification email',
        correlationId
      });
    }
  }
);

/**
 * @route GET /api/email/verify/:token
 * @desc Verify email address using token from email link
 * @access Public
 */
router.get('/verify/:token',
  emailVerificationLimiter,
  async (req, res) => {
    const correlationId = crypto.randomBytes(16).toString('hex');

    try {
      const { token } = req.params;

      if (!token) {
        return res.status(400).json({ error: 'Verification token is required' });
      }

      // Find user with this verification token
      const user = await User.findOne({
        emailVerificationToken: token,
        emailVerificationExpires: { $gt: new Date() }
      });

      if (!user) {
        console.warn(`❌ Invalid or expired verification token [${correlationId}]`);
        return res.status(400).json({ 
          error: 'Invalid or expired verification token',
          code: 'INVALID_TOKEN'
        });
      }

      // Validate token
      const tokenData = {
        token: user.emailVerificationToken,
        email: user.email,
        userId: user._id,
        expiresAt: user.emailVerificationExpires,
        isUsed: user.isEmailVerified
      };

      const validationResult = emailVerificationService.validateVerificationToken(token, tokenData);

      if (!validationResult.isValid) {
        console.warn(`❌ Token validation failed: ${validationResult.reason} [${correlationId}]`);
        return res.status(400).json({ 
          error: 'Token validation failed',
          reason: validationResult.reason,
          code: 'TOKEN_VALIDATION_FAILED'
        });
      }

      // Mark email as verified
      user.isEmailVerified = true;
      user.emailVerificationToken = null;
      user.emailVerificationExpires = null;
      user.emailVerifiedAt = new Date();
      await user.save();

      console.log(`✅ Email verified successfully: ${emailVerificationService.sanitizeEmailForLogging(user.email)} [${correlationId}]`);

      // Determine redirect URL based on environment
      let redirectUrl;
      if (process.env.NODE_ENV === 'production') {
        redirectUrl = 'https://app.pizzabit.io/pages/customer-login.html?verified=true';
      } else {
        // Check if request came through Cloudflare Tunnel
        const origin = req.get('Origin') || req.get('Referer') || '';
        if (origin.includes('app.pizzabit.io')) {
          redirectUrl = 'https://app.pizzabit.io/pages/customer-login.html?verified=true';
        } else {
          redirectUrl = 'http://localhost:3000/pages/customer-login.html?verified=true';
        }
      }

      // Redirect to customer login page with success indicator
      res.redirect(redirectUrl);

    } catch (error) {
      console.error(`❌ Email verification error [${correlationId}]:`, error);
      res.status(500).json({ 
        error: 'Email verification failed',
        correlationId
      });
    }
  }
);

/**
 * @route GET /api/email/verification-status/:userId
 * @desc Check email verification status for a user
 * @access Private (requires authentication)
 */
router.get('/verification-status/:userId',
  // Add authentication middleware here if needed
  async (req, res) => {
    try {
      const { userId } = req.params;

      const user = await User.findById(userId).select('email isEmailVerified emailVerifiedAt emailVerificationExpires');
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({
        success: true,
        email: user.email,
        isEmailVerified: user.isEmailVerified,
        emailVerifiedAt: user.emailVerifiedAt,
        hasPendingVerification: !!(user.emailVerificationExpires && user.emailVerificationExpires > new Date())
      });

    } catch (error) {
      console.error('❌ Verification status check error:', error);
      res.status(500).json({ error: 'Failed to check verification status' });
    }
  }
);

/**
 * @route GET /api/email/service-stats
 * @desc Get email verification service statistics
 * @access Private (admin only)
 */
router.get('/service-stats',
  // Add admin authentication middleware here
  async (req, res) => {
    try {
      const stats = await emailVerificationService.getVerificationStats();
      const healthCheck = emailVerificationService.healthCheck();

      res.json({
        success: true,
        stats,
        health: healthCheck,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('❌ Service stats error:', error);
      res.status(500).json({ error: 'Failed to retrieve service statistics' });
    }
  }
);

/**
 * Send verification email via Brevo SMTP
 * @param {string} email - Recipient email
 * @param {string} token - Verification token
 * @param {string} correlationId - Correlation ID for logging
 */
async function sendVerificationEmail(email, token, correlationId) {
  try {
    const secrets = await secretManager.initialize();
    
    // Create transporter using Brevo SMTP
    const transporter = nodemailer.createTransporter({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      secure: false, // Use TLS
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    // Verification URL
    const baseUrl = process.env.NODE_ENV === 'production' ? 
      'https://yourdomain.com' : 
      'http://localhost:7000';
    const verificationUrl = `${baseUrl}/api/email/verify/${token}`;

    // Email template
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verify Your Pizza Platform Account</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #ff6b35, #d32f2f); padding: 30px; text-align: center; color: white; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; background: #ff6b35; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🍕 Pizza Platform</h1>
            <h2>Verify Your Email Address</h2>
          </div>
          <div class="content">
            <p>Hello!</p>
            <p>Thank you for registering with Pizza Platform. To complete your registration and secure your account, please verify your email address by clicking the button below:</p>
            
            <div style="text-align: center;">
              <a href="${verificationUrl}" class="button">Verify Email Address</a>
            </div>
            
            <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
            <p style="word-break: break-all; background: #f0f0f0; padding: 10px; border-radius: 5px;">
              ${verificationUrl}
            </p>
            
            <p><strong>Important:</strong></p>
            <ul>
              <li>This link will expire in 24 hours</li>
              <li>For security reasons, please verify your email as soon as possible</li>
              <li>If you didn't create this account, please ignore this email</li>
            </ul>
            
            <p>Welcome to the Pizza Platform community!</p>
            <p>Best regards,<br>The Pizza Platform Team</p>
          </div>
          <div class="footer">
            <p>This email was sent to ${email}</p>
            <p>If you have any questions, please contact our support team.</p>
            <p>© 2024 Pizza Platform. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Send email
    const mailOptions = {
      from: `"Pizza Platform" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
      to: email,
      subject: '🍕 Verify Your Pizza Platform Account',
      html: htmlContent,
      text: `
        Pizza Platform - Email Verification
        
        Thank you for registering with Pizza Platform!
        
        Please verify your email address by clicking this link:
        ${verificationUrl}
        
        This link will expire in 24 hours.
        
        If you didn't create this account, please ignore this email.
        
        Best regards,
        The Pizza Platform Team
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`📧 Verification email sent successfully to ${emailVerificationService.sanitizeEmailForLogging(email)} [${correlationId}]`);

  } catch (error) {
    console.error(`❌ Failed to send verification email [${correlationId}]:`, error);
    throw error;
  }
}

module.exports = router;


