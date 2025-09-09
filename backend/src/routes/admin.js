const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { body, query, validationResult } = require('express-validator');
const fetch = require('node-fetch');
const User = require('../models/User');
const Business = require('../models/Business');
const Transaction = require('../models/Transaction');
const VaultService = require('../services/vaultService');
const BusinessTypeService = require('../services/businessTypeService');
// KYC service removed - not needed in vendor-only system
const adminAuth = require('../middleware/adminAuth');
const securityMiddleware = require('../middleware/security');
const secretManager = require('../config/secrets');

const router = express.Router();
const vaultService = new VaultService();
const businessTypeService = new BusinessTypeService();
// KYC service instance removed

// Helper function for reCAPTCHA Enterprise v3 verification with scoring
async function verifyRecaptcha(token, expectedAction = 'ADMIN_LOGIN') {
  if (!process.env.RECAPTCHA_SITE_KEY || !process.env.RECAPTCHA_SECRET_KEY) {
    console.warn('⚠️ Warning: reCAPTCHA Enterprise not configured for admin login');
    return { success: true, score: 1.0, reason: 'development_mode' }; // Allow in development
  }

  try {
    const { RecaptchaEnterpriseServiceClient } = require('@google-cloud/recaptcha-enterprise');
    
    // Create the reCAPTCHA client
    const client = new RecaptchaEnterpriseServiceClient();
    const projectID = process.env.GOOGLE_CLOUD_PROJECT_ID || 'lively-ace-464510-g2';
    const projectPath = client.projectPath(projectID);

    // Build the assessment request
    const request = {
      assessment: {
        event: {
          token: token,
          siteKey: process.env.RECAPTCHA_SITE_KEY,
        },
      },
      parent: projectPath,
    };

    const [response] = await client.createAssessment(request);

    // Check if the token is valid
    if (!response.tokenProperties.valid) {
      console.warn(`❌ reCAPTCHA token invalid: ${response.tokenProperties.invalidReason}`);
      return { 
        success: false, 
        score: 0.0, 
        reason: response.tokenProperties.invalidReason 
      };
    }

    // Check if the expected action was executed
    if (response.tokenProperties.action !== expectedAction) {
      console.warn(`❌ reCAPTCHA action mismatch. Expected: ${expectedAction}, Got: ${response.tokenProperties.action}`);
      return { 
        success: false, 
        score: 0.0, 
        reason: 'action_mismatch' 
      };
    }

    // Get the risk score (0.0 = bot, 1.0 = human)
    const score = response.riskAnalysis.score;
    console.log(`🛡️ reCAPTCHA Enterprise score: ${score} for admin action: ${expectedAction}`);
    
    // Log reasons if any
    if (response.riskAnalysis.reasons && response.riskAnalysis.reasons.length > 0) {
      console.log('reCAPTCHA reasons:', response.riskAnalysis.reasons);
    }

    // Set threshold - scores above 0.5 are considered legitimate
    const threshold = 0.5;
    const success = score >= threshold;
    
    return { 
      success, 
      score, 
      reason: success ? 'passed_threshold' : 'below_threshold',
      threshold
    };
    
  } catch (error) {
    console.error('❌ reCAPTCHA Enterprise verification failed:', error);
    return { 
      success: false, 
      score: 0.0, 
      reason: 'verification_error' 
    };
  }
}

// Helper function for security event logging
async function logSecurityEvent(user, eventType, req, details) {
  try {
    const correlationId = details.correlationId || crypto.randomBytes(16).toString('hex');
    const logEntry = {
      timestamp: new Date(),
      correlationId,
      eventType,
      userId: user?._id || null,
      email: user?.email || details.email || 'unknown',
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent'),
      details
    };

    // Log to console for immediate visibility
    console.log(`🔒 Security Event [${correlationId}]:`, {
      type: eventType,
      user: user?.email || details.email,
      ip: req.ip,
      details: details
    });

    // In production, you'd also log this to a security monitoring system
    // await SecurityLogger.log(logEntry);
    
  } catch (error) {
    console.error('Failed to log security event:', error);
  }
}

// Rate limiters for admin endpoints
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 admin operations per window
  message: { 
    error: 'Too many admin requests from this IP',
    code: 'RATE_LIMITED'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Admin login route
router.post('/login',
  [
    body('username').isString().isLength({ min: 3, max: 200 }).withMessage('Username or email is required'),
    body('password').isString().isLength({ min: 8, max: 200 }).withMessage('Password is required'),
    body('recaptchaToken').optional().isString().withMessage('Invalid reCAPTCHA token')
  ],
  async (req, res) => {
    const correlationId = crypto.randomBytes(16).toString('hex');
    
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
      }

      const { username, password, recaptchaToken } = req.body;

      // Verify reCAPTCHA Enterprise v3 when configured (optional in development)
      if (process.env.RECAPTCHA_SECRET_KEY && process.env.NODE_ENV === 'production') {
        const recaptchaResult = await verifyRecaptcha(recaptchaToken, 'ADMIN_LOGIN');
        if (!recaptchaResult.success) {
          await logSecurityEvent({ username }, 'admin_recaptcha_failed', req, { 
            reason: recaptchaResult.reason,
            score: recaptchaResult.score,
            threshold: recaptchaResult.threshold,
            correlationId,
            loginType: 'admin'
          });
          console.warn(`🤖 reCAPTCHA Enterprise failed for admin login: ${username} [${correlationId}] - Score: ${recaptchaResult.score}, Reason: ${recaptchaResult.reason}`);
          return res.status(400).json({ 
            error: 'Security verification failed. Please try again.',
            code: 'RECAPTCHA_FAILED'
          });
        }
        console.log(`✅ reCAPTCHA Enterprise passed for admin ${username} - Score: ${recaptchaResult.score}`);
      } else if (process.env.NODE_ENV !== 'production') {
        console.log(`⚠️ reCAPTCHA Enterprise skipped for admin login in development mode`);
      }

      // Optional: Verify email address with Verifalia for additional security
      const emailVerificationService = require('../services/emailVerificationService');
      if (emailVerificationService.isConfigured) {
        try {
          console.log(`📧 Verifying admin email with Verifalia: ${username.substring(0, 2)}**@${username.split('@')[1]} [${correlationId}]`);
          const emailResult = await emailVerificationService.verifyEmail(username);
          
          if (emailResult.classification === 'Undeliverable') {
            await logSecurityEvent({ username }, 'admin_email_verification_failed', req, { 
              reason: 'undeliverable_email',
              emailStatus: emailResult.status,
              correlationId,
              loginType: 'admin'
            });
            console.warn(`📧 Admin login with undeliverable email: ${username.substring(0, 2)}**@${username.split('@')[1]} [${correlationId}]`);
            return res.status(400).json({ 
              error: 'Email address appears invalid. Please contact administrator.',
              code: 'EMAIL_VERIFICATION_FAILED'
            });
          }
          
          console.log(`✅ Admin email verified: ${username.substring(0, 2)}**@${username.split('@')[1]} - ${emailResult.classification} [${correlationId}]`);
        } catch (emailError) {
          console.warn(`⚠️ Email verification failed for admin ${username}: ${emailError.message} [${correlationId}]`);
          // Continue with login even if email verification fails (for reliability)
        }
      }

      const AdminUser = require('../models/AdminUser');
      const admin = await AdminUser.findByLogin(username);
      if (!admin) {
        await logSecurityEvent({ username }, 'admin_login_failed', req, { 
          reason: 'user_not_found',
          correlationId,
          loginType: 'admin'
        });
        console.warn(`👤 Admin login attempt for non-existent user: ${username} [${correlationId}]`);
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Check if account is locked
      if (admin.isLocked) {
        await logSecurityEvent(admin, 'admin_login_failed', req, { 
          reason: 'account_locked',
          correlationId,
          loginType: 'admin'
        });
        console.warn(`🔒 Admin login attempt for locked account: ${username} [${correlationId}]`);
        return res.status(401).json({ error: 'Account temporarily locked due to failed login attempts' });
      }

      const ok = await admin.comparePassword(password);
      if (!ok) {
        await admin.incLoginAttempts();
        await logSecurityEvent(admin, 'admin_login_failed', req, { 
          reason: 'invalid_password',
          failedAttempts: admin.failedLoginAttempts + 1,
          correlationId,
          loginType: 'admin'
        });
        console.warn(`❌ Invalid password for admin: ${username} [${correlationId}]`);
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Reset failed login attempts on successful password verification
      await admin.resetLoginAttempts();

      // Check if 2FA is enabled for this admin
      if (admin.twoFactorSecret && admin.isTwoFactorEnabled) {
        // Generate temporary session token for 2FA
        const tempSessionToken = crypto.randomBytes(32).toString('hex');
        
        // Store temp session (in production, use Redis or database)
        // For now, we'll use a simple in-memory store with expiration
        const tempSession = {
          adminId: admin._id,
          username: admin.username,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes
        };
        
        // Store temporarily (in production, use proper session storage)
        req.app.locals.tempAdminSessions = req.app.locals.tempAdminSessions || new Map();
        req.app.locals.tempAdminSessions.set(tempSessionToken, tempSession);
        
        // Clean up expired sessions
        setTimeout(() => {
          if (req.app.locals.tempAdminSessions) {
            req.app.locals.tempAdminSessions.delete(tempSessionToken);
          }
        }, 5 * 60 * 1000);

        await logSecurityEvent(admin, 'admin_2fa_required', req, { 
          correlationId,
          loginType: 'admin'
        });
        console.log(`🔐 2FA required for admin: ${username} [${correlationId}]`);
        
        return res.json({
          success: true,
          require2FA: true,
          tempSession: tempSessionToken,
          message: '2FA verification required'
        });
      }

      // Direct login success (no 2FA)
      const secretsSvc = require('../config/secrets');
      const secrets = await secretsSvc.initialize();
      
      const token = jwt.sign(
        {
          userId: admin._id.toString(),
          role: admin.role || 'admin',
          username: admin.username,
          permissions: admin.permissions && admin.permissions.length ? admin.permissions : ['*']
        },
        secrets.adminJwtSecret,
        { algorithm: 'HS256', issuer: 'pizza-platform', audience: 'admin-dashboard', expiresIn: '2h' }
      );

      await logSecurityEvent(admin, 'admin_login_success', req, { 
        correlationId,
        loginType: 'admin',
        require2FA: false
      });
      console.log(`✅ Admin login successful: ${username} [${correlationId}]`);

      return res.json({
        success: true,
        token,
        username: admin.username,
        email: admin.email,
        permissions: admin.permissions || ['*']
      });
    } catch (error) {
      console.error('Admin login error:', error);
      res.status(500).json({ error: 'Login failed' });
    }
  }
);

// Admin 2FA verification route
router.post('/verify-2fa',
  [
    body('tempSession').isString().withMessage('Temporary session token is required'),
    body('code').isString().isLength({ min: 6, max: 6 }).withMessage('6-digit code is required'),
    body('recaptchaToken').optional().isString().withMessage('Invalid reCAPTCHA token')
  ],
  async (req, res) => {
    const correlationId = crypto.randomBytes(16).toString('hex');
    
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
      }

      const { tempSession, code, recaptchaToken } = req.body;

      // Verify reCAPTCHA Enterprise v3 when configured
      if (process.env.RECAPTCHA_SECRET_KEY) {
        const recaptchaResult = await verifyRecaptcha(recaptchaToken, 'ADMIN_2FA_VERIFY');
        if (!recaptchaResult.success) {
          console.warn(`🤖 reCAPTCHA Enterprise failed for admin 2FA: [${correlationId}] - Score: ${recaptchaResult.score}, Reason: ${recaptchaResult.reason}`);
          return res.status(400).json({ 
            error: 'Security verification failed. Please try again.',
            code: 'RECAPTCHA_FAILED'
          });
        }
        console.log(`✅ reCAPTCHA Enterprise passed for admin 2FA - Score: ${recaptchaResult.score}`);
      }

      // Validate temporary session
      const tempSessions = req.app.locals.tempAdminSessions || new Map();
      const sessionData = tempSessions.get(tempSession);
      
      if (!sessionData) {
        console.warn(`❌ Invalid or expired 2FA session [${correlationId}]`);
        return res.status(401).json({ error: 'Invalid or expired session. Please login again.' });
      }

      // Check session expiration
      if (new Date() > sessionData.expiresAt) {
        tempSessions.delete(tempSession);
        console.warn(`⏰ Expired 2FA session for admin: ${sessionData.username} [${correlationId}]`);
        return res.status(401).json({ error: 'Session expired. Please login again.' });
      }

      // Get admin user
      const AdminUser = require('../models/AdminUser');
      const admin = await AdminUser.findById(sessionData.adminId);
      if (!admin || !admin.isActive) {
        tempSessions.delete(tempSession);
        console.warn(`👤 Admin not found or inactive during 2FA: ${sessionData.username} [${correlationId}]`);
        return res.status(401).json({ error: 'Invalid session. Please login again.' });
      }

      // Verify 2FA code
      const speakeasy = require('speakeasy');
      const verified = speakeasy.totp.verify({
        secret: admin.twoFactorSecret,
        encoding: 'base32',
        token: code,
        window: 2 // Allow 2 time steps before/after current
      });

      if (!verified) {
        await logSecurityEvent(admin, 'admin_2fa_failed', req, { 
          correlationId,
          loginType: 'admin'
        });
        console.warn(`❌ Invalid 2FA code for admin: ${admin.username} [${correlationId}]`);
        return res.status(401).json({ error: 'Invalid verification code' });
      }

      // Clean up temporary session
      tempSessions.delete(tempSession);

      // Generate final JWT token
      const secretsSvc = require('../config/secrets');
      const secrets = await secretsSvc.initialize();
      
      const token = jwt.sign(
        {
          userId: admin._id.toString(),
          role: admin.role || 'admin',
          username: admin.username,
          permissions: admin.permissions && admin.permissions.length ? admin.permissions : ['*']
        },
        secrets.adminJwtSecret,
        { algorithm: 'HS256', issuer: 'pizza-platform', audience: 'admin-dashboard', expiresIn: '2h' }
      );

      await logSecurityEvent(admin, 'admin_login_success', req, { 
        correlationId,
        loginType: 'admin',
        require2FA: true,
        twoFactorVerified: true
      });
      console.log(`✅ Admin 2FA login successful: ${admin.username} [${correlationId}]`);

      return res.json({
        success: true,
        token,
        username: admin.username,
        email: admin.email,
        permissions: admin.permissions || ['*']
      });

    } catch (error) {
      console.error('Admin 2FA verification error:', error);
      res.status(500).json({ error: '2FA verification failed' });
    }
  }
);

// Authentication middleware for admin routes
const requireAdminAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Admin token required' });
    }

    const secrets = await secretManager.initialize();
    const decoded = jwt.verify(token, secrets.adminJwtSecret);
    
    // Secure admin check - use proper admin user model
    const AdminUser = require('../models/AdminUser');
    const adminUser = await AdminUser.findById(decoded.userId);
    if (!adminUser || !adminUser.isActive || adminUser.role !== 'admin') {
      await logSecurityEvent(null, 'unauthorized_admin_access_attempt', req, {
        token: token.substring(0, 10) + '...',
        userId: decoded.userId
      });
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    // Additional permission check
    if (adminUser.permissions && adminUser.permissions.length > 0) {
      const hasRequiredPermission = adminUser.permissions.includes('platform.admin') || 
                                   adminUser.permissions.includes('*');
      if (!hasRequiredPermission) {
        return res.status(403).json({ error: 'Insufficient admin permissions' });
      }
    }
    
    req.admin = adminUser;
    next();
  } catch (error) {
    console.error('Admin auth error:', error);
    return res.status(403).json({ error: 'Invalid admin token' });
  }
};

/**
 * @route GET /api/admin/dashboard
 * @desc Get admin dashboard overview
 * @access Private (Admin)
 */
router.get('/dashboard', adminLimiter, requireAdminAuth, async (req, res) => {
  try {
    // Get platform statistics
    const [
      totalUsers,
      totalBusinesses,
      totalTransactions,
      vaultAnalytics,
      kycStats
    ] = await Promise.all([
      User.countDocuments(),
      Business.countDocuments(),
      Transaction.countDocuments(),
      vaultService.getPlatformVaultAnalytics(),
      kycService.getKYCStatistics()
    ]);

    // Get business type breakdown
    const businessBreakdown = await Business.aggregate([
      {
        $group: {
          _id: '$businessType',
          count: { $sum: 1 },
          verified: { $sum: { $cond: ['$isVerified', 1, 0] } }
        }
      }
    ]);

    // Get recent transactions
    const recentTransactions = await Transaction.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('userId', 'email')
      .populate('businessId', 'businessName businessType');

    res.json({
      success: true,
      dashboard: {
        users: {
          total: totalUsers,
          kycVerified: kycStats.totalVerified || 0,
          kycPending: totalUsers - (kycStats.totalVerified || 0)
        },
        businesses: {
          total: totalBusinesses,
          breakdown: businessBreakdown,
          cnCount: businessBreakdown.find(b => b._id === 'CN')?.count || 0
        },
        transactions: {
          total: totalTransactions,
          fixedAmountTransactions: totalTransactions, // All are $15 now
          totalVolume: totalTransactions * 15 // Fixed $15 per transaction
        },
        platformVault: vaultAnalytics,
        kycStatistics: kycStats,
        recentActivity: recentTransactions
      },
      systemHealth: {
        unified_vault: 'operational',
        ramp_integration: 'operational',
        moonpay_backup: 'operational',
        jupiter_dex: 'operational',
        kamino_staking: 'operational'
      }
    });

  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.status(500).json({ error: 'Failed to load admin dashboard' });
  }
});

/**
 * @route GET /api/admin/businesses
 * @desc Get all businesses with filtering and pagination
 * @access Private (Admin)
 */
router.get('/businesses',
  adminLimiter,
  requireAdminAuth,
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1-100'),
    query('businessType').optional().isIn(['CN']).withMessage('Business type must be CN'),
    query('status').optional().isIn(['verified', 'unverified', 'pending']).withMessage('Invalid status')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
      }

      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const skip = (page - 1) * limit;

      // Build filter
      let filter = {};
      // Secure query filtering - prevent NoSQL injection (CN only now)
      if (req.query.businessType && req.query.businessType === 'CN') {
        filter.businessType = 'CN';
      }
      if (req.query.status && ['verified', 'unverified'].includes(req.query.status)) {
        filter.isVerified = req.query.status === 'verified';
      }

      const [businesses, totalCount] = await Promise.all([
        Business.find(filter)
          .populate('ownerId', 'email')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit),
        Business.countDocuments(filter)
      ]);

      res.json({
        success: true,
        businesses: businesses.map(business => ({
          id: business._id,
          businessName: business.businessName,
          businessType: business.businessType,
          category: business.category,
          walletAddress: business.businessWallet?.publicKey || 'Not linked',
          isVerified: business.isVerified,
          owner: business.ownerId?.email,
          settlement: business.settlement,
          vaultContribution: business.vaultContribution,
          loyaltyProgram: business.loyaltyProgram,
          createdAt: business.createdAt
        })),
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          totalCount,
          hasNextPage: page < Math.ceil(totalCount / limit),
          hasPrevPage: page > 1
        }
      });

    } catch (error) {
      console.error('Admin businesses list error:', error);
      res.status(500).json({ error: 'Failed to retrieve businesses' });
    }
  }
);

/**
 * @route PUT /api/admin/business/:businessId/verify
 * @desc Verify a business
 * @access Private (Admin)
 */
router.put('/business/:businessId/verify',
  adminLimiter,
  requireAdminAuth,
  async (req, res) => {
    try {
      const { businessId } = req.params;
      const { verified, notes } = req.body;

      const business = await Business.findById(businessId);
      if (!business) {
        return res.status(404).json({ error: 'Business not found' });
      }

      business.isVerified = verified;
      if (notes) {
        business.verificationNotes = notes;
      }
      business.verifiedAt = verified ? new Date() : null;
      business.verifiedBy = req.admin._id;

      await business.save();

      console.log(`📋 Business ${verified ? 'verified' : 'unverified'}: ${business.businessName} by admin ${req.admin.email}`);

      res.json({
        success: true,
        message: `Business ${verified ? 'verified' : 'verification revoked'} successfully`,
        business: {
          id: business._id,
          businessName: business.businessName,
          businessType: business.businessType,
          isVerified: business.isVerified,
          verifiedAt: business.verifiedAt
        }
      });

    } catch (error) {
      console.error('Business verification error:', error);
      res.status(500).json({ error: 'Failed to update business verification' });
    }
  }
);

/**
 * @route GET /api/admin/vault/analytics
 * @desc Get detailed platform vault analytics
 * @access Private (Admin)
 */
router.get('/vault/analytics',
  adminLimiter,
  requireAdminAuth,
  async (req, res) => {
    try {
      const timeframe = req.query.timeframe || '30d';
      const analytics = await vaultService.getPlatformVaultAnalytics(timeframe);

      res.json({
        success: true,
        vaultAnalytics: analytics,
        systemDesign: {
          unifiedVault: 'All businesses contribute 1.3% to single platform vault',
          fixedRewards: '0.3 $PIZZA SPL per $15 transaction ($0.15 cost)',
          annualSurplus: '$2,320.06 per business after rewards',
          kaminoStaking: 'Optional 4% APY for CN businesses with 50/50 yield split'
        }
      });

    } catch (error) {
      console.error('Vault analytics error:', error);
      res.status(500).json({ error: 'Failed to retrieve vault analytics' });
    }
  }
);

/**
 * @route GET /api/admin/transactions
 * @desc Get transaction history with advanced filtering
 * @access Private (Admin)
 */
router.get('/transactions',
  adminLimiter,
  requireAdminAuth,
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('type').optional().isIn(['payment', 'pizza_spl_swap', 'reward_distribution', 'gift_card_mint', 'investment_token_conversion']),
    query('status').optional().isIn(['pending', 'confirmed', 'failed']),
    query('businessType').optional().isIn(['CN'])
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
      }

      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
      const skip = (page - 1) * limit;

      // Build filter
      let filter = {};
      if (req.query.type) filter.type = req.query.type;
      if (req.query.status) filter.status = req.query.status;
      if (req.query.businessType) filter['businessInfo.type'] = req.query.businessType;

      const [transactions, totalCount] = await Promise.all([
        Transaction.find(filter)
          .populate('userId', 'email')
          .populate('businessId', 'businessName businessType')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit),
        Transaction.countDocuments(filter)
      ]);

      res.json({
        success: true,
        transactions,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          totalCount
        },
        summary: {
          fixedTransactionAmount: '$15 USDC',
          fixedRewardAmount: '0.3 $PIZZA SPL',
          vaultContributionRate: '1.3%',
          platformFeeRate: '1.0%' // CN businesses only
        }
      });

    } catch (error) {
      console.error('Admin transactions error:', error);
      res.status(500).json({ error: 'Failed to retrieve transactions' });
    }
  }
);

/**
 * @route GET /api/admin/users/kyc-pending
 * @desc Get users with pending KYC verification
 * @access Private (Admin)
 */
router.get('/users/kyc-pending',
  adminLimiter,
  requireAdminAuth,
  async (req, res) => {
    try {
      const pendingUsers = await User.find({
        'kyc.status': 'pending'
      }).select('email kyc createdAt');

      res.json({
        success: true,
        pendingKYC: pendingUsers,
        count: pendingUsers.length,
        kycPurpose: 'Investment token conversion only (10 $PIZZA SPL + $0.10 USDC → 1 investment token)',
        providers: {
          primary: 'Ramp ($0.50/customer)',
          backup: 'MoonPay ($0.50/customer)'
        }
      });

    } catch (error) {
      console.error('Pending KYC users error:', error);
      res.status(500).json({ error: 'Failed to retrieve pending KYC users' });
    }
  }
);

/**
 * @route POST /api/admin/gift-cards/expired/cleanup
 * @desc Clean up expired gift cards (revert to treasury)
 * @access Private (Admin)
 */
router.post('/gift-cards/expired/cleanup',
  adminLimiter,
  requireAdminAuth,
  async (req, res) => {
    try {
      const GiftCardService = require('../services/giftCardService');
      const giftCardService = new GiftCardService();

      const cleanupResult = await giftCardService.processExpiredGiftCards();

      res.json({
        success: true,
        message: 'Expired gift cards processed',
        cleanupResult,
        treasuryPolicy: '30-day expiry, unused cards revert to treasury'
      });

    } catch (error) {
      console.error('Gift card cleanup error:', error);
      res.status(500).json({ error: 'Failed to process expired gift cards' });
    }
  }
);

/**
 * @route GET /api/admin/financial-overview
 * @desc Get comprehensive financial overview
 * @access Private (Admin)
 */
router.get('/financial-overview',
  adminLimiter,
  requireAdminAuth,
  async (req, res) => {
    try {
      // Get transaction stats for CN businesses only
      const cnStats = await Transaction.getBusinessTypeStats('CN');

      // Get vault contribution summary
      const vaultSummary = await Transaction.getVaultContributionSummary();

      const overview = {
        businessTypes: {
          CN: {
            businesses: cnStats[0]?.uniqueBusinessCount || 0,
            transactions: cnStats[0]?.totalTransactions || 0,
            volume: cnStats[0]?.totalVolume || 0,
            platformFees: cnStats[0]?.totalPlatformFees || 0,
            vaultContributions: cnStats[0]?.totalVaultContributions || 0,
            feeStructure: '1.0% platform + 1.3% vault = 2.3% total',
            kaminoStaking: 'Optional 4% APY with 50/50 yield split'
          }
        },
        platformVault: {
          totalContributions: vaultSummary[0]?.totalVaultContributions || 0,
          rewardsDistributed: vaultSummary[0]?.totalRewardsDistributed || 0,
          surplus: vaultSummary[0]?.vaultSurplus || 0,
          contributingBusinesses: vaultSummary[0]?.contributingBusinessCount || 0,
          averageContributionPerTx: 0.195 // $0.195 per $15 transaction
        },
        projections: {
          annualRevenueCN: '$30,065.70 (10 businesses)', 
          totalProjectedRevenue: '$30,065.70',
          netProfit: '$19,361.35',
          breakEvenTimeframe: '12 months'
        }
      };

      res.json({
        success: true,
        financialOverview: overview
      });

    } catch (error) {
      console.error('Financial overview error:', error);
      res.status(500).json({ error: 'Failed to retrieve financial overview' });
    }
  }
);

/**
 * @route POST /api/admin/system/maintenance
 * @desc Trigger system maintenance tasks
 * @access Private (Admin)
 */
router.post('/system/maintenance',
  adminLimiter,
  requireAdminAuth,
  async (req, res) => {
    try {
      const { task } = req.body;

      let result = {};

      switch (task) {
        case 'process_expired_gift_cards':
          const GiftCardService = require('../services/giftCardService');
          const giftCardService = new GiftCardService();
          result = await giftCardService.processExpiredGiftCards();
          break;

        case 'update_vault_analytics':
          result = await vaultService.getPlatformVaultAnalytics('7d');
          break;

        case 'process_kamino_yields':
          // Process all CN businesses with active Kamino staking
          const cnBusinesses = await Business.find({ 
            businessType: 'CN',
            'loyaltyProgram.kamino.isActive': true 
          });
          
          for (const business of cnBusinesses) {
            await vaultService.processKaminoYieldDistribution(business._id);
          }
          
          result = { processedBusinesses: cnBusinesses.length };
          break;

        default:
          return res.status(400).json({ error: 'Unknown maintenance task' });
      }

      res.json({
        success: true,
        message: `Maintenance task '${task}' completed`,
        result
      });

    } catch (error) {
      console.error('System maintenance error:', error);
      res.status(500).json({ error: 'Maintenance task failed' });
    }
  }
);

module.exports = router;