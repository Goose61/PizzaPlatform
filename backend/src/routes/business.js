const express = require('express');
const crypto = require('crypto');
const { body, param, query, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const fetch = require('node-fetch'); // For reCAPTCHA verification
const Business = require('../models/Business');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const BusinessTypeService = require('../services/businessTypeService');
const { getClientIP, getUserAgent, getSecurityInfo, generateCorrelationId } = require('../utils/ipHelper');
// Ramp service removed - no longer needed in vendor-only system
const VaultService = require('../services/vaultService');
const GiftCardService = require('../services/giftCardService');
const TransactionService = require('../services/transactionService');
const { requireAuth, require2FA } = require('../middleware/auth');

const router = express.Router();
const jwt = require('jsonwebtoken');
const secretManager = require('../config/secrets');
const businessTypeService = new BusinessTypeService();
// Ramp service instance removed
const vaultService = new VaultService();
const giftCardService = new GiftCardService();
const transactionService = new TransactionService();

// JWT auth for business/user endpoints
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Access token required' });
    const secrets = await secretManager.initialize();
    const decoded = jwt.verify(token, secrets.jwtSecret, {
      algorithms: ['HS256'],
      issuer: 'pizza-platform',
      audience: 'user-api'
    });
    const user = await User.findById(decoded.userId);
    if (!user || !user.isActive) return res.status(403).json({ error: 'Invalid or inactive user' });
    req.user = user;
    next();
  } catch (error) {
    console.error('Business JWT auth error:', error.message);
    return res.status(403).json({ error: 'Invalid token' });
  }
};

// Rate limiter for business operations
const businessLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 business operations per 15 minutes
  message: { error: 'Too many business requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

// Validation middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      error: 'Validation failed', 
      details: errors.array() 
    });
  }
  next();
};

/**
 * @route POST /api/business/register
 * @desc Register a new CN business
 * @access Private
 */
router.post('/register', 
  businessLimiter,
  requireAuth, 
  require2FA,
  [
    body('businessName').isLength({ min: 2, max: 100 }).trim().withMessage('Business name required (2-100 characters)'),
    body('category').isString().isLength({ min: 2, max: 50 }).withMessage('Business category required'),
    body('taxId').isString().isLength({ min: 9, max: 20 }).withMessage('Valid tax ID required'),
    body('address.street').isString().withMessage('Street address required'),
    body('address.city').isString().withMessage('City required'),
    body('address.state').isString().withMessage('State required'),
    body('address.zipCode').isString().withMessage('ZIP code required'),
    body('contact.email').isEmail().normalizeEmail().withMessage('Valid contact email required'),
    body('contact.phone').isString().withMessage('Contact phone required')
  ],
  handleValidationErrors,
  async (req, res) => {
    const correlationId = generateCorrelationId();
    const securityInfo = getSecurityInfo(req);
    
    try {
      const {
        businessName,
        category,
        businessDescription,
        website,
        taxId,
        address,
        contact,
        walletAddress // For CN businesses
      } = req.body;
      
      const user = await User.findById(req.session.userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      // Check if business with this tax ID already exists
      const existingBusiness = await Business.findOne({ taxId: taxId.trim() });
      if (existingBusiness) {
        return res.status(409).json({
          error: 'A business with this Tax ID is already registered'
        });
      }
      
      // Check if user already has a business (limit to one per user)
      const existingUserBusiness = await Business.findOne({ ownerId: user._id });
      if (existingUserBusiness) {
        return res.status(400).json({
          error: 'User already has a registered business. Multiple businesses per user not supported.'
        });
      }
      
      // Create CN business
      const business = new Business({
        businessName: businessName.trim(),
        businessType: 'CN', // All businesses are CN (Crypto Native)
        businessCategory: category.trim(),
        businessDescription: businessDescription?.trim(),
        website: website?.trim(),
        taxId: taxId.trim(),
        // Registration IP tracking for security
        registrationIP: securityInfo.ip,
        registrationUserAgent: securityInfo.userAgent,
        registrationTimestamp: new Date(),
        address: {
          street: address.street.trim(),
          city: address.city.trim(),
          state: address.state.trim(),
          zipCode: address.zipCode.trim(),
          country: address.country?.trim() || 'US'
        },
        contact: {
          name: contact.name?.trim() || user.email,
          email: contact.email.toLowerCase().trim(),
          phone: contact.phone.trim()
        },
        ownerId: user._id,
        // Business wallet will be created after registration
        businessWallet: {
          publicKey: '', // Will be set during type classification
          encryptedPrivateKey: ''
        },
        // Initialize CN business settings
        vaultContribution: {
          totalContributed: 0,
          dailyTarget: 19.50, // $0.195 * 100 transactions/day
          annualTarget: 7117.50 // $7,117.50/year
        },
        settlement: {
          method: 'usdc-retain', // CN businesses retain USDC
          dailyAmount: 0,
          rampAccountId: null
        },
        loyaltyProgram: {
          isActive: true, // CN businesses can have custom loyalty programs
          discountRules: [],
          nftRewards: [],
          creditRules: {
            conversionRate: 0, // Disabled by default
            redemptionRate: 0
          },
          kamino: {
            isActive: false, // Optional for CN businesses
            totalStaked: 0,
            totalYieldGenerated: 0,
            totalYieldToBusiness: 0,
            totalYieldToPlatform: 0
          }
        }
      });
      
      // Classify and setup CN business
      const classificationResult = await businessTypeService.classifyBusiness({
        businessId: business._id,
        businessType: 'CN',
        bankAccount: null
      });
      
      // Update business with classification results
      business.businessWallet.publicKey = classificationResult.walletAddress;
      business.settlement.rampAccountId = classificationResult.rampAccountId;
      
      await business.save();
      
      console.log(`🏢 CN business registered: ${businessName} by ${user.email} [${correlationId}]`);
      
      res.status(201).json({
        success: true,
        message: 'CN business registered successfully',
        business: {
          id: business._id,
          businessName: business.businessName,
          businessType: 'CN',
          category: business.category,
          walletAddress: business.businessWallet?.publicKey || 'Not linked',
          feeStructure: {
            platformFee: '1%',
            vaultContribution: '1.3%',
            totalFees: '2.3%'
          },
          settlement: business.settlement,
          vaultDetails: {
            annualContribution: '$7,117.50',
            rewardFunding: '$4,797.44',
            giftCardFunding: '$600',
            surplus: '$2,320.06'
          }
        },
        nextSteps: [
          'Optionally enable Kamino staking (4% APY with 50/50 yield split)',
          'Configure custom loyalty program rules',
          'Set up business profile and location'
        ]
      });
      
    } catch (error) {
      console.error(`❌ Business registration error [${correlationId}]:`, error);
      res.status(500).json({
        error: 'Business registration failed',
        correlationId
      });
    }
  }
);

/**
 * @route GET /api/business/profile
 * @desc Get business profile and analytics
 * @access Private
 */
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const business = await Business.findOne({ ownerId: req.user._id });
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }
    
    // Get business analytics
    const analytics = await getBusinessAnalytics(business._id);
    
    res.json({
      success: true,
      business: {
        id: business._id,
        businessName: business.businessName,
        businessType: business.businessType,
        category: business.category,
        address: business.address,
        contact: business.contact,
        walletAddress: business.businessWallet?.publicKey || 'Not linked',
        isVerified: business.isVerified,
        settings: business.settings
      },
      feeStructure: {
        platformFee: 1.0, // CN businesses have 1% platform fee
        vaultContribution: 1.3,
        totalFees: 2.3 // CN businesses have 2.3% total fees
      },
      settlement: business.settlement,
      vaultContribution: business.vaultContribution,
      loyaltyProgram: business.loyaltyProgram,
      analytics
    });
    
  } catch (error) {
    console.error('Business profile error:', error);
    res.status(500).json({ error: 'Failed to retrieve business profile' });
  }
});

/**
 * @route PUT /api/business/update-settlement
 * @desc Update CN business settlement preferences
 * @access Private
 */
router.put('/update-settlement',
  businessLimiter,
  requireAuth,
  [
    body('method').isIn(['fiat-conversion', 'usdc-retain']).withMessage('Invalid settlement method'),
    body('dailyAmount').optional().isFloat({ min: 0 }).withMessage('Daily amount must be positive')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { method, dailyAmount, bankAccount } = req.body;
      
      const business = await Business.findOne({ ownerId: req.session.userId });
      if (!business) {
        return res.status(404).json({ error: 'Business not found' });
      }
      
      // Validate settlement method for CN businesses
      if (method !== 'usdc-retain') {
        return res.status(400).json({
          error: 'CN businesses must use usdc-retain settlement'
        });
      }
      
      // Update settlement preferences
      business.settlement.method = method;
      if (dailyAmount !== undefined) {
        business.settlement.dailyAmount = dailyAmount;
      }
      
      // CN businesses don't need bank account updates
      
      await business.save();
      
      res.json({
        success: true,
        message: 'Settlement preferences updated',
        settlement: business.settlement
      });
      
    } catch (error) {
      console.error('Settlement update error:', error);
      res.status(500).json({ error: 'Failed to update settlement preferences' });
    }
  }
);

/**
 * @route POST /api/business/enable-kamino-staking
 * @desc Enable Kamino staking for CN businesses
 * @access Private
 */
router.post('/enable-kamino-staking',
  businessLimiter,
  authenticateToken,
  async (req, res) => {
    try {
      const business = await Business.findOne({ ownerId: req.session.userId });
      if (!business) {
        return res.status(404).json({ error: 'Business not found' });
      }
      
      // All businesses are CN now, so Kamino staking is available
      
      if (business.loyaltyProgram.kamino?.isActive) {
        return res.status(400).json({
          error: 'Kamino staking is already enabled'
        });
      }
      
      // Enable Kamino staking
      business.loyaltyProgram.kamino.isActive = true;
      await business.save();
      
      res.json({
        success: true,
        message: 'Kamino staking enabled',
        staking: {
          isActive: true,
          expectedAPY: '4%',
          yieldSplit: '50% to business, 50% to platform',
          estimatedAnnualYield: '$238.14 total ($119.07 to business)',
          vaultContribution: '$7,117.50/year'
        }
      });
      
    } catch (error) {
      console.error('Kamino staking enable error:', error);
      res.status(500).json({ error: 'Failed to enable Kamino staking' });
    }
  }
);

/**
 * @route POST /api/business/loyalty-program/update
 * @desc Update custom loyalty program (CN businesses only)
 * @access Private
 */
router.post('/loyalty-program/update',
  businessLimiter,
  requireAuth,
  [
    body('discountRules').optional().isArray().withMessage('Discount rules must be an array'),
    body('nftRewards').optional().isArray().withMessage('NFT rewards must be an array'),
    body('creditRules.conversionRate').optional().isFloat({ min: 0 }).withMessage('Conversion rate must be positive')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { discountRules, nftRewards, creditRules } = req.body;
      
      const business = await Business.findOne({ ownerId: req.session.userId });
      if (!business) {
        return res.status(404).json({ error: 'Business not found' });
      }
      
      // All businesses are CN now, so custom loyalty programs are available
      
      // Update loyalty program
      if (discountRules) {
        business.loyaltyProgram.discountRules = discountRules;
      }
      if (nftRewards) {
        business.loyaltyProgram.nftRewards = nftRewards;
      }
      if (creditRules) {
        business.loyaltyProgram.creditRules = {
          ...business.loyaltyProgram.creditRules,
          ...creditRules
        };
      }
      
      business.loyaltyProgram.isActive = true;
      await business.save();
      
      res.json({
        success: true,
        message: 'Loyalty program updated',
        loyaltyProgram: business.loyaltyProgram,
        examples: {
          discounts: 'Hold 3 $PIZZA SPL = 10% discount',
          nfts: 'Hold 20 $PIZZA SPL = exclusive NFT',
          storeCredit: 'Convert 10 $PIZZA SPL = $1 store credit'
        }
      });
      
    } catch (error) {
      console.error('Loyalty program update error:', error);
      res.status(500).json({ error: 'Failed to update loyalty program' });
    }
  }
);

/**
 * @route POST /api/business/gift-cards/mint-batch
 * @desc Mint batch of gift card NFTs (100 per month limit)
 * @access Private
 */
router.post('/gift-cards/mint-batch',
  businessLimiter,
  authenticateToken,
  [
    body('quantity').isInt({ min: 1, max: 100 }).withMessage('Quantity must be between 1-100'),
    body('customMessage').optional().isString().withMessage('Custom message must be string')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { quantity, customMessage } = req.body;
      
      const business = await Business.findOne({ ownerId: req.session.userId });
      if (!business) {
        return res.status(404).json({ error: 'Business not found' });
      }
      
      // Check monthly quota
      const currentMonthCount = await giftCardService.getCurrentMonthMintCount(business._id);
      if (currentMonthCount + quantity > 100) {
        return res.status(400).json({
          error: `Monthly gift card limit exceeded. Current: ${currentMonthCount}, Requested: ${quantity}, Limit: 100`
        });
      }
      
      // Mint gift cards
      const results = [];
      for (let i = 0; i < quantity; i++) {
        const result = await giftCardService.mintGiftCard({
          businessId: business._id,
          recipientWalletAddress: null, // Will be set when distributed
          customMessage: customMessage || `Gift card from ${business.businessName}`,
          campaignId: `batch_${Date.now()}`
        });
        results.push(result);
      }
      
      const successCount = results.filter(r => r.success).length;
      const totalCost = successCount * 0.50;
      
      res.json({
        success: true,
        message: `${successCount}/${quantity} gift cards minted successfully`,
        results: results,
        cost: totalCost,
        remainingMonthlyQuota: 100 - currentMonthCount - successCount,
        giftCardDetails: {
          value: '5 $PIZZA SPL each',
          expiryPeriod: '30 days',
          mintingCost: '$0.50 each',
          businessFunded: true
        }
      });
      
    } catch (error) {
      console.error('Gift card batch minting error:', error);
      res.status(500).json({ error: 'Failed to mint gift cards' });
    }
  }
);

/**
 * @route GET /api/business/analytics
 * @desc Get comprehensive business analytics
 * @access Private
 */
router.get('/analytics', requireAuth, async (req, res) => {
  try {
    const business = await Business.findOne({ ownerId: req.session.userId });
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }
    
    const analytics = await getBusinessAnalytics(business._id);
    
    res.json({
      success: true,
      analytics
    });
    
  } catch (error) {
    console.error('Business analytics error:', error);
    res.status(500).json({ error: 'Failed to retrieve business analytics' });
  }
});

/**
 * @route GET /api/business/vault-status
 * @desc Get business vault contribution status
 * @access Private
 */
router.get('/vault-status', requireAuth, async (req, res) => {
  try {
    const business = await Business.findOne({ ownerId: req.session.userId });
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }
    
    const vaultAnalytics = await vaultService.getPlatformVaultAnalytics();
    
    res.json({
      success: true,
      vaultContribution: business.vaultContribution,
      platformVault: {
        totalContributions: vaultAnalytics.totalContributions,
        currentBalance: vaultAnalytics.currentBalance,
        surplus: vaultAnalytics.vaultSurplus
      },
      kamino: business.loyaltyProgram?.kamino || null,
      projections: {
        annualContribution: '$7,117.50',
        rewardsFunded: '$4,797.44',
        giftCardsFunded: '$600',
        expectedSurplus: '$2,320.06'
      }
    });
    
  } catch (error) {
    console.error('Vault status error:', error);
    res.status(500).json({ error: 'Failed to retrieve vault status' });
  }
});

/**
 * Helper function to get business analytics
 */
async function getBusinessAnalytics(businessId) {
  try {
    // Get transaction stats
    const transactionStats = await Transaction.getBusinessTypeStats('CN', null, null);
    
    // Get payment volume
    const dailyVolume = await Transaction.getDailyVolume(30);
    
    // Get vault contribution summary
    const vaultSummary = await Transaction.getVaultContributionSummary();
    
    return {
      transactions: {
        total: transactionStats[0]?.totalTransactions || 0,
        volume: transactionStats[0]?.totalVolume || 0,
        averageValue: 15, // Fixed $15 transactions
        successRate: transactionStats[0]?.settlementRate || 0
      },
      fees: {
        totalPlatformFees: transactionStats[0]?.totalPlatformFees || 0,
        totalVaultContributions: transactionStats[0]?.totalVaultContributions || 0,
        netRevenue: transactionStats[0]?.totalPlatformFees || 0
      },
      rewards: {
        totalDistributed: transactionStats[0]?.totalRewardsDistributed || 0,
        averagePerTransaction: 0.3 // Fixed 0.3 $PIZZA SPL per transaction
      },
      dailyVolume: dailyVolume,
      vaultSummary: vaultSummary[0] || {}
    };
  } catch (error) {
    console.error('Analytics calculation error:', error);
    return {
      transactions: { total: 0, volume: 0, averageValue: 15, successRate: 0 },
      fees: { totalPlatformFees: 0, totalVaultContributions: 0, netRevenue: 0 },
      rewards: { totalDistributed: 0, averagePerTransaction: 0.3 },
      dailyVolume: [],
      vaultSummary: {}
    };
  }
}

// Get business profile for dashboard  
router.get('/profile',
  businessLimiter,
  authenticateToken,
  async (req, res) => {
    try {
      const business = await Business.findOne({ ownerId: req.user._id });
      if (!business) {
        return res.status(404).json({ error: 'Business not found' });
      }

      // Get analytics data (placeholder)
      const analytics = {
        totalRevenue: business.monthlyMetrics?.totalRevenue || 0,
        totalTransactions: business.monthlyMetrics?.totalTransactions || 0,
        averageTransaction: business.monthlyMetrics?.averageTransactionAmount || 0,
        dailyTransactions: [], // Add daily data if needed
        monthlyRevenue: [] // Add monthly data if needed
      };

      res.json({
        success: true,
        business: {
          _id: business._id,
          businessName: business.businessName,
          businessType: 'CN',
          businessCategory: business.businessCategory,
          isActive: business.isActive,
          kycStatus: business.kycStatus,
          contact: business.contact,
          address: business.address,
          feeStructure: business.feeStructure,
          settlement: business.settlement,
          createdAt: business.createdAt
        },
        analytics
      });
    } catch (error) {
      console.error('Business profile error:', error);
      res.status(500).json({ error: 'Failed to load business profile' });
    }
  }
);

// Additional endpoints required by frontend

// Business info (public for display during checkout)
router.get('/info/:businessId', async (req, res) => {
  try {
    const { businessId } = req.params;
    const business = await Business.findById(businessId).select('businessName businessType category');
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }
    res.json({
      businessName: business.businessName,
      businessType: 'CN',
      category: business.category
    });
  } catch (error) {
    console.error('Business info error:', error);
    res.status(500).json({ error: 'Failed to load business info' });
  }
});

// Helper function for reCAPTCHA Enterprise v3 verification with scoring
async function verifyRecaptcha(token, expectedAction = 'LOGIN') {
  if (!process.env.RECAPTCHA_SITE_KEY || !process.env.RECAPTCHA_SECRET_KEY) {
    console.warn('⚠️ Warning: reCAPTCHA Enterprise not configured for business login');
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
    console.log(`🛡️ reCAPTCHA Enterprise score: ${score} for action: ${expectedAction}`);
    
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
    await user.addSecurityEvent(
      eventType,
      req.ip,
      req.get('User-Agent'),
      correlationId,
      details
    );
  } catch (error) {
    console.error('Security event logging failed:', error);
  }
}

// Enhanced rate limiter for authentication
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 login attempts per 15 minutes
  message: { error: 'Too many login attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

// Business login endpoint (CN businesses only)
router.post('/login',
  authLimiter, // Use proper auth rate limiter, not business limiter
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 1, max: 128 }).withMessage('Password is required'),
    body('recaptchaToken').optional().isString().withMessage('Invalid reCAPTCHA token')
  ],
  handleValidationErrors,
  async (req, res) => {
    const correlationId = generateCorrelationId();
    const securityInfo = getSecurityInfo(req);
    
    try {
      const { email, password, recaptchaToken } = req.body;
      
      // Verify reCAPTCHA Enterprise v3 when configured and token provided
      if (process.env.RECAPTCHA_SECRET_KEY && recaptchaToken) {
        const recaptchaResult = await verifyRecaptcha(recaptchaToken, 'LOGIN');
        if (!recaptchaResult.success) {
          await logSecurityEvent(user || { email }, 'recaptcha_failed', req, { 
            reason: recaptchaResult.reason,
            score: recaptchaResult.score,
            threshold: recaptchaResult.threshold,
            correlationId,
            loginType: 'business'
          });
          console.warn(`🤖 reCAPTCHA Enterprise failed for business login: ${email} [${correlationId}] - Score: ${recaptchaResult.score}, Reason: ${recaptchaResult.reason}`);
          return res.status(400).json({ 
            error: 'Security verification failed. Please try again.',
            code: 'RECAPTCHA_FAILED'
          });
        }
        console.log(`✅ reCAPTCHA Enterprise passed for ${email} - Score: ${recaptchaResult.score}`);
      } else if (!recaptchaToken) {
        console.log(`⚠️ reCAPTCHA token not provided for business login: ${email} [${correlationId}] - continuing in development mode`);
      }
      
      const user = await User.findByEmail(email);
      if (!user) {
        console.warn(`👤 Business login attempt for non-existent user: ${email} [${correlationId}]`);
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      // Check if account is locked
      if (user.isLocked) {
        await logSecurityEvent(user, 'login_failed', req, { 
          reason: 'account_locked',
          correlationId,
          loginType: 'business'
        });
        console.warn(`🔒 Business login attempt on locked account: ${email} [${correlationId}]`);
        return res.status(423).json({ 
          error: 'Account temporarily locked due to too many failed attempts' 
        });
      }
      
      // Check if email is verified
      if (!user.isEmailVerified) {
        await logSecurityEvent(user, 'login_failed', req, { 
          reason: 'email_not_verified',
          correlationId,
          loginType: 'business'
        });
        console.warn(`📧 Business login with unverified email: ${email} [${correlationId}]`);
        return res.status(403).json({ 
          error: 'Please verify your email before logging in' 
        });
      }

      // Verify password
      const isValid = await user.comparePassword(password);
      if (!isValid) {
        await user.incrementLoginAttempts();
        // Track failed login attempt with IP
        await user.addLoginAttempt(securityInfo.ip, securityInfo.userAgent, false);
        await logSecurityEvent(user, 'login_failed', req, { 
          reason: 'invalid_password',
          correlationId,
          loginType: 'business'
        });
        console.warn(`🔑 Invalid password for business login: ${email} [${correlationId}] from IP: ${securityInfo.ip}`);
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      // Reset failed login attempts on successful password verification
      if (user.failedLoginAttempts > 0) {
        await user.resetLoginAttempts();
      }

      // Find CN business for this user
      const business = await Business.findOne({ 
        ownerId: user._id, 
        businessType: 'CN' 
      });
      
      if (!business) {
        await logSecurityEvent(user, 'login_failed', req, { 
          reason: 'business_not_found',
          correlationId,
          loginType: 'business'
        });
        console.warn(`🏢 No CN business found for user: ${email} [${correlationId}]`);
        return res.status(403).json({ 
          error: 'No crypto-native business found for this account' 
        });
      }
      
      // Check if business is active and verified
      if (!business.isActive) {
        await logSecurityEvent(user, 'login_failed', req, { 
          reason: 'business_inactive',
          businessId: business._id,
          correlationId,
          loginType: 'business'
        });
        return res.status(403).json({ 
          error: 'Business account is inactive. Please contact support.' 
        });
      }

      // Update user login tracking  
      await user.addLoginAttempt(securityInfo.ip, securityInfo.userAgent, true);
      
      // Track business login access
      await business.addLoginAttempt(securityInfo.ip, securityInfo.userAgent, user._id, true);
      
      // Log successful business login
      await logSecurityEvent(user, 'login_success', req, { 
        businessId: business._id,
        businessType: 'CN',
        correlationId,
        loginType: 'business'
      });

      // Generate JWT token
      const secrets = await secretManager.initialize();
      const token = jwt.sign(
        { 
          userId: user._id.toString(), 
          businessId: business._id.toString(), 
          businessType: 'CN',
          role: 'business' 
        },
        secrets.jwtSecret,
        { 
          algorithm: 'HS256', 
          issuer: 'pizza-platform', 
          audience: 'user-api', 
          expiresIn: '2h' 
        }
      );

      console.log(`✅ CN Business login successful: ${email} [${correlationId}] from IP: ${securityInfo.ip}`);
      
      res.json({ 
        success: true, 
        token, 
        businessId: business._id.toString(),
        businessType: 'CN',
        businessName: business.businessName
      });
      
    } catch (error) {
      console.error(`❌ Business login error [${correlationId}]:`, error);
      res.status(500).json({ 
        error: 'Login failed',
        correlationId 
      });
    }
  }
);

// Get vault staking status for CN businesses
router.get('/vault/staking-status',
  businessLimiter,
  authenticateToken,
  async (req, res) => {
    try {
      // Only CN businesses can access staking
      const business = await Business.findById(req.user.businessId);
      if (!business || business.businessType !== 'CN') {
        return res.status(403).json({ 
          error: 'Staking only available for CN businesses' 
        });
      }

      await vaultService.initialize();
      const stakingStatus = vaultService.getStakingStatus();
      const businessDividends = vaultService.getMerchantStakingDividends(req.user.businessId);

      res.json({
        success: true,
        staking: {
          enabled: stakingStatus.enabled,
          apy: stakingStatus.apy || 0.04,
          stakingAmount: stakingStatus.stakingAmount || 0,
          totalYield: stakingStatus.totalYield || 0,
          businessShare: businessDividends.annualDividends || 0,
          monthlyDividends: businessDividends.monthlyDividends || 0,
          nextPayoutDate: businessDividends.nextPayoutDate,
          contributionRequired: businessDividends.contributionRequired || 7117.50,
          roi: businessDividends.roi || 0
        }
      });

    } catch (error) {
      console.error('Vault staking status error:', error);
      res.status(500).json({ 
        error: 'Failed to get staking status' 
      });
    }
  }
);

// Enable/Disable Kamino staking for CN business
router.post('/vault/toggle-staking',
  businessLimiter,
  authenticateToken,
  [
    body('enable').isBoolean().withMessage('Enable must be true or false')
  ],
  async (req, res) => {
    try {
      // Validate input
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          error: 'Invalid input', 
          details: errors.array() 
        });
      }

      // Only CN businesses can control staking
      const business = await Business.findById(req.user.businessId);
      if (!business || business.businessType !== 'CN') {
        return res.status(403).json({ 
          error: 'Staking only available for CN businesses' 
        });
      }

      const { enable } = req.body;

      await vaultService.initialize();
      const stakingResult = await vaultService.toggleKaminoStaking(enable);

      // Update business record
      business.stakingEnabled = enable;
      business.stakingEnabledDate = enable ? new Date() : null;
      await business.save();

      res.json({
        success: true,
        staking: stakingResult,
        message: enable ? 
          'Kamino staking enabled successfully' : 
          'Kamino staking disabled successfully'
      });

    } catch (error) {
      console.error('Toggle staking error:', error);
      res.status(500).json({ 
        error: 'Failed to toggle staking' 
      });
    }
  }
);

// Get vault analytics for business
router.get('/vault/analytics',
  businessLimiter,
  authenticateToken,
  async (req, res) => {
    try {
      const business = await Business.findById(req.user.businessId);
      if (!business) {
        return res.status(404).json({ 
          error: 'Business not found' 
        });
      }

      await vaultService.initialize();
      const vaultAnalytics = await vaultService.getVaultAnalytics();
      
      // Calculate business-specific contributions
      const businessContribution = business.totalVaultContributions || 0;
      const targetContribution = 7117.50; // Annual target
      const contributionProgress = (businessContribution / targetContribution) * 100;

      res.json({
        success: true,
        vault: {
          totalSize: vaultAnalytics.totalVaultSize,
          businessContribution: businessContribution,
          targetContribution: targetContribution,
          contributionProgress: Math.min(contributionProgress, 100),
          allocations: vaultAnalytics.allocations,
          utilizationRate: vaultAnalytics.utilizationRate,
          projections: vaultAnalytics.projections,
          health: vaultAnalytics.health
        }
      });

    } catch (error) {
      console.error('Vault analytics error:', error);
      res.status(500).json({ 
        error: 'Failed to get vault analytics' 
      });
    }
  }
);

// Update business wallet address
router.post('/update-wallet',
  businessLimiter,
  authenticateToken,
  [
    body('walletAddress').optional().isString().withMessage('Wallet address must be a string')
  ],
  async (req, res) => {
    try {
      // Validate input
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          error: 'Invalid input', 
          details: errors.array() 
        });
      }

      const { walletAddress } = req.body;
      
      // Find the business
      const business = await Business.findOne({ 
        ownerId: req.user._id,
        businessType: 'CN',
        isActive: true 
      });
      
      if (!business) {
        return res.status(404).json({ 
          error: 'Business not found' 
        });
      }
      
      // Validate wallet address format if provided
      if (walletAddress) {
        try {
          // Basic validation - should be base58 and correct length
          if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(walletAddress)) {
            throw new Error('Invalid wallet address format');
          }
        } catch (error) {
          return res.status(400).json({ 
            error: 'Invalid Solana wallet address format' 
          });
        }
      }
      
      // Update wallet address
      business.settlement.walletAddress = walletAddress;
      await business.save();
      
      res.json({
        success: true,
        message: walletAddress ? 'Wallet address updated successfully' : 'Wallet address removed successfully',
        walletAddress: walletAddress
      });
      
    } catch (error) {
      console.error('Update wallet error:', error);
      res.status(500).json({ 
        error: 'Failed to update wallet address' 
      });
    }
  }
);

// Get business transactions for export and display
router.get('/transactions',
  businessLimiter,
  authenticateToken,
  [
    query('startDate').optional().isISO8601().withMessage('Start date must be valid ISO format'),
    query('endDate').optional().isISO8601().withMessage('End date must be valid ISO format'),
    query('format').optional().isIn(['json', 'csv']).withMessage('Format must be json or csv'),
    query('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('Limit must be between 1 and 1000')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { startDate, endDate, format = 'json', limit = 50 } = req.query;
      
      // Find the business
      const business = await Business.findOne({ 
        ownerId: req.user._id,
        businessType: 'CN',
        isActive: true 
      });
      
      if (!business) {
        return res.status(404).json({ 
          error: 'Business not found' 
        });
      }
      
      // Initialize transaction service
      await transactionService.initialize();
      
      // Get transactions using the service
      const transactions = await transactionService.getBusinessTransactions(business._id, {
        startDate,
        endDate,
        limit: parseInt(limit)
      });
      
      if (format === 'csv') {
        // Helper function to properly escape CSV fields
        const escapeCSVField = (field) => {
          if (field === null || field === undefined) return '""';
          const str = String(field);
          // If field contains comma, quote, or newline, wrap in quotes and escape internal quotes
          if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        };
        
        // Create header row
        const headers = ['Date', 'Transaction ID', 'Amount (USDC)', 'Status', 'Customer Wallet', 'Platform Fee', 'Vault Contribution', 'Reward Amount'];
        const csvRows = [headers.map(escapeCSVField).join(',')];
        
        // Create data rows
        transactions.forEach(tx => {
          const row = [
            escapeCSVField(new Date(tx.createdAt).toLocaleDateString() + ' ' + new Date(tx.createdAt).toLocaleTimeString()),
            escapeCSVField(tx._id.toString()),
            escapeCSVField((tx.amount || 15).toFixed(2)),
            escapeCSVField((tx.status || 'confirmed').toUpperCase()),
            escapeCSVField(tx.walletAddress || 'N/A'),
            escapeCSVField((tx.fees?.platformFee || 0.15).toFixed(2)),
            escapeCSVField((tx.fees?.vaultContribution || 0.195).toFixed(3)),
            escapeCSVField((tx.rewards?.pizzaTokensDistributed || 0.3).toFixed(1))
          ];
          csvRows.push(row.join(','));
        });
        
        const csvContent = csvRows.join('\r\n'); // Use Windows line endings for Excel compatibility
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="transactions-${business.businessName.replace(/[^a-zA-Z0-9]/g, '_')}-${new Date().toISOString().split('T')[0]}.csv"`);
        res.send(csvContent);
      } else {
        // Return JSON
        res.json({
          success: true,
          transactions: transactions,
          count: transactions.length,
          business: {
            id: business._id,
            name: business.businessName,
            type: business.businessType
          }
        });
      }
      
    } catch (error) {
      console.error('Business transactions error:', error);
      res.status(500).json({ 
        error: 'Failed to retrieve transactions' 
      });
    }
  }
);

// Create test transaction for development
router.post('/transactions/test',
  businessLimiter,
  authenticateToken,
  async (req, res) => {
    try {
      // Find the business
      const business = await Business.findOne({ 
        ownerId: req.user._id,
        businessType: 'CN',
        isActive: true 
      });
      
      if (!business) {
        return res.status(404).json({ 
          error: 'Business not found' 
        });
      }
      
      // Initialize transaction service
      await transactionService.initialize();
      
      // Create test transaction
      const result = await transactionService.createTestTransaction(business._id);
      
      res.json({
        success: true,
        message: 'Test transaction created successfully',
        transaction: result.transaction,
        fees: result.fees,
        netAmount: result.netAmount
      });
      
    } catch (error) {
      console.error('Test transaction creation error:', error);
      res.status(500).json({ 
        error: 'Failed to create test transaction' 
      });
    }
  }
);

/**
 * Create Solana Pay payment request
 * Generates a payment URL following Solana Pay specification
 */
router.post('/solana-pay/create-payment',
  requireAuth,
  [
    body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be positive'),
    body('memo').optional().isString().isLength({ max: 32 }).withMessage('Memo must be 32 characters or less'),
    body('message').optional().isString().isLength({ max: 100 }).withMessage('Message must be 100 characters or less')
  ],
  async (req, res) => {
    const correlationId = req.headers['x-correlation-id'] || `payment-${Date.now()}`;
    
    try {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }
      
      const { amount = 15, memo, message } = req.body;
      
      // Get business information
      const Business = require('../models/Business');
      const business = await Business.findOne({ ownerId: req.session.userId });
      
      if (!business) {
        return res.status(404).json({
          success: false,
          error: 'Business not found'
        });
      }
      
      // Validate business wallet is linked
      if (!business.businessWallet?.publicKey) {
        return res.status(400).json({
          success: false,
          error: 'Business wallet not linked. Please connect your wallet first.'
        });
      }
      
      // Create Solana Pay payment request
      const SolanaPayService = require('../services/solanaPayService');
      const solanaPayService = new SolanaPayService();
      
      const paymentRequest = await solanaPayService.createPaymentRequest({
        recipient: business.businessWallet.publicKey,
        amount: amount,
        splToken: solanaPayService.usdcMint.toString(), // USDC
        label: business.businessName || 'Pizza Platform',
        message: message || `Payment to ${business.businessName} - $${amount} USDC`,
        memo: memo || `Pizza Platform payment - ${business.businessName}`
      });
      
      console.log(`💰 Solana Pay payment request created for ${business.businessName} - $${amount} USDC [${correlationId}]`);
      
      res.json({
        success: true,
        ...paymentRequest,
        businessName: business.businessName,
        correlationId
      });
      
    } catch (error) {
      console.error(`❌ Solana Pay payment request failed [${correlationId}]:`, error);
      res.status(500).json({
        success: false,
        error: 'Failed to create payment request',
        correlationId
      });
    }
  }
);

/**
 * Update business settings
 * Updates business information and settings
 */
router.put('/update-settings', authenticateToken, async (req, res) => {
    try {
        console.log('💾 Backend: update-settings called');
        console.log('📨 Request body:', req.body);
        console.log('👤 User ID:', req.user._id);
        
        const { businessName, contactEmail, contactPhone, walletAddress, emailNotifications } = req.body;

        // Find business by owner ID (same pattern as profile route)
        const business = await Business.findOne({ ownerId: req.user._id });
        if (!business) {
            return res.status(404).json({ 
                success: false, 
                message: 'Business not found' 
            });
        }

        // Update business information
        if (businessName && businessName.trim() !== '') {
            business.businessName = businessName.trim();
        }

        if (contactEmail && contactEmail.trim() !== '') {
            business.contact.email = contactEmail.trim().toLowerCase();
        }

        if (contactPhone && contactPhone.trim() !== '') {
            business.contact.phone = contactPhone.trim();
        }

        // Update wallet address if provided
        if (walletAddress && walletAddress.trim() !== '') {
            // Initialize businessWallet if it doesn't exist
            if (!business.businessWallet) {
                business.businessWallet = {};
            }
            business.businessWallet.publicKey = walletAddress.trim();
            business.businessWallet.isLinked = true;
            business.businessWallet.linkedAt = new Date();
            
            // Initialize settlement if it doesn't exist
            if (!business.settlement) {
                business.settlement = {};
            }
            business.settlement.walletAddress = walletAddress.trim();
        }

        // Update notification settings
        if (typeof emailNotifications === 'boolean') {
            business.settings.emailNotifications = emailNotifications;
        }

        await business.save();

        res.json({
            success: true,
            message: 'Business settings updated successfully',
            business: {
                businessName: business.businessName,
                contactEmail: business.contact.email,
                contactPhone: business.contact.phone,
                walletAddress: business.businessWallet?.publicKey || null,
                emailNotifications: business.settings.emailNotifications
            }
        });

    } catch (error) {
        console.error('Update business settings error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to update business settings',
            error: error.message 
        });
    }
});

/**
 * Validate Solana Pay transaction
 * Confirms a payment transaction matches expected parameters
 */
router.post('/solana-pay/validate-transaction',
  requireAuth,
  [
    body('signature').isString().isLength({ min: 64, max: 128 }).withMessage('Invalid transaction signature'),
    body('reference').isString().withMessage('Reference is required'),
    body('expectedAmount').isFloat({ min: 0.01 }).withMessage('Expected amount must be positive')
  ],
  async (req, res) => {
    const correlationId = req.headers['x-correlation-id'] || `validation-${Date.now()}`;
    
    try {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }
      
      const { signature, reference, expectedAmount } = req.body;
      
      // Get business information
      const Business = require('../models/Business');
      const business = await Business.findOne({ ownerId: req.session.userId });
      
      if (!business) {
        return res.status(404).json({
          success: false,
          error: 'Business not found'
        });
      }
      
      // Validate transaction using Solana Pay service
      const SolanaPayService = require('../services/solanaPayService');
      const solanaPayService = new SolanaPayService();
      
      const isValid = await solanaPayService.validateTransfer(signature, {
        recipient: business.businessWallet.publicKey,
        amount: expectedAmount,
        reference: reference,
        splToken: solanaPayService.usdcMint.toString()
      });
      
      console.log(`✅ Transaction validation result: ${isValid} [${correlationId}]`);
      
      res.json({
        success: true,
        valid: isValid,
        signature,
        reference,
        correlationId
      });
      
    } catch (error) {
      console.error(`❌ Transaction validation failed [${correlationId}]:`, error);
      res.status(500).json({
        success: false,
        error: 'Transaction validation failed',
        correlationId
      });
    }
  }
);

module.exports = router;