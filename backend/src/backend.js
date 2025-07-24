// Load environment variables first
const fs = require('fs');
const path = require('path');

// Look for config files from project root
const projectRoot = path.join(__dirname, '../../');
const configPaths = [
  path.join(projectRoot, 'config.env'),
  path.join(projectRoot, '.env')
];

const configPath = configPaths.find(configPath => fs.existsSync(configPath));
if (configPath) {
  require('dotenv').config({ path: configPath });
  console.log(`✅ Environment loaded from: ${path.basename(configPath)}`);
} else {
  console.error('❌ No environment configuration file found!');
  console.error('Expected files: config.env or .env in project root');
}

const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const nodemailer = require('nodemailer');
const fetch = require('node-fetch');
const crypto = require('crypto');

// Import database and models
const database = require('./config/database');
const User = require('./models/User');
const Wallet = require('./models/Wallet');
const Transaction = require('./models/Transaction');

// Validate required environment variables
const requiredEnvVars = [
  'SESSION_SECRET',
  'JWT_SECRET',
  'ADMIN_JWT_SECRET',
  'EMAIL_USER',
  'EMAIL_PASS',
  'MONGODB_URI',
  'GOOGLE_MAPS_API_KEY',
  'SOLANA_RPC_ENDPOINT',
  'WALLET_MASTER_KEY',
  'SPL_TOKEN_MINT',
  'PIZZA_TOKEN_MINT'
];

const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingEnvVars.join(', '));
  console.error('Please check your .env file and ensure all required variables are set.');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 7000;

// Security configuration from environment - NO FALLBACKS
const SECURITY_CONFIG = {
  sessionSecret: process.env.SESSION_SECRET,
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS) || 12,
  jwtSecret: process.env.JWT_SECRET,
  emailFrom: process.env.EMAIL_FROM || 'noreply@pizzaplatform.com',
  rateLimits: {
    general: parseInt(process.env.RATE_LIMIT_GENERAL) || 100,
    auth: parseInt(process.env.RATE_LIMIT_AUTH) || 5,
    twoFA: parseInt(process.env.RATE_LIMIT_2FA) || 10,
    window: parseInt(process.env.RATE_LIMIT_WINDOW) || 900000 // 15 minutes
  }
};

// reCAPTCHA configuration from environment
const RECAPTCHA_CONFIG = {
  siteKey: process.env.RECAPTCHA_SITE_KEY,
  secretKey: process.env.RECAPTCHA_SECRET_KEY
};

// Email configuration from environment
const EMAIL_CONFIG = {
  host: process.env.EMAIL_HOST || 'smtp-relay.brevo.com',
  port: parseInt(process.env.EMAIL_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
};

// Initialize email transporter
const transporter = nodemailer.createTransport(EMAIL_CONFIG);

// Load password blacklist
let passwordBlacklist = new Set();
async function loadPasswordBlacklist() {
  try {
    const fsPromises = require('fs').promises;
    const data = await fsPromises.readFile('./10k-most-common.txt', 'utf8');
    passwordBlacklist = new Set(data.split('\n').map(p => p.trim().toLowerCase()));
    console.log(`📋 Loaded ${passwordBlacklist.size} blacklisted passwords`);
  } catch (error) {
    console.warn('⚠️ Warning: Could not load password blacklist:', error.message);
  }
}

// Utility functions
function generateCorrelationId() {
  return crypto.randomBytes(16).toString('hex');
}

function getClientInfo(req) {
  return {
    ipAddress: req.ip || req.connection.remoteAddress,
    userAgent: req.get('User-Agent') || 'Unknown'
  };
}

async function logSecurityEvent(user, eventType, req, details = {}) {
  const { ipAddress, userAgent } = getClientInfo(req);
  const correlationId = generateCorrelationId();
  
  console.log(`🔒 Security Event [${correlationId}]: ${eventType} for ${user.email} from ${ipAddress}`);
  
  if (user.addSecurityEvent) {
    await user.addSecurityEvent(eventType, ipAddress, userAgent, correlationId, details);
  }
  
  return correlationId;
}

// Middleware setup
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com", "data:"],
      scriptSrc: ["'self'", "https://www.google.com", "https://www.gstatic.com", "https://maps.googleapis.com", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:", "http:"],
      frameSrc: ["https://www.google.com"],
      connectSrc: ["'self'", "https://maps.googleapis.com", "https://www.google.com"]
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

app.use(cors({
  origin: function(origin, callback) {
    const allowedOrigins = [
      'http://localhost:3001',
      'http://127.0.0.1:3001',
      'http://localhost:5500',
      'http://127.0.0.1:5500',
      'http://localhost:7000',
      'http://127.0.0.1:7000'
    ];
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Session configuration with MongoDB store
app.use(session({
  secret: SECURITY_CONFIG.sessionSecret,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI || 'mongodb://localhost:27017/pizza-platform',
    touchAfter: 24 * 3600 // lazy session update
  }),
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'strict'
  },
  name: 'pizza.sid'
}));

// Rate limiting
const createRateLimit = (windowMs, max, message) => rateLimit({
  windowMs,
  max,
  message: { error: message },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.warn(`🚫 Rate limit exceeded from ${req.ip}`);
    res.status(429).json({ error: message });
  }
});

const generalLimiter = createRateLimit(
  SECURITY_CONFIG.rateLimits.window,
  SECURITY_CONFIG.rateLimits.general,
  'Too many requests, please try again later'
);

const authLimiter = createRateLimit(
  SECURITY_CONFIG.rateLimits.window,
  SECURITY_CONFIG.rateLimits.auth,
  'Too many authentication attempts, please try again later'
);

const twoFALimiter = createRateLimit(
  SECURITY_CONFIG.rateLimits.window,
  SECURITY_CONFIG.rateLimits.twoFA,
  'Too many 2FA attempts, please try again later'
);

app.use(generalLimiter);

// Helper functions
async function verifyRecaptcha(token) {
  if (!RECAPTCHA_CONFIG.secretKey) {
    console.warn('⚠️ Warning: reCAPTCHA not configured');
    return true; // Allow in development
  }

  try {
    const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${RECAPTCHA_CONFIG.secretKey}&response=${token}`
    });
    const data = await response.json();
    return data.success;
  } catch (error) {
    console.error('❌ reCAPTCHA verification failed:', error);
    return false;
  }
}

function isPasswordBlacklisted(password) {
  return passwordBlacklist.has(password.toLowerCase());
}

function validatePassword(password) {
  const errors = [];
  
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  if (!/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }
  if (isPasswordBlacklisted(password)) {
    errors.push('This password is too common and not allowed');
  }
  
  return errors;
}

async function sendEmail(to, subject, html) {
  try {
    await transporter.sendMail({
      from: SECURITY_CONFIG.emailFrom,
      to,
      subject,
      html
    });
    console.log(`📧 Email sent to ${to}: ${subject}`);
  } catch (error) {
    console.error('❌ Failed to send email:', error);
    throw error;
  }
}

// Import authentication middleware
const { requireAuth, require2FA } = require('./middleware/auth');

// Routes

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    const dbHealth = await database.healthCheck();
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: dbHealth,
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// User registration
app.post('/api/register', authLimiter, async (req, res) => {
  const correlationId = generateCorrelationId();
  
  try {
    const { email, password, recaptchaToken } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    // Verify reCAPTCHA
    if (!(await verifyRecaptcha(recaptchaToken))) {
      console.warn(`🤖 reCAPTCHA failed for registration attempt: ${email} [${correlationId}]`);
      return res.status(400).json({ error: 'reCAPTCHA verification failed' });
    }
    
    // Validate password
    const passwordErrors = validatePassword(password);
    if (passwordErrors.length > 0) {
      return res.status(400).json({ 
        error: 'Password does not meet requirements',
        details: passwordErrors 
      });
    }
    
    // Check if user already exists
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(409).json({ error: 'User already exists' });
    }
    
    // Create new user
    const passwordHash = await User.hashPassword(password);
    const emailVerificationToken = crypto.randomBytes(32).toString('hex');
    
    const user = new User({
      email,
      passwordHash,
      emailVerificationToken,
      emailVerificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
    });
    
    await user.save();
    await logSecurityEvent(user, 'account_created', req, { correlationId });
    
    // Send verification email
    const verificationUrl = `http://localhost:${PORT}/api/verify-email?token=${emailVerificationToken}`;
    await sendEmail(
      email,
      'Pizza Platform - Verify Your Email',
      `
        <h2>Welcome to Pizza Platform!</h2>
        <p>Please click the link below to verify your email address:</p>
        <a href="${verificationUrl}">${verificationUrl}</a>
        <p>This link will expire in 24 hours.</p>
        <p>If you didn't create this account, please ignore this email.</p>
      `
    );
    
    console.log(`✅ User registered: ${email} [${correlationId}]`);
    res.status(201).json({ 
      message: 'Registration successful. Please check your email for verification.' 
    });
    
  } catch (error) {
    console.error(`❌ Registration error [${correlationId}]:`, error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Email verification
app.get('/api/verify-email', async (req, res) => {
  try {
    const { token } = req.query;
    
    if (!token) {
      return res.status(400).json({ error: 'Verification token required' });
    }
    
    const user = await User.findOne({
      emailVerificationToken: token,
      emailVerificationExpires: { $gt: new Date() }
    });
    
    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired verification token' });
    }
    
    user.isEmailVerified = true;
    user.emailVerificationToken = null;
    user.emailVerificationExpires = null;
    await user.save();
    
    await logSecurityEvent(user, 'email_verified', req);
    
    console.log(`✅ Email verified: ${user.email}`);
    res.json({ message: 'Email verified successfully' });
    
  } catch (error) {
    console.error('❌ Email verification error:', error);
    res.status(500).json({ error: 'Email verification failed' });
  }
});

// User login
app.post('/api/login', authLimiter, async (req, res) => {
  const correlationId = generateCorrelationId();
  
  try {
    const { email, password, recaptchaToken } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    // Verify reCAPTCHA
    if (!(await verifyRecaptcha(recaptchaToken))) {
      console.warn(`🤖 reCAPTCHA failed for login attempt: ${email} [${correlationId}]`);
      return res.status(400).json({ error: 'reCAPTCHA verification failed' });
    }
    
    const user = await User.findByEmail(email);
    if (!user) {
      console.warn(`👤 Login attempt for non-existent user: ${email} [${correlationId}]`);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Check if account is locked
    if (user.isLocked) {
      await logSecurityEvent(user, 'login_failed', req, { 
        reason: 'account_locked',
        correlationId 
      });
      console.warn(`🔒 Login attempt on locked account: ${email} [${correlationId}]`);
      return res.status(423).json({ 
        error: 'Account temporarily locked due to too many failed attempts' 
      });
    }
    
    // Check if email is verified
    if (!user.isEmailVerified) {
      return res.status(403).json({ 
        error: 'Please verify your email before logging in' 
      });
    }
    
    // Verify password
    const isValidPassword = await user.comparePassword(password);
    if (!isValidPassword) {
      await user.incrementLoginAttempts();
      await logSecurityEvent(user, 'login_failed', req, { 
        reason: 'invalid_password',
        correlationId 
      });
      
      console.warn(`🔑 Invalid password for: ${email} [${correlationId}]`);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Reset failed login attempts on successful password verification
    if (user.failedLoginAttempts > 0) {
      await user.resetLoginAttempts();
    }
    
    // Update last login
    user.lastLogin = new Date();
    await user.save();
    
    // Set session
    req.session.userId = user._id;
    req.session.email = user.email;
    
    // Check if 2FA is enabled
    if (user.twoFactorEnabled) {
      req.session.twoFactorVerified = false;
      await logSecurityEvent(user, 'login_success', req, { 
        requires2FA: true,
        correlationId 
      });
      
      console.log(`🔐 Login successful (2FA required): ${email} [${correlationId}]`);
      return res.json({ 
        message: 'Login successful', 
        requires2FA: true,
        user: user.toJSON()
      });
    } else {
      req.session.twoFactorVerified = true;
      await logSecurityEvent(user, 'login_success', req, { correlationId });
      
      console.log(`✅ Login successful: ${email} [${correlationId}]`);
      return res.json({ 
        message: 'Login successful', 
        user: user.toJSON()
      });
    }
    
  } catch (error) {
    console.error(`❌ Login error [${correlationId}]:`, error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// 2FA Setup
app.post('/api/2fa/setup', requireAuth, twoFALimiter, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (user.twoFactorEnabled) {
      return res.status(400).json({ error: '2FA is already enabled' });
    }
    
    const secret = speakeasy.generateSecret({
      name: `Pizza Platform (${user.email})`,
      issuer: 'Pizza Platform'
    });
    
    // Store secret temporarily (will be saved permanently on verification)
    req.session.tempTwoFactorSecret = secret.base32;
    
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);
    
    console.log(`🔐 2FA setup initiated for: ${user.email}`);
    res.json({ 
      qrCode: qrCodeUrl, 
      secret: secret.base32,
      manualEntryKey: secret.base32
    });
    
  } catch (error) {
    console.error('❌ 2FA setup error:', error);
    res.status(500).json({ error: '2FA setup failed' });
  }
});

// 2FA Verification (setup)
app.post('/api/2fa/verify-setup', requireAuth, twoFALimiter, async (req, res) => {
  const correlationId = generateCorrelationId();
  
  try {
    const { token } = req.body;
    const user = await User.findById(req.session.userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (!req.session.tempTwoFactorSecret) {
      return res.status(400).json({ error: 'No 2FA setup in progress' });
    }
    
    const verified = speakeasy.totp.verify({
      secret: req.session.tempTwoFactorSecret,
      encoding: 'base32',
      token,
      window: 2
    });
    
    if (!verified) {
      console.warn(`🔐 Invalid 2FA token during setup: ${user.email} [${correlationId}]`);
      return res.status(400).json({ error: 'Invalid verification code' });
    }
    
    // Generate backup codes
    const backupCodes = [];
    for (let i = 0; i < 10; i++) {
      backupCodes.push(crypto.randomBytes(4).toString('hex').toUpperCase());
    }
    
    // Save 2FA settings
    user.twoFactorSecret = req.session.tempTwoFactorSecret;
    user.twoFactorEnabled = true;
    user.backupCodes = backupCodes.map(code => ({ code, used: false }));
    await user.save();
    
    // Clean up session
    delete req.session.tempTwoFactorSecret;
    req.session.twoFactorVerified = true;
    
    await logSecurityEvent(user, '2fa_enabled', req, { correlationId });
    
    console.log(`✅ 2FA enabled for: ${user.email} [${correlationId}]`);
    res.json({ 
      message: '2FA enabled successfully',
      backupCodes
    });
    
  } catch (error) {
    console.error(`❌ 2FA verification error [${correlationId}]:`, error);
    res.status(500).json({ error: '2FA verification failed' });
  }
});

// 2FA Login Verification
app.post('/api/2fa/verify', authLimiter, async (req, res) => {
  const correlationId = generateCorrelationId();
  
  try {
    const { token, isBackupCode } = req.body;
    
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const user = await User.findById(req.session.userId);
    if (!user || !user.twoFactorEnabled) {
      return res.status(400).json({ error: 'Invalid request' });
    }
    
    let verified = false;
    
    if (isBackupCode) {
      // Check backup codes
      const backupCode = user.backupCodes.find(
        bc => bc.code === token.toUpperCase() && !bc.used
      );
      
      if (backupCode) {
        backupCode.used = true;
        await user.save();
        verified = true;
        
        console.log(`🔑 Backup code used: ${user.email} [${correlationId}]`);
      }
    } else {
      // Check TOTP token
      verified = speakeasy.totp.verify({
        secret: user.twoFactorSecret,
        encoding: 'base32',
        token,
        window: 2
      });
    }
    
    if (!verified) {
      await logSecurityEvent(user, 'login_failed', req, { 
        reason: 'invalid_2fa',
        correlationId 
      });
      console.warn(`🔐 Invalid 2FA token: ${user.email} [${correlationId}]`);
      return res.status(400).json({ error: 'Invalid verification code' });
    }
    
    req.session.twoFactorVerified = true;
    
    await logSecurityEvent(user, 'login_success', req, { 
      method: isBackupCode ? 'backup_code' : 'totp',
      correlationId 
    });
    
    console.log(`✅ 2FA verification successful: ${user.email} [${correlationId}]`);
    res.json({ 
      message: '2FA verification successful',
      user: user.toJSON()
    });
    
  } catch (error) {
    console.error(`❌ 2FA login verification error [${correlationId}]:`, error);
    res.status(500).json({ error: '2FA verification failed' });
  }
});

// Disable 2FA
app.post('/api/2fa/disable', requireAuth, require2FA, twoFALimiter, async (req, res) => {
  const correlationId = generateCorrelationId();
  
  try {
    const { password, token } = req.body;
    const user = req.user;
    
    // Verify password
    const isValidPassword = await user.comparePassword(password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid password' });
    }
    
    // Verify current 2FA token
    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token,
      window: 2
    });
    
    if (!verified) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }
    
    // Disable 2FA
    user.twoFactorSecret = null;
    user.twoFactorEnabled = false;
    user.backupCodes = [];
    await user.save();
    
    await logSecurityEvent(user, '2fa_disabled', req, { correlationId });
    
    console.log(`🔐 2FA disabled for: ${user.email} [${correlationId}]`);
    res.json({ message: '2FA disabled successfully' });
    
  } catch (error) {
    console.error(`❌ 2FA disable error [${correlationId}]:`, error);
    res.status(500).json({ error: 'Failed to disable 2FA' });
  }
});

// Password reset request
app.post('/api/reset-password', authLimiter, async (req, res) => {
  const correlationId = generateCorrelationId();
  
  try {
    const { email, recaptchaToken } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    // Verify reCAPTCHA
    if (!(await verifyRecaptcha(recaptchaToken))) {
      console.warn(`🤖 reCAPTCHA failed for password reset: ${email} [${correlationId}]`);
      return res.status(400).json({ error: 'reCAPTCHA verification failed' });
    }
    
    const user = await User.findByEmail(email);
    if (!user) {
      // Don't reveal whether email exists
      console.warn(`👤 Password reset for non-existent user: ${email} [${correlationId}]`);
      return res.json({ message: 'If the email exists, a reset link has been sent' });
    }
    
    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save();
    
    await logSecurityEvent(user, 'password_reset_requested', req, { correlationId });
    
    // Send reset email
    const resetUrl = `http://localhost:${PORT}/reset-password.html?token=${resetToken}`;
    await sendEmail(
      email,
      'Pizza Platform - Password Reset',
      `
        <h2>Password Reset Request</h2>
        <p>You requested a password reset for your Pizza Platform account.</p>
        <p>Click the link below to reset your password:</p>
        <a href="${resetUrl}">${resetUrl}</a>
        <p>This link will expire in 1 hour.</p>
        <p>If you didn't request this reset, please ignore this email.</p>
      `
    );
    
    console.log(`🔑 Password reset requested: ${email} [${correlationId}]`);
    res.json({ message: 'If the email exists, a reset link has been sent' });
    
  } catch (error) {
    console.error(`❌ Password reset request error [${correlationId}]:`, error);
    res.status(500).json({ error: 'Password reset request failed' });
  }
});

// Password reset confirmation
app.post('/api/reset-password/confirm', authLimiter, async (req, res) => {
  const correlationId = generateCorrelationId();
  
  try {
    const { token, newPassword } = req.body;
    
    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }
    
    // Validate new password
    const passwordErrors = validatePassword(newPassword);
    if (passwordErrors.length > 0) {
      return res.status(400).json({ 
        error: 'Password does not meet requirements',
        details: passwordErrors 
      });
    }
    
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: new Date() }
    });
    
    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }
    
    // Update password
    user.passwordHash = await User.hashPassword(newPassword);
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    user.lastPasswordChange = new Date();
    await user.save();
    
    await logSecurityEvent(user, 'password_reset_completed', req, { correlationId });
    
    console.log(`🔑 Password reset completed: ${user.email} [${correlationId}]`);
    res.json({ message: 'Password reset successful' });
    
  } catch (error) {
    console.error(`❌ Password reset confirmation error [${correlationId}]:`, error);
    res.status(500).json({ error: 'Password reset failed' });
  }
});

// User logout
app.post('/api/logout', (req, res) => {
  const email = req.session.email;
  req.session.destroy((err) => {
    if (err) {
      console.error('❌ Logout error:', err);
      return res.status(500).json({ error: 'Logout failed' });
    }
    
    console.log(`👋 User logged out: ${email || 'unknown'}`);
    res.json({ message: 'Logged out successfully' });
  });
});

// Get user profile
app.get('/api/user/profile', requireAuth, require2FA, async (req, res) => {
  try {
    const user = req.user;
    res.json(user.toJSON());
  } catch (error) {
    console.error('❌ Profile fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Get user security events
app.get('/api/user/security-events', requireAuth, require2FA, async (req, res) => {
  try {
    const user = req.user;
    const events = user.securityEvents
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 20); // Last 20 events
      
    res.json(events);
  } catch (error) {
    console.error('❌ Security events fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch security events' });
  }
});

// API endpoint to serve Google Maps API key (secure)
app.get('/api/config/maps-key', (req, res) => {
  // Only return API key if it's configured
  if (!process.env.GOOGLE_MAPS_API_KEY) {
    return res.status(503).json({ 
      error: 'Google Maps API key not configured' 
    });
  }
  
  res.json({ 
    apiKey: process.env.GOOGLE_MAPS_API_KEY 
  });
});

// Include admin routes
const adminRoutes = require('./routes/admin');
app.use('/api/admin', adminRoutes);

// Include blockchain routes
const blockchainRoutes = require('./routes/blockchain');
app.use('/api/blockchain', blockchainRoutes);

// Include KYC routes
const kycRoutes = require('./routes/kyc');
app.use('/api/kyc', kycRoutes);

// Include Business routes
const businessRoutes = require('./routes/business');
app.use('/api/business', businessRoutes);

// Serve static files from frontend directory
app.use(express.static(path.join(__dirname, '../../frontend/public')));
app.use('/src', express.static(path.join(__dirname, '../../frontend/src')));

// Map pizzaimages to the actual image directory
app.use('/pizzaimages', express.static(path.join(__dirname, '../../frontend/src/assets/images/pizzaimages')));

// Serve x.jpg directly from images directory
app.get('/x.jpg', (req, res) => {
  res.sendFile(path.join(__dirname, '../../frontend/src/assets/images/x.jpg'));
});

// Handle favicon.ico
app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

// Initialize server
async function startServer() {
  try {
    // Connect to database
    await database.connect();
    
    // Load password blacklist
    await loadPasswordBlacklist();
    
    // Start server
    app.listen(PORT, () => {
      console.log(`🚀 Pizza Platform Backend running on port ${PORT}`);
      console.log(`🔒 Security features enabled: 2FA, Rate limiting, Account lockouts`);
      console.log(`📧 Email service: ${EMAIL_CONFIG.host}:${EMAIL_CONFIG.port}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    });
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  await database.disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🛑 SIGINT received, shutting down gracefully...');
  await database.disconnect();
  process.exit(0);
});

// Start the server
startServer(); 