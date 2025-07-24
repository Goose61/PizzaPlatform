const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const Business = require('../models/Business');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const RewardsService = require('../services/rewardsService');
const { requireAuth, require2FA } = require('../middleware/adminAuth');

const router = express.Router();
const rewardsService = new RewardsService();

// Configure multer for business document uploads
const businessStorage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../../uploads/business-documents');
    await fs.mkdir(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const fileExtension = path.extname(file.originalname);
    cb(null, `business-${req.session.userId}-${uniqueSuffix}${fileExtension}`);
  }
});

const businessUpload = multer({
  storage: businessStorage,
  limits: {
    fileSize: 15 * 1024 * 1024, // 15MB limit for business documents
    files: 10 // Maximum 10 files per request
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf|doc|docx/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype) || file.mimetype.includes('document');
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, PDF, and DOC files are allowed'));
    }
  }
});

/**
 * @route POST /api/business/register
 * @desc Register a new business
 * @access Private
 */
router.post('/register', requireAuth, require2FA, async (req, res) => {
  const correlationId = crypto.randomBytes(16).toString('hex');
  
  try {
    const {
      businessName,
      businessType,
      businessDescription,
      website,
      taxId,
      legalStructure,
      incorporationDate,
      address,
      contact
    } = req.body;
    
    // Validate required fields
    if (!businessName || !businessType || !taxId || !legalStructure || !address || !contact) {
      return res.status(400).json({
        error: 'Missing required fields: businessName, businessType, taxId, legalStructure, address, contact'
      });
    }
    
    // Check if business with this tax ID already exists
    const existingBusiness = await Business.findByTaxId(taxId);
    if (existingBusiness) {
      return res.status(409).json({
        error: 'A business with this Tax ID is already registered'
      });
    }
    
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Check if user already has a business (limit to one per user for now)
    const existingUserBusiness = await Business.findByOwner(user._id);
    if (existingUserBusiness.length > 0) {
      return res.status(400).json({
        error: 'User already has a registered business. Multiple businesses per user not yet supported.'
      });
    }
    
    // Generate business wallet (placeholder - would integrate with actual wallet service)
    const walletKeyPair = {
      publicKey: crypto.randomBytes(32).toString('hex'),
      privateKey: crypto.randomBytes(32).toString('hex')
    };
    
    // Encrypt private key
    const encryptedPrivateKey = crypto
      .createCipher('aes-256-cbc', process.env.WALLET_MASTER_KEY || 'fallback-key')
      .update(walletKeyPair.privateKey, 'utf8', 'hex') + 
      crypto.createCipher('aes-256-cbc', process.env.WALLET_MASTER_KEY || 'fallback-key')
        .final('hex');
    
    // Create business
    const business = new Business({
      businessName: businessName.trim(),
      businessType,
      businessDescription: businessDescription?.trim(),
      website: website?.trim(),
      taxId: taxId.trim(),
      legalStructure,
      incorporationDate: incorporationDate ? new Date(incorporationDate) : undefined,
      address: {
        street: address.street.trim(),
        city: address.city.trim(),
        state: address.state.trim(),
        zipCode: address.zipCode.trim(),
        country: address.country?.trim() || 'US'
      },
      contact: {
        name: contact.name.trim(),
        email: contact.email.toLowerCase().trim(),
        phone: contact.phone.trim(),
        title: contact.title?.trim()
      },
      businessWallet: {
        publicKey: walletKeyPair.publicKey,
        encryptedPrivateKey
      },
      ownerId: user._id,
      settings: {
        allowedPaymentMethods: ['usdc', 'pizza_token']
      }
    });
    
    await business.save();
    
    console.log(`🏢 Business registered: ${businessName} by ${user.email} [${correlationId}]`);
    
    res.status(201).json({
      message: 'Business registered successfully',
      business: business.toJSON(),
      nextSteps: [
        'Upload required verification documents',
        'Complete KYC verification process',
        'Configure loyalty vault settings',
        'Set up payment methods'
      ]
    });
    
  } catch (error) {
    console.error(`❌ Business registration error [${correlationId}]:`, error);
    res.status(500).json({
      error: 'Business registration failed',
      correlationId
    });
  }
});

/**
 * @route POST /api/business/kyc/upload
 * @desc Upload business verification documents
 * @access Private
 */
router.post('/kyc/upload', requireAuth, require2FA, businessUpload.array('documents', 10), async (req, res) => {
  const correlationId = crypto.randomBytes(16).toString('hex');
  
  try {
    const { businessId, documentType } = req.body;
    
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        error: 'No documents uploaded'
      });
    }
    
    if (!businessId || !documentType) {
      return res.status(400).json({
        error: 'Business ID and document type are required'
      });
    }
    
    const business = await Business.findOne({
      _id: businessId,
      ownerId: req.session.userId
    });
    
    if (!business) {
      return res.status(404).json({
        error: 'Business not found or access denied'
      });
    }
    
    // Validate document type
    const validDocTypes = [
      'business_license',
      'tax_certificate',
      'ein_document',
      'proof_of_address',
      'bank_statement',
      'partnership_agreement',
      'articles_of_incorporation'
    ];
    
    if (!validDocTypes.includes(documentType)) {
      return res.status(400).json({
        error: 'Invalid document type'
      });
    }
    
    // Process uploaded files
    const uploadedDocuments = [];
    for (const file of req.files) {
      const document = {
        type: documentType,
        originalName: file.originalname,
        filename: file.filename,
        url: `/uploads/business-documents/${file.filename}`,
        size: file.size,
        uploadedAt: new Date(),
        status: 'pending'
      };
      
      uploadedDocuments.push(document);
      business.verificationDocuments.push(document);
    }
    
    // Update KYC status to pending if it was unverified
    if (business.kycStatus === 'unverified') {
      business.kycStatus = 'pending';
      business.kycVerificationId = `biz_kyc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    await business.save();
    
    console.log(`📄 Business documents uploaded: ${business.businessName} - ${documentType} [${correlationId}]`);
    
    res.json({
      message: 'Documents uploaded successfully',
      documents: uploadedDocuments,
      businessId,
      kycStatus: business.kycStatus
    });
    
  } catch (error) {
    console.error(`❌ Business document upload error [${correlationId}]:`, error);
    
    // Clean up uploaded files on error
    if (req.files) {
      for (const file of req.files) {
        try {
          await fs.unlink(file.path);
        } catch (unlinkError) {
          console.error('Failed to cleanup uploaded file:', unlinkError);
        }
      }
    }
    
    res.status(500).json({
      error: 'Document upload failed',
      correlationId
    });
  }
});

/**
 * @route GET /api/business/profile
 * @desc Get business profile
 * @access Private
 */
router.get('/profile', requireAuth, require2FA, async (req, res) => {
  try {
    const { businessId } = req.query;
    
    let query = { ownerId: req.session.userId };
    if (businessId) {
      query._id = businessId;
    }
    
    const businesses = await Business.find(query);
    
    if (businesses.length === 0) {
      return res.status(404).json({
        error: 'No businesses found for this user'
      });
    }
    
    // If specific business requested, return single object
    if (businessId) {
      return res.json({
        business: businesses[0].toJSON()
      });
    }
    
    // Return all businesses for user
    res.json({
      businesses: businesses.map(b => b.toJSON()),
      count: businesses.length
    });
    
  } catch (error) {
    console.error('❌ Business profile fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch business profile'
    });
  }
});

/**
 * @route PUT /api/business/vault/config
 * @desc Configure loyalty vault settings
 * @access Private
 */
router.put('/vault/config', requireAuth, require2FA, async (req, res) => {
  const correlationId = crypto.randomBytes(16).toString('hex');
  
  try {
    const { businessId, rewardRate, customRules, initialDeposit } = req.body;
    
    if (!businessId) {
      return res.status(400).json({
        error: 'Business ID is required'
      });
    }
    
    const business = await Business.findOne({
      _id: businessId,
      ownerId: req.session.userId
    });
    
    if (!business) {
      return res.status(404).json({
        error: 'Business not found or access denied'
      });
    }
    
    // Only allow verified businesses to configure loyalty vaults
    if (business.kycStatus !== 'verified') {
      return res.status(403).json({
        error: 'Business must complete KYC verification before configuring loyalty vault'
      });
    }
    
    // Validate reward rate
    if (rewardRate !== undefined) {
      if (rewardRate < 0 || rewardRate > 10) {
        return res.status(400).json({
          error: 'Reward rate must be between 0% and 10%'
        });
      }
      business.loyaltyVault.rewardRate = rewardRate;
    }
    
    // Update custom rules if provided
    if (customRules && Array.isArray(customRules)) {
      business.loyaltyVault.customRules = customRules.filter(rule => 
        rule.condition && rule.value !== undefined && rule.multiplier !== undefined
      );
    }
    
    // Activate vault if not already active
    if (!business.loyaltyVault.isActive) {
      await business.activateLoyaltyVault(initialDeposit || 0);
    }
    
    // Handle initial deposit
    if (initialDeposit && initialDeposit > 0) {
      business.loyaltyVault.totalDeposited += initialDeposit;
      business.loyaltyVault.lastDepositAt = new Date();
      
      // Create deposit transaction record
      const depositTransaction = new Transaction({
        businessId: business._id,
        type: 'vault_deposit',
        amount: initialDeposit,
        currency: 'PIZZA',
        status: 'completed',
        metadata: {
          vaultId: business.loyaltyVault.vaultId,
          depositType: 'initial_deposit'
        }
      });
      
      await depositTransaction.save();
    }
    
    await business.save();
    
    console.log(`💎 Loyalty vault configured: ${business.businessName} [${correlationId}]`);
    
    res.json({
      message: 'Loyalty vault configured successfully',
      loyaltyVault: business.loyaltyVault,
      vaultBalance: business.vaultBalance
    });
    
  } catch (error) {
    console.error(`❌ Vault configuration error [${correlationId}]:`, error);
    res.status(500).json({
      error: 'Vault configuration failed',
      correlationId
    });
  }
});

/**
 * @route GET /api/business/analytics
 * @desc Get business analytics and metrics
 * @access Private
 */
router.get('/analytics', requireAuth, require2FA, async (req, res) => {
  try {
    const { businessId, timeRange = '30d' } = req.query;
    
    if (!businessId) {
      return res.status(400).json({
        error: 'Business ID is required'
      });
    }
    
    const business = await Business.findOne({
      _id: businessId,
      ownerId: req.session.userId
    });
    
    if (!business) {
      return res.status(404).json({
        error: 'Business not found or access denied'
      });
    }
    
    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    
    switch (timeRange) {
      case '7d':
        startDate.setDate(endDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(endDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(endDate.getDate() - 90);
        break;
      case '1y':
        startDate.setFullYear(endDate.getFullYear() - 1);
        break;
      default:
        startDate.setDate(endDate.getDate() - 30);
    }
    
    // Get transactions for the time period
    const transactions = await Transaction.find({
      businessId: business._id,
      createdAt: { $gte: startDate, $lte: endDate },
      status: 'completed'
    }).sort({ createdAt: -1 });
    
    // Calculate metrics
    const metrics = {
      totalRevenue: transactions.reduce((sum, tx) => 
        tx.type === 'payment' ? sum + tx.amount : sum, 0
      ),
      totalTransactions: transactions.filter(tx => tx.type === 'payment').length,
      rewardsDistributed: transactions.reduce((sum, tx) => 
        tx.type === 'reward' ? sum + tx.amount : sum, 0
      ),
      vaultDeposits: transactions.reduce((sum, tx) => 
        tx.type === 'vault_deposit' ? sum + tx.amount : sum, 0
      ),
      averageTransactionValue: 0,
      transactionsByDay: {},
      paymentMethods: {},
      topCustomers: []
    };
    
    if (metrics.totalTransactions > 0) {
      metrics.averageTransactionValue = metrics.totalRevenue / metrics.totalTransactions;
    }
    
    // Group transactions by day
    transactions.forEach(tx => {
      if (tx.type === 'payment') {
        const day = tx.createdAt.toISOString().split('T')[0];
        metrics.transactionsByDay[day] = (metrics.transactionsByDay[day] || 0) + tx.amount;
        
        // Count payment methods
        const method = tx.currency || 'unknown';
        metrics.paymentMethods[method] = (metrics.paymentMethods[method] || 0) + 1;
      }
    });
    
    // Get customer analytics (simplified)
    const customerIds = [...new Set(transactions
      .filter(tx => tx.userId)
      .map(tx => tx.userId.toString())
    )];
    
    metrics.uniqueCustomers = customerIds.length;
    
    // Update business analytics
    business.analytics.totalRevenue = metrics.totalRevenue;
    business.analytics.totalTransactions = metrics.totalTransactions;
    business.analytics.uniqueCustomers = metrics.uniqueCustomers;
    business.analytics.averageTransactionValue = metrics.averageTransactionValue;
    business.analytics.lastCalculatedAt = new Date();
    await business.save();
    
    res.json({
      businessId,
      timeRange,
      period: {
        startDate,
        endDate
      },
      metrics,
      loyaltyVault: {
        balance: business.vaultBalance,
        totalDeposited: business.loyaltyVault.totalDeposited,
        totalDistributed: business.loyaltyVault.totalDistributed,
        rewardRate: business.loyaltyVault.rewardRate
      },
      recentTransactions: transactions.slice(0, 10).map(tx => ({
        id: tx._id,
        type: tx.type,
        amount: tx.amount,
        currency: tx.currency,
        status: tx.status,
        createdAt: tx.createdAt
      }))
    });
    
  } catch (error) {
    console.error('❌ Business analytics error:', error);
    res.status(500).json({
      error: 'Failed to fetch business analytics'
    });
  }
});

/**
 * @route POST /api/business/withdraw
 * @desc Request USDC withdrawal
 * @access Private
 */
router.post('/withdraw', requireAuth, require2FA, async (req, res) => {
  const correlationId = crypto.randomBytes(16).toString('hex');
  
  try {
    const { businessId, amount, withdrawalMethod = 'bank_transfer' } = req.body;
    
    if (!businessId || !amount) {
      return res.status(400).json({
        error: 'Business ID and amount are required'
      });
    }
    
    if (amount <= 0) {
      return res.status(400).json({
        error: 'Withdrawal amount must be positive'
      });
    }
    
    const business = await Business.findOne({
      _id: businessId,
      ownerId: req.session.userId
    });
    
    if (!business) {
      return res.status(404).json({
        error: 'Business not found or access denied'
      });
    }
    
    // Check withdrawal eligibility
    const canWithdraw = business.canWithdraw(amount);
    if (!canWithdraw.allowed) {
      return res.status(403).json({
        error: canWithdraw.reason
      });
    }
    
    // Check if business has sufficient balance (simplified check)
    const availableBalance = business.analytics.totalRevenue || 0;
    if (amount > availableBalance) {
      return res.status(400).json({
        error: 'Insufficient balance for withdrawal'
      });
    }
    
    // Create withdrawal transaction
    const withdrawalTransaction = new Transaction({
      businessId: business._id,
      type: 'withdrawal',
      amount,
      currency: 'USDC',
      status: 'pending',
      metadata: {
        withdrawalMethod,
        fee: canWithdraw.fee,
        netAmount: amount - canWithdraw.fee,
        bankAccount: business.withdrawalSettings.bankAccount ? {
          bankName: business.withdrawalSettings.bankAccount.bankName,
          accountHolderName: business.withdrawalSettings.bankAccount.accountHolderName,
          accountNumber: '****' + business.withdrawalSettings.bankAccount.accountNumber?.slice(-4)
        } : null
      }
    });
    
    await withdrawalTransaction.save();
    
    console.log(`💸 Withdrawal requested: ${business.businessName} - $${amount} [${correlationId}]`);
    
    res.json({
      message: 'Withdrawal request submitted successfully',
      withdrawalId: withdrawalTransaction._id,
      amount,
      fee: canWithdraw.fee,
      netAmount: amount - canWithdraw.fee,
      status: 'pending',
      estimatedProcessingTime: '1-3 business days'
    });
    
  } catch (error) {
    console.error(`❌ Withdrawal request error [${correlationId}]:`, error);
    res.status(500).json({
      error: 'Withdrawal request failed',
      correlationId
    });
  }
});

/**
 * @route PUT /api/business/profile
 * @desc Update business profile
 * @access Private
 */
router.put('/profile', requireAuth, require2FA, async (req, res) => {
  const correlationId = crypto.randomBytes(16).toString('hex');
  
  try {
    const { businessId, ...updateData } = req.body;
    
    if (!businessId) {
      return res.status(400).json({
        error: 'Business ID is required'
      });
    }
    
    const business = await Business.findOne({
      _id: businessId,
      ownerId: req.session.userId
    });
    
    if (!business) {
      return res.status(404).json({
        error: 'Business not found or access denied'
      });
    }
    
    // Only allow certain fields to be updated
    const allowedUpdates = [
      'businessDescription',
      'website',
      'address',
      'contact',
      'settings',
      'withdrawalSettings'
    ];
    
    const updates = {};
    Object.keys(updateData).forEach(key => {
      if (allowedUpdates.includes(key)) {
        updates[key] = updateData[key];
      }
    });
    
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        error: 'No valid fields to update'
      });
    }
    
    // Apply updates
    Object.assign(business, updates);
    await business.save();
    
    console.log(`✏️ Business profile updated: ${business.businessName} [${correlationId}]`);
    
    res.json({
      message: 'Business profile updated successfully',
      business: business.toJSON()
    });
    
  } catch (error) {
    console.error(`❌ Business profile update error [${correlationId}]:`, error);
    res.status(500).json({
      error: 'Profile update failed',
      correlationId
    });
  }
});

module.exports = router;