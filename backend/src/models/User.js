const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  // Basic user information
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
    // Removed index: true as it's already defined explicitly below
  },
  passwordHash: {
    type: String,
    required: true
  },
  
  // Account status
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Email verification
  emailVerificationToken: {
    type: String,
    default: null
  },
  emailVerificationExpires: {
    type: Date,
    default: null
  },
  
  // Password reset
  resetPasswordToken: {
    type: String,
    default: null
  },
  resetPasswordExpires: {
    type: Date,
    default: null
  },
  
  // 2FA settings
  twoFactorSecret: {
    type: String,
    default: null
  },
  twoFactorEnabled: {
    type: Boolean,
    default: false
  },
  backupCodes: [{
    code: String,
    used: {
      type: Boolean,
      default: false
    }
  }],
  
  // Security tracking
  failedLoginAttempts: {
    type: Number,
    default: 0
  },
  accountLockUntil: {
    type: Date,
    default: null
  },
  lastLogin: {
    type: Date,
    default: null
  },
  lastPasswordChange: {
    type: Date,
    default: Date.now
  },
  
  // Security events
  securityEvents: [{
    type: {
      type: String,
      enum: [
        'login_success',
        'login_failed',
        'password_change',
        '2fa_enabled',
        '2fa_disabled',
        'account_locked',
        'password_reset_requested',
        'password_reset_completed',
        'suspicious_activity',
        'account_created',
        'email_verified'
      ]
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    ipAddress: String,
    userAgent: String,
    correlationId: String,
    details: mongoose.Schema.Types.Mixed
  }],
  
  // Customer profile information
  profile: {
    firstName: {
      type: String,
      trim: true,
      maxlength: 50
    },
    lastName: {
      type: String,
      trim: true,
      maxlength: 50
    },
    phoneNumber: {
      type: String,
      trim: true
    },
    dateOfBirth: Date,
    avatar: String // URL to profile picture
  },

  // Account preferences
  preferences: {
    emailNotifications: {
      type: Boolean,
      default: true
    },
    securityAlerts: {
      type: Boolean,
      default: true
    }
  },

  // Referral tracking
  referralData: {
    code: String,
    processed: {
      type: Boolean,
      default: false
    },
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    bonusAwarded: {
      type: Number,
      default: 0
    }
  },
  
  // Simple role-based access (vendors only need accounts)
  role: {
    type: String,
    enum: ['customer', 'business', 'admin'],
    default: 'customer'
  },
  
  // Transaction limits and tracking
  dailyTransactionAmount: {
    type: Number,
    default: 0
  },
  lastTransactionReset: {
    type: Date,
    default: Date.now
  },
  
  // Non-custodial wallet information (optional - for vendors only)
  wallet: {
    // Primary non-custodial wallet
    address: {
      type: String,
      required: false // Optional - customers don't need accounts
    },
    // Token balances (cached for display)
    pizzaSPLBalance: {
      type: Number,
      default: 0 // $PIZZA SPL tokens
    },
    usdcBalance: {
      type: Number,
      default: 0
    },
    lastBalanceUpdate: {
      type: Date,
      default: Date.now
    },
    walletType: {
      type: String,
      enum: ['phantom', 'solflare'],
      default: 'phantom'
    }
  },
  

  
  // Gift card holdings (NFT-based)
  giftCards: [{
    nftAddress: {
      type: String,
      required: true
    },
    value: {
      type: Number,
      required: true,
      default: 5 // 5 $PIZZA SPL value
    },
    issueDate: {
      type: Date,
      default: Date.now
    },
    expiryDate: {
      type: Date,
      required: true
    },
    redeemed: {
      type: Boolean,
      default: false
    },
    redeemedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    redeemedAt: Date,
    used: {
      type: Boolean,
      default: false
    },
    usedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    usedAt: Date,
    usageAmount: Number,
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: true
    },
    mintingCost: {
      type: Number,
      default: 0.50
    },
    transferTransactionId: String, // When redeemed
    usageTransactionId: String, // When used for purchase
    mintTransactionId: String // When minted
  }],
  
  // Payment history (fixed $15 USDC transactions)
  payments: {
    totalTransactions: {
      type: Number,
      default: 0
    },
    totalVolume: {
      type: Number,
      default: 0 // Total $15 transactions
    },
    pizzaSPLRewardsEarned: {
      type: Number,
      default: 0 // 0.3 $PIZZA SPL per $15 transaction
    },
    preferredPaymentMethod: {
      type: String,
      enum: ['usdc', 'pizza_spl'], // Only USDC or $PIZZA SPL
      default: 'usdc'
    },
    lastTransactionDate: Date,
    favoriteBusinesses: [{
      businessId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Business'
      },
      totalSpent: {
        type: Number,
        default: 0
      },
      totalVisits: {
        type: Number,
        default: 0
      },
      lastVisit: Date,
      loyaltyPerks: [{
        perkType: String, // 'discount', 'nft', 'credit'
        value: String,
        earnedAt: Date,
        usedAt: Date
      }]
    }]
  },
  
  // Registration source tracking
  registrationSource: {
    type: String,
    enum: ['direct', 'gift_card', 'business_referral'],
    default: 'direct'
  },
  
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
  
  // Login IP tracking
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
      delete ret.passwordHash;
      delete ret.twoFactorSecret;
      delete ret.emailVerificationToken;
      delete ret.resetPasswordToken;
      delete ret.backupCodes;
      return ret;
    }
  }
});

// Virtual for account lock status
userSchema.virtual('isLocked').get(function() {
  return !!(this.accountLockUntil && this.accountLockUntil > Date.now());
});

// Methods
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

userSchema.methods.incrementLoginAttempts = function() {
  // If we have a previous lock that has expired, restart at 1
  if (this.accountLockUntil && this.accountLockUntil < Date.now()) {
    return this.updateOne({
      $unset: {
        accountLockUntil: 1
      },
      $set: {
        failedLoginAttempts: 1
      }
    });
  }
  
  const updates = { $inc: { failedLoginAttempts: 1 } };
  
  // Lock account after 5 failed attempts for 30 minutes
  if (this.failedLoginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = {
      accountLockUntil: Date.now() + 30 * 60 * 1000 // 30 minutes
    };
  }
  
  return this.updateOne(updates);
};

userSchema.methods.resetLoginAttempts = function() {
  return this.updateOne({
    $unset: {
      failedLoginAttempts: 1,
      accountLockUntil: 1
    }
  });
};

userSchema.methods.addSecurityEvent = function(eventType, ipAddress, userAgent, correlationId, details = {}) {
  this.securityEvents.push({
    type: eventType,
    ipAddress,
    userAgent,
    correlationId,
    details
  });
  
  // Keep only last 50 security events
  if (this.securityEvents.length > 50) {
    this.securityEvents = this.securityEvents.slice(-50);
  }
  
  return this.save();
};

// Login history tracking method
userSchema.methods.addLoginAttempt = function(ipAddress, userAgent, success = true, location = {}) {
  if (!this.loginHistory) {
    this.loginHistory = [];
  }
  
  this.loginHistory.push({
    ipAddress,
    userAgent,
    success,
    location,
    timestamp: new Date()
  });
  
  // Keep only last 100 login attempts
  if (this.loginHistory.length > 100) {
    this.loginHistory = this.loginHistory.slice(-100);
  }
  
  // Update lastLogin if successful
  if (success) {
    this.lastLogin = new Date();
  }
  
  return this.save();
};

// Wallet balance update methods
userSchema.methods.updateBalance = function(tokenType, amount) {
  if (!this.wallet) {
    this.wallet = {};
  }
  
  switch(tokenType) {
    case 'pizza_spl':
      this.wallet.pizzaSPLBalance = (this.wallet.pizzaSPLBalance || 0) + amount;
      break;
    case 'usdc':
      this.wallet.usdcBalance = (this.wallet.usdcBalance || 0) + amount;
      break;
  }
  
  this.wallet.lastBalanceUpdate = new Date();
  return this.save();
};

// Investment token methods
userSchema.methods.addInvestmentTokens = function(amount, conversionData) {
  if (!this.investmentTokens) {
    this.investmentTokens = {
      balance: 0,
      governanceVotes: 0,
      acquisitionHistory: [],
      votingHistory: []
    };
  }
  
  this.investmentTokens.balance += amount;
  this.investmentTokens.governanceVotes += amount; // 1 token = 1 vote
  
  this.investmentTokens.acquisitionHistory.push({
    amount,
    conversionRate: conversionData.rate || '10:1',
    timestamp: new Date(),
    transactionId: conversionData.transactionId
  });
  
  return this.save();
};

userSchema.methods.castGovernanceVote = function(proposalId, vote, votingPower, justification) {
  if (!this.investmentTokens) return null;
  if (this.investmentTokens.governanceVotes < votingPower) return null;
  
  this.investmentTokens.votingHistory.push({
    proposalId,
    vote,
    votingPower,
    timestamp: new Date(),
    justification
  });
  
  return this.save();
};

// Gift card methods
userSchema.methods.addGiftCard = function(giftCardData) {
  if (!this.giftCards) {
    this.giftCards = [];
  }
  
  this.giftCards.push({
    nftAddress: giftCardData.nftAddress,
    value: giftCardData.value || 5,
    expiryDate: giftCardData.expiryDate,
    businessId: giftCardData.businessId,
    mintingCost: giftCardData.mintingCost || 0.50,
    mintTransactionId: giftCardData.transactionId
  });
  
  return this.save();
};

userSchema.methods.redeemGiftCard = function(giftCardId, transactionId) {
  const giftCard = this.giftCards.id(giftCardId);
  if (!giftCard || giftCard.redeemed) return null;
  
  giftCard.redeemed = true;
  giftCard.redeemedAt = new Date();
  giftCard.transferTransactionId = transactionId;
  
  return this.save();
};

userSchema.methods.useGiftCard = function(giftCardId, usageAmount, transactionId) {
  const giftCard = this.giftCards.id(giftCardId);
  if (!giftCard || !giftCard.redeemed || giftCard.used) return null;
  
  giftCard.used = true;
  giftCard.usedAt = new Date();
  giftCard.usageAmount = usageAmount;
  giftCard.usageTransactionId = transactionId;
  
  return this.save();
};

// Payment and reward methods
userSchema.methods.processPayment = function(businessId, amount = 15) {
  if (!this.payments) {
    this.payments = {
      totalTransactions: 0,
      totalVolume: 0,
      pizzaSPLRewardsEarned: 0,
      favoriteBusinesses: []
    };
  }
  
  this.payments.totalTransactions += 1;
  this.payments.totalVolume += amount;
  this.payments.pizzaSPLRewardsEarned += 0.3; // Fixed 0.3 $PIZZA SPL per transaction
  this.payments.lastTransactionDate = new Date();
  
  // Update favorite business
  this.updateFavoriteBusiness(businessId, amount);
  
  return this.save();
};

userSchema.methods.updateFavoriteBusiness = function(businessId, spentAmount) {
  if (!this.payments.favoriteBusinesses) {
    this.payments.favoriteBusinesses = [];
  }
  
  const existingBusiness = this.payments.favoriteBusinesses.find(
    business => business.businessId.toString() === businessId.toString()
  );
  
  if (existingBusiness) {
    existingBusiness.totalSpent += spentAmount;
    existingBusiness.totalVisits += 1;
    existingBusiness.lastVisit = new Date();
  } else {
    this.payments.favoriteBusinesses.push({
      businessId,
      totalSpent: spentAmount,
      totalVisits: 1,
      lastVisit: new Date(),
      loyaltyPerks: []
    });
  }
};

userSchema.methods.addLoyaltyPerk = function(businessId, perkData) {
  const business = this.payments.favoriteBusinesses.find(
    b => b.businessId.toString() === businessId.toString()
  );
  
  if (business) {
    business.loyaltyPerks.push({
      perkType: perkData.type,
      value: perkData.value,
      earnedAt: new Date()
    });
    return this.save();
  }
  return null;
};


// Static methods
userSchema.statics.hashPassword = async function(password) {
  const rounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
  return bcrypt.hash(password, rounds);
};

userSchema.statics.findByEmail = function(email) {
  return this.findOne({ email: email.toLowerCase() });
};

// Indexes
// Email index is automatically created by unique: true property
userSchema.index({ emailVerificationToken: 1 });
userSchema.index({ resetPasswordToken: 1 });
userSchema.index({ accountLockUntil: 1 });
userSchema.index({ 'securityEvents.timestamp': -1 });

// Updated indexes for new schema
userSchema.index({ 'wallet.address': 1 });



userSchema.index({ 'giftCards.nftAddress': 1 });
userSchema.index({ 'giftCards.businessId': 1 });
userSchema.index({ 'giftCards.expiryDate': 1 });
userSchema.index({ 'payments.totalVolume': -1 });
userSchema.index({ 'payments.pizzaSPLRewardsEarned': -1 });
userSchema.index({ registrationSource: 1 });
userSchema.index({ registrationIP: 1 });
userSchema.index({ 'loginHistory.ipAddress': 1 });
userSchema.index({ 'loginHistory.timestamp': -1 });

module.exports = mongoose.model('User', userSchema); 