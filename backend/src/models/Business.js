const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

// Document schema for business verification
const documentSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: [
      'business_license',
      'tax_certificate', 
      'ein_document',
      'proof_of_address',
      'bank_statement',
      'partnership_agreement',
      'articles_of_incorporation'
    ],
    required: true
  },
  originalName: String,
  filename: String,
  url: String,
  size: Number,
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  },
  verifiedAt: Date,
  rejectionReason: String
});

// Address schema
const addressSchema = new mongoose.Schema({
  street: {
    type: String,
    required: true,
    maxlength: 200
  },
  city: {
    type: String,
    required: true,
    maxlength: 100
  },
  state: {
    type: String,
    required: true,
    maxlength: 50
  },
  zipCode: {
    type: String,
    required: true,
    maxlength: 20
  },
  country: {
    type: String,
    required: true,
    default: 'US',
    maxlength: 50
  }
});

// Contact information schema
const contactSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    maxlength: 100
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  phone: {
    type: String,
    required: true,
    match: [/^\+?[\d\s\-\(\)]{10,}$/, 'Please enter a valid phone number']
  },
  title: {
    type: String,
    maxlength: 100
  }
});

// Loyalty vault configuration schema  
const loyaltyVaultSchema = new mongoose.Schema({
  vaultId: {
    type: String,
    unique: true,
    sparse: true
  },
  rewardRate: {
    type: Number,
    min: 0,
    max: 10, // Maximum 10% cashback
    default: 1.0 // 1% default reward rate
  },
  totalDeposited: {
    type: Number,
    default: 0,
    min: 0
  },
  totalDistributed: {
    type: Number,
    default: 0,
    min: 0
  },
  isActive: {
    type: Boolean,
    default: false
  },
  customRules: [{
    condition: String, // e.g., 'minimum_purchase', 'customer_tier'
    value: mongoose.Schema.Types.Mixed,
    multiplier: {
      type: Number,
      min: 0,
      max: 5
    }
  }],
  fundingSource: {
    type: String,
    enum: ['self-funded', 'external', 'hybrid'],
    default: 'self-funded'
  },
  lastDepositAt: Date,
  lastDistributionAt: Date
});

// Business wallet schema
const walletSchema = new mongoose.Schema({
  publicKey: {
    type: String,
    required: false, // Optional - businesses link their own wallets
    sparse: true // Allow multiple null values
  },
  encryptedPrivateKey: {
    type: String,
    required: false // Optional - not used for linked wallets
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastUsedAt: Date,
  // New fields for linked wallet support
  isLinked: {
    type: Boolean,
    default: false
  },
  linkedAt: Date
});

// Business analytics schema
const analyticsSchema = new mongoose.Schema({
  totalRevenue: {
    type: Number,
    default: 0,
    min: 0
  },
  totalTransactions: {
    type: Number,
    default: 0,
    min: 0
  },
  uniqueCustomers: {
    type: Number,
    default: 0,
    min: 0
  },
  averageTransactionValue: {
    type: Number,
    default: 0,
    min: 0
  },
  conversionRate: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  customerRetentionRate: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  lastCalculatedAt: {
    type: Date,
    default: Date.now
  }
});

// Main business schema
const businessSchema = new mongoose.Schema({
  // Basic business information
  businessName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  businessCategory: {
    type: String,
    required: true,
    enum: [
      'restaurant',
      'retail', 
      'service',
      'e-commerce',
      'healthcare',
      'education',
      'technology',
      'manufacturing',
      'other'
    ]
  },
  // Business type classification (CN only - Crypto Native)
  businessType: {
    type: String,
    enum: ['CN'], // CN = Crypto Native only
    required: true,
    default: 'CN'
  },
  businessDescription: {
    type: String,
    maxlength: 1000
  },
  website: {
    type: String,
    maxlength: 200,
    match: [/^https?:\/\/.+/, 'Please enter a valid URL']
  },
  
  // Legal and tax information
  taxId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    maxlength: 50
  },
  legalStructure: {
    type: String,
    required: true,
    enum: [
      'sole_proprietorship',
      'partnership', 
      'llc',
      'corporation',
      'non_profit'
    ]
  },
  incorporationDate: Date,
  
  // Contact and address information
  address: {
    type: addressSchema,
    required: true
  },
  contact: {
    type: contactSchema,
    required: true
  },
  
  // Account status and verification
  isActive: {
    type: Boolean,
    default: false
  },
  kycStatus: {
    type: String,
    enum: ['unverified', 'pending', 'verified', 'rejected'],
    default: 'unverified'
  },
  kycVerificationId: String,
  kycNotes: String,
  verificationDocuments: [documentSchema],
  
  // Financial information
  businessWallet: walletSchema,
  
  // Platform vault contribution tracking
  vaultContribution: {
    totalContributed: {
      type: Number,
      default: 0,
      min: 0
    }, // $7,117.50/year target
    stakingEnabled: {
      type: Boolean,
      default: false
    }, // Only for CN businesses
    stakingYield: {
      totalEarned: {
        type: Number,
        default: 0,
        min: 0
      },
      businessShare: {
        type: Number,
        default: 0,
        min: 0
      }, // $119.07 for CN
      platformShare: {
        type: Number,
        default: 0,
        min: 0
      }  // $119.07 to platform
    },
    stakingConfig: {
      eligible: {
        type: Boolean,
        default: false
      },
      apy: {
        type: Number,
        default: 0.04 // 4% APY
      },
      yieldSplitRatio: {
        business: {
          type: Number,
          default: 0.5
        },
        platform: {
          type: Number,
          default: 0.5
        }
      },
      minimumStakingAmount: {
        type: Number,
        default: 1000 // $1,000 USDC minimum
      },
      setupDate: Date
    }
  },
  
  // Settlement preferences (CN only - USDC retention)
  settlement: {
    method: {
      type: String,
      enum: ['usdc-retain'], // CN businesses retain USDC
      required: true,
      default: 'usdc-retain'
    },
    walletAddress: {
      type: String,
      required: true // Required for CN businesses (Phantom/Solflare wallet)
    }
  },
  
  // Fee structure (CN only - Crypto Native)
  feeStructure: {
    platformFeePercent: {
      type: Number,
      required: true,
      default: 0.01 // 1% platform fee for CN businesses
    },
    vaultContributionPercent: {
      type: Number,
      required: true,
      default: 0.013 // 1.3% vault contribution
    },
    totalFeePercent: {
      type: Number,
      required: true,
      default: 0.023 // 2.3% total for CN businesses
    }
  },
  
  // Analytics and metrics
  analytics: analyticsSchema,
  
  // Custom loyalty program settings for CN businesses
  loyaltyProgram: {
    discountRules: [{
      requiredTokens: {
        type: Number,
        min: 0
      }, // e.g., 3 $PIZZA SPL
      discountPercent: {
        type: Number,
        min: 0,
        max: 100
      }, // e.g., 10%
      description: String
    }],
    nftRewards: [{
      requiredTokens: {
        type: Number,
        min: 0
      }, // e.g., 20 $PIZZA SPL
      nftType: String,
      description: String
    }],
    creditRules: {
      conversionRate: {
        type: Number,
        min: 0
      }, // e.g., 10 $PIZZA SPL = $1 credit
      redemptionRate: {
        type: Number,
        min: 0,
        max: 1,
        default: 0.5
      }  // e.g., 50%
    },
    isActive: {
      type: Boolean,
      default: false
    }
  },
  
  // Loyalty vault configuration
  loyaltyVault: {
    type: loyaltyVaultSchema,
    default: () => ({
      isActive: false,
      vaultId: `vault_${new mongoose.Types.ObjectId()}_${Date.now()}`,
      totalSupply: 0,
      currentStake: 0,
      apy: 8.5,
      lastYieldDistribution: null,
      participants: 0,
      minimumStake: 100
    })
  },
  
  // Settings and preferences
  settings: {
    allowedPaymentMethods: [{
      type: String,
      enum: ['usdc', 'pizza_spl'], // Fixed $15 USDC or $PIZZA SPL
      default: 'usdc'
    }],
    fixedTransactionAmount: {
      type: Number,
      default: 15 // $15 USDC fixed amount
    },
    emailNotifications: {
      type: Boolean,
      default: true
    },
    webhookUrl: String,
    apiKey: {
      type: String,
      unique: true,
      sparse: true
    }
  },
  
  // Subscription and billing
  subscription: {
    plan: {
      type: String,
      enum: ['free', 'starter', 'professional', 'enterprise'],
      default: 'free'
    },
    status: {
      type: String,
      enum: ['active', 'cancelled', 'suspended'],
      default: 'active'
    },
    billingCycle: {
      type: String,
      enum: ['monthly', 'yearly'],
      default: 'monthly'
    },
    nextBillingDate: Date,
    lastPaymentDate: Date
  },
  
  // Business type tracking
  lastTypeUpdate: Date,
  typeUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Settlement history tracking
  settlementHistory: [{
    type: {
      type: String,
      enum: ['CN']
    },
    data: mongoose.Schema.Types.Mixed,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  lastSettlement: Date,
  
  // Relationships
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  teamMembers: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    role: {
      type: String,
      enum: ['owner', 'admin', 'manager', 'viewer'],
      default: 'viewer'
    },
    permissions: [String],
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Registration IP tracking for security
  registrationIP: {
    type: String,
    required: true
  },
  registrationUserAgent: {
    type: String,
    required: true
  },
  registrationTimestamp: {
    type: Date,
    default: Date.now
  },
  
  // Login IP tracking for business account access
  loginHistory: [{
    ipAddress: {
      type: String,
      required: true
    },
    userAgent: {
      type: String,
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    success: {
      type: Boolean,
      default: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }, // Which team member accessed
    location: {
      country: String,
      city: String,
      region: String
    }
  }]
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      // Remove sensitive information from JSON output
      if (ret.businessWallet && ret.businessWallet.encryptedPrivateKey) {
        delete ret.businessWallet.encryptedPrivateKey;
      }
      if (ret.withdrawalSettings && ret.withdrawalSettings.bankAccount) {
        const bank = ret.withdrawalSettings.bankAccount;
        if (bank.accountNumber) {
          bank.accountNumber = '****' + bank.accountNumber.slice(-4);
        }
        if (bank.routingNumber) {
          bank.routingNumber = '****' + bank.routingNumber.slice(-4);
        }
      }
      if (ret.settings && ret.settings.apiKey) {
        ret.settings.apiKey = ret.settings.apiKey.slice(0, 8) + '...';
      }
      return ret;
    }
  }
});

// Indexes for performance (taxId already indexed via unique: true)
businessSchema.index({ ownerId: 1 });
businessSchema.index({ kycStatus: 1 });
businessSchema.index({ isActive: 1 });
businessSchema.index({ registrationIP: 1 });
businessSchema.index({ 'loginHistory.ipAddress': 1 });
businessSchema.index({ 'loginHistory.timestamp': -1 });
businessSchema.index({ businessType: 1 }); // CN classification
businessSchema.index({ businessCategory: 1 }); // Restaurant, retail, etc.
// businessWallet.publicKey already indexed via unique: true
businessSchema.index({ 'settlement.method': 1 });
businessSchema.index({ 'vaultContribution.stakingEnabled': 1 });

// Virtual for formatted business name
businessSchema.virtual('displayName').get(function() {
  return this.businessName.toUpperCase();
});

// Virtual for vault contribution balance
businessSchema.virtual('vaultBalance').get(function() {
  if (!this.vaultContribution) return 0;
  return this.vaultContribution.totalContributed;
});

// Virtual for annual contribution progress
businessSchema.virtual('annualContributionProgress').get(function() {
  const target = 7117.50; // $7,117.50 annual target
  const contributed = this.vaultContribution?.totalContributed || 0;
  return {
    contributed,
    target,
    percentage: Math.min((contributed / target) * 100, 100),
    remaining: Math.max(target - contributed, 0)
  };
});

// Pre-save middleware
businessSchema.pre('save', async function(next) {
  // Generate API key for new businesses
  if (this.isNew && !this.settings.apiKey) {
    this.settings.apiKey = crypto.randomBytes(32).toString('hex');
  }
  
  // Generate vault ID if loyalty vault is active but no ID exists
  if (this.loyaltyVault.isActive && !this.loyaltyVault.vaultId) {
    this.loyaltyVault.vaultId = `vault_${this._id}_${Date.now()}`;
  }
  
  next();
});

// Instance methods
businessSchema.methods.generateApiKey = function() {
  this.settings.apiKey = crypto.randomBytes(32).toString('hex');
  return this.save();
};

// Method to initialize CN business with unified fee structure
businessSchema.methods.initializeCNBusiness = async function() {
  this.businessType = 'CN';
  
  // Set unified fee structure for all CN businesses
  this.feeStructure.platformFeePercent = 0.01; // 1% platform fee
  this.feeStructure.vaultContributionPercent = 0.013; // 1.3% vault contribution
  this.feeStructure.totalFeePercent = 0.023; // 2.3% total
  this.settlement.method = 'usdc-retain';
  this.vaultContribution.stakingEnabled = true; // All CN businesses eligible for staking
  
  this.lastTypeUpdate = new Date();
  return this.save();
};

// Method to activate loyalty program for CN businesses
businessSchema.methods.activateLoyaltyProgram = async function(programConfig = {}) {
  if (this.businessType !== 'CN') {
    throw new Error('Only CN businesses can activate custom loyalty programs');
  }
  
  this.loyaltyProgram.isActive = true;
  
  // Set default discount rules if not provided
  if (!this.loyaltyProgram.discountRules.length && programConfig.discountRules) {
    this.loyaltyProgram.discountRules = programConfig.discountRules;
  }
  
  // Set default NFT rewards if not provided
  if (!this.loyaltyProgram.nftRewards.length && programConfig.nftRewards) {
    this.loyaltyProgram.nftRewards = programConfig.nftRewards;
  }
  
  // Set credit rules
  if (programConfig.creditRules) {
    this.loyaltyProgram.creditRules = programConfig.creditRules;
  }
  
  return this.save();
};

// Business login tracking method
businessSchema.methods.addLoginAttempt = function(ipAddress, userAgent, userId, success = true, location = {}) {
  if (!this.loginHistory) {
    this.loginHistory = [];
  }
  
  this.loginHistory.push({
    ipAddress,
    userAgent,
    userId,
    success,
    location,
    timestamp: new Date()
  });
  
  // Keep only last 200 login attempts per business
  if (this.loginHistory.length > 200) {
    this.loginHistory = this.loginHistory.slice(-200);
  }
  
  return this.save();
};

businessSchema.methods.updateAnalytics = async function(transactionData) {
  const analytics = this.analytics;
  
  analytics.totalRevenue += transactionData.amount || 0;
  analytics.totalTransactions += 1;
  analytics.averageTransactionValue = analytics.totalRevenue / analytics.totalTransactions;
  analytics.lastCalculatedAt = new Date();
  
  // Update unique customers count (this would need to be calculated from transaction history)
  // analytics.uniqueCustomers = await getUniqueCustomerCount(this._id);
  
  return this.save();
};

// Method to calculate transaction fees based on business type
businessSchema.methods.calculateTransactionFees = function(transactionAmount = 15) {
  const platformFee = transactionAmount * this.feeStructure.platformFeePercent;
  const vaultContribution = transactionAmount * this.feeStructure.vaultContributionPercent;
  const totalFees = platformFee + vaultContribution;
  const merchantAmount = transactionAmount - totalFees;
  
  return {
    transactionAmount,
    platformFee: Math.round(platformFee * 10000) / 10000,
    vaultContribution: Math.round(vaultContribution * 10000) / 10000,
    totalFees: Math.round(totalFees * 10000) / 10000,
    merchantAmount: Math.round(merchantAmount * 10000) / 10000,
    businessType: this.businessType
  };
};

// Method to check settlement eligibility
businessSchema.methods.canSettle = function() {
  return {
    allowed: this.kycStatus === 'verified' && this.isActive,
    reason: this.kycStatus !== 'verified' ? 'KYC verification required' : 
            !this.isActive ? 'Business account not active' : null,
    method: this.settlement.method,
    businessType: this.businessType
  };
};

// Method to update vault contribution
businessSchema.methods.addVaultContribution = function(amount) {
  this.vaultContribution.totalContributed += amount;
  return this.save();
};

// Static methods
businessSchema.statics.findByTaxId = function(taxId) {
  return this.findOne({ taxId: taxId.trim() });
};

businessSchema.statics.findByOwner = function(userId) {
  return this.find({ ownerId: userId });
};

businessSchema.statics.findActiveBusinesses = function() {
  return this.find({ isActive: true, kycStatus: 'verified' });
};

businessSchema.statics.getBusinessesByCategory = function(businessCategory) {
  return this.find({ businessCategory, isActive: true });
};

// Get active CN businesses (all businesses are CN now)
businessSchema.statics.getActiveBusinesses = function() {
  return this.find({ isActive: true, kycStatus: 'verified' });
};

// Get CN businesses eligible for staking
businessSchema.statics.getStakingEligibleBusinesses = function() {
  return this.find({ 
    businessType: 'CN',
    'vaultContribution.stakingEnabled': true,
    isActive: true,
    kycStatus: 'verified'
  });
};

// Get active CN businesses for platform operations
businessSchema.statics.getActiveCNBusinesses = function() {
  return this.find({
    businessType: 'CN',
    'settlement.method': 'usdc-retain',
    isActive: true,
    kycStatus: 'verified'
  });
};

// Get platform vault contribution statistics
businessSchema.statics.getVaultContributionStats = async function() {
  const stats = await this.aggregate([
    {
      $match: {
        isActive: true
      }
    },
    {
      $group: {
        _id: '$businessType',
        totalContributed: { $sum: '$vaultContribution.totalContributed' },
        averageContribution: { $avg: '$vaultContribution.totalContributed' },
        businessCount: { $sum: 1 },
        stakingEnabled: {
          $sum: {
            $cond: ['$vaultContribution.stakingEnabled', 1, 0]
          }
        }
      }
    }
  ]);
  
  return stats;
};

module.exports = mongoose.model('Business', businessSchema);