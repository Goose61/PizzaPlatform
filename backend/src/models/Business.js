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
  lastDepositAt: Date,
  lastDistributionAt: Date
});

// Business wallet schema
const walletSchema = new mongoose.Schema({
  publicKey: {
    type: String,
    required: true,
    unique: true
  },
  encryptedPrivateKey: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastUsedAt: Date
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
  businessType: {
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
  loyaltyVault: loyaltyVaultSchema,
  
  // Withdrawal settings
  withdrawalSettings: {
    bankAccount: {
      accountNumber: String,
      routingNumber: String,
      accountHolderName: String,
      bankName: String
    },
    minimumWithdrawal: {
      type: Number,
      default: 100,
      min: 10
    },
    withdrawalFee: {
      type: Number,
      default: 2.5, // 2.5% fee
      min: 0,
      max: 10
    },
    autoWithdrawThreshold: Number
  },
  
  // Analytics and metrics
  analytics: analyticsSchema,
  
  // Settings and preferences
  settings: {
    allowedPaymentMethods: [{
      type: String,
      enum: ['usdc', 'pizza_token', 'sol']
    }],
    requireCustomerKyc: {
      type: Boolean,
      default: false
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

// Indexes for performance
businessSchema.index({ taxId: 1 });
businessSchema.index({ ownerId: 1 });
businessSchema.index({ kycStatus: 1 });
businessSchema.index({ isActive: 1 });
businessSchema.index({ businessType: 1 });
businessSchema.index({ 'businessWallet.publicKey': 1 });
businessSchema.index({ 'loyaltyVault.vaultId': 1 });

// Virtual for formatted business name
businessSchema.virtual('displayName').get(function() {
  return this.businessName.toUpperCase();
});

// Virtual for vault balance
businessSchema.virtual('vaultBalance').get(function() {
  if (!this.loyaltyVault) return 0;
  return this.loyaltyVault.totalDeposited - this.loyaltyVault.totalDistributed;
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

businessSchema.methods.activateLoyaltyVault = async function(initialDeposit = 0) {
  this.loyaltyVault.isActive = true;
  this.loyaltyVault.vaultId = `vault_${this._id}_${Date.now()}`;
  if (initialDeposit > 0) {
    this.loyaltyVault.totalDeposited = initialDeposit;
    this.loyaltyVault.lastDepositAt = new Date();
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

businessSchema.methods.canWithdraw = function(amount) {
  const settings = this.withdrawalSettings;
  const minWithdrawal = settings.minimumWithdrawal || 100;
  
  return {
    allowed: amount >= minWithdrawal && this.kycStatus === 'verified',
    reason: amount < minWithdrawal ? 'Below minimum withdrawal amount' : 
            this.kycStatus !== 'verified' ? 'KYC verification required' : null,
    fee: settings.withdrawalFee ? (amount * settings.withdrawalFee / 100) : 0
  };
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

businessSchema.statics.getBusinessesByType = function(businessType) {
  return this.find({ businessType, isActive: true });
};

module.exports = mongoose.model('Business', businessSchema);