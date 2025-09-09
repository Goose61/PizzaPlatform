const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  // Transaction identification
  signature: {
    type: String,
    required: true,
    unique: true,
    validate: {
      validator: function(v) {
        // Basic Solana signature validation (base58, ~88 characters)
        return /^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(v);
      },
      message: 'Invalid Solana transaction signature format'
    }
  },
  
  // User and wallet association
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  walletAddress: {
    type: String,
    required: true
  },
  
  // Transaction type and details
  type: {
    type: String,
    enum: [
      'payment',           // Fixed $15 USDC QR payment  
      'reward_distribution', // 0.3 $PIZZA SPL reward
      'gift_card_mint',    // Gift card NFT minting
      'gift_card_redeem',  // Gift card redemption
      'vault_contribution', // Platform vault funding
      'kamino_staking'    // CN business staking
    ],
    required: true
  },
  
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'failed', 'cancelled'],
    default: 'pending'
  },
  
  // Standardized transaction amount (fixed $15 USDC)
  amount: {
    type: Number,
    default: 15, // Fixed $15 USDC per transaction
    required: true
  },
  
  // Token details for swaps and conversions
  inputToken: {
    mint: String,
    amount: Number,
    symbol: String
  },
  
  outputToken: {
    mint: String,
    amount: Number,
    symbol: String
  },
  
  // Business/merchant information
  businessId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    index: true
  },
  
  businessInfo: {
    name: String,
    type: {
      type: String,
      enum: ['CN'],
      default: 'CN'
    },
    category: String,
    walletAddress: String
  },
  
  // QR payment reference
  paymentReference: {
    type: String,
    index: true
  },
  
  // Jupiter swap details for $PIZZA SPL to USDC conversion
  jupiterSwap: {
    inputMint: String,   // $PIZZA SPL mint
    outputMint: String,  // USDC mint
    inputAmount: Number, // Amount of $PIZZA SPL
    outputAmount: Number, // USDC received
    swapLoss: {
      type: Number,
      default: 0.0075    // 0.75% customer-absorbed loss
    },
    route: mongoose.Schema.Types.Mixed, // Jupiter route info
    priceImpact: Number
  },
  
  // Fee breakdown (standardized for all CN businesses)
  fees: {
    platformFee: {
      type: Number,
      required: true,
      default: 0.15 // 1% of $15 = $0.15
    },
    vaultContribution: {
      type: Number,
      required: true,
      default: 0.195 // 1.3% of $15 = $0.195
    },
    totalFees: {
      type: Number,
      required: true,
      default: 0.345 // $0.15 + $0.195 = $0.345
    },
    networkFee: {
      type: Number,
      default: 0.00025 // Solana network fee
    },
    jupiterSwapFee: {
      type: Number,
      default: 0 // 0.75% customer-absorbed for $PIZZA SPL swaps
    }
  },
  
  // Blockchain details
  blockTime: Date,
  slot: Number,
  confirmations: {
    type: Number,
    default: 0
  },
  
  // Error information
  error: {
    code: String,
    message: String,
    details: mongoose.Schema.Types.Mixed
  },
  
  // Settlement tracking (CN businesses only - USDC retain)
  settlement: {
    method: {
      type: String,
      enum: ['usdc-retain'],
      default: 'usdc-retain',
      required: function() {
        return this.type === 'payment';
      }
    },
    processed: {
      type: Boolean,
      default: false
    },
    netAmount: {
      type: Number,
      default: 14.655 // $15 - $0.345 fees = $14.655
    },
    settlementDate: Date
  },
  
  // Reward distribution (fixed 0.3 $PIZZA SPL per $15 transaction)
  rewards: {
    pizzaTokensDistributed: {
      type: Number,
      default: 0.3 // Fixed 0.3 $PIZZA SPL per transaction
    },
    giftCardIssued: {
      type: Boolean,
      default: false
    },
    vaultFunded: {
      type: Number,
      default: 0.195 // $0.195 vault contribution per transaction
    },
    distributionTransactionId: String // Solana tx for reward distribution
  },
  
  // Metadata
  notes: String,
  tags: [String],
  
  // Timestamps
  initiatedAt: {
    type: Date,
    default: Date.now
  },
  
  completedAt: Date,
  
  // Raw transaction data (for debugging)
  rawTransaction: {
    type: String,
    select: false // Don't include by default
  }
}, {
  timestamps: true
});

// Updated indexes for new schema (signature already indexed via unique: true)
transactionSchema.index({ userId: 1, createdAt: -1 });
transactionSchema.index({ businessId: 1, createdAt: -1 });
transactionSchema.index({ walletAddress: 1, createdAt: -1 });
transactionSchema.index({ type: 1, status: 1 });
transactionSchema.index({ amount: 1 }); // Fixed $15 transactions
transactionSchema.index({ 'businessInfo.type': 1 }); // CN business filtering
transactionSchema.index({ 'settlement.method': 1 });
transactionSchema.index({ 'settlement.processed': 1 });
transactionSchema.index({ 'rewards.pizzaTokensDistributed': 1 });
transactionSchema.index({ blockTime: -1 });

// Virtual for transaction value in USD (requires price data)
transactionSchema.virtual('usdValue').get(function() {
  // This would be calculated based on current token prices
  // Implementation depends on price feed integration
  return 0;
});

// Instance methods
transactionSchema.methods.markConfirmed = function(blockTime, slot, confirmations = 1) {
  this.status = 'confirmed';
  this.blockTime = blockTime;
  this.slot = slot;
  this.confirmations = confirmations;
  this.completedAt = new Date();
  return this.save();
};

transactionSchema.methods.markFailed = function(error) {
  this.status = 'failed';
  this.error = error;
  this.completedAt = new Date();
  return this.save();
};

// Method to record reward distribution
transactionSchema.methods.recordRewardDistribution = function(rewardData) {
  this.rewards.pizzaTokensDistributed = rewardData.tokens || 0.3;
  this.rewards.giftCardIssued = rewardData.giftCardIssued || false;
  this.rewards.vaultFunded = rewardData.vaultContribution || 0;
  this.rewards.distributionTransactionId = rewardData.transactionId;
  return this.save();
};

// Method to process settlement
transactionSchema.methods.processSettlement = function(settlementData) {
  this.settlement.processed = true;
  this.settlement.rampTransactionId = settlementData.rampTransactionId;
  this.settlement.netAmount = settlementData.netAmount;
  this.settlement.settlementDate = new Date();
  return this.save();
};

transactionSchema.methods.updateCompliance = function(complianceData) {
  this.compliance = { ...this.compliance, ...complianceData };
  return this.save();
};

// Static methods
transactionSchema.statics.findByUser = function(userId, limit = 20) {
  return this.find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('userId', 'email');
};

transactionSchema.statics.findByWallet = function(walletAddress, limit = 20) {
  return this.find({ walletAddress })
    .sort({ createdAt: -1 })
    .limit(limit);
};

transactionSchema.statics.findByType = function(type, startDate, endDate, limit = 100) {
  const query = { type };
  
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }
  
  return this.find(query)
    .sort({ createdAt: -1 })
    .limit(limit);
};

// Get transaction stats with new fixed amount structure
transactionSchema.statics.getTransactionStats = function(userId, startDate, endDate) {
  const matchStage = { userId: new mongoose.Types.ObjectId(userId) };
  
  if (startDate || endDate) {
    matchStage.createdAt = {};
    if (startDate) matchStage.createdAt.$gte = new Date(startDate);
    if (endDate) matchStage.createdAt.$lte = new Date(endDate);
  }
  
  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$type',
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' }, // Fixed $15 amounts
        avgAmount: { $avg: '$amount' },
        totalRewards: { $sum: '$rewards.pizzaTokensDistributed' },
        totalVaultContributions: { $sum: '$rewards.vaultFunded' },
        successfulCount: {
          $sum: { $cond: [{ $eq: ['$status', 'confirmed'] }, 1, 0] }
        }
      }
    },
    {
      $project: {
        type: '$_id',
        count: 1,
        totalAmount: 1,
        avgAmount: 1,
        totalRewards: 1,
        totalVaultContributions: 1,
        successfulCount: 1,
        successRate: {
          $multiply: [
            { $divide: ['$successfulCount', '$count'] },
            100
          ]
        }
      }
    }
  ]);
};

// Get business type specific stats
transactionSchema.statics.getBusinessTypeStats = function(businessType, startDate, endDate) {
  const matchStage = {
    'businessInfo.type': businessType,
    type: 'payment',
    status: 'confirmed'
  };
  
  if (startDate || endDate) {
    matchStage.createdAt = {};
    if (startDate) matchStage.createdAt.$gte = new Date(startDate);
    if (endDate) matchStage.createdAt.$lte = new Date(endDate);
  }
  
  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalTransactions: { $sum: 1 },
        totalVolume: { $sum: '$amount' },
        totalPlatformFees: { $sum: '$fees.platformFee' },
        totalVaultContributions: { $sum: '$fees.vaultContribution' },
        totalRewardsDistributed: { $sum: '$rewards.pizzaTokensDistributed' },
        averageTransactionValue: { $avg: '$amount' },
        uniqueBusinesses: { $addToSet: '$businessId' },
        settledCount: {
          $sum: { $cond: ['$settlement.processed', 1, 0] }
        }
      }
    },
    {
      $project: {
        businessType: businessType,
        totalTransactions: 1,
        totalVolume: 1,
        totalPlatformFees: 1,
        totalVaultContributions: 1,
        totalRewardsDistributed: 1,
        averageTransactionValue: 1,
        uniqueBusinessCount: { $size: '$uniqueBusinesses' },
        settlementRate: {
          $multiply: [
            { $divide: ['$settledCount', '$totalTransactions'] },
            100
          ]
        }
      }
    }
  ]);
};

// Get daily volume with platform vault contributions
transactionSchema.statics.getDailyVolume = function(days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return this.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate },
        status: 'confirmed',
        type: 'payment'
      }
    },
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
          day: { $dayOfMonth: '$createdAt' }
        },
        totalTransactions: { $sum: 1 },
        totalVolume: { $sum: '$amount' }, // All $15 transactions
        totalPlatformFees: { $sum: '$fees.platformFee' },
        totalVaultContributions: { $sum: '$fees.vaultContribution' },
        totalRewards: { $sum: '$rewards.pizzaTokensDistributed' },
        cnTransactions: {
          $sum: { $cond: [{ $eq: ['$businessInfo.type', 'CN'] }, 1, 0] }
        },
        uniqueUsers: { $addToSet: '$userId' },
        uniqueBusinesses: { $addToSet: '$businessId' }
      }
    },
    {
      $project: {
        date: {
          $dateFromParts: {
            year: '$_id.year',
            month: '$_id.month',
            day: '$_id.day'
          }
        },
        totalTransactions: 1,
        totalVolume: 1,
        totalPlatformFees: 1,
        totalVaultContributions: 1,
        totalRewards: 1,
        cnTransactions: 1,
        uniqueUserCount: { $size: '$uniqueUsers' },
        uniqueBusinessCount: { $size: '$uniqueBusinesses' },
        averageTransactionValue: { $divide: ['$totalVolume', '$totalTransactions'] }
      }
    },
    { $sort: { date: 1 } }
  ]);
};

// Get vault contribution summary
transactionSchema.statics.getVaultContributionSummary = function(startDate, endDate) {
  const matchStage = {
    type: 'payment',
    status: 'confirmed',
    'fees.vaultContribution': { $gt: 0 }
  };
  
  if (startDate || endDate) {
    matchStage.createdAt = {};
    if (startDate) matchStage.createdAt.$gte = new Date(startDate);
    if (endDate) matchStage.createdAt.$lte = new Date(endDate);
  }
  
  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalVaultContributions: { $sum: '$fees.vaultContribution' },
        totalRewardsDistributed: { $sum: '$rewards.pizzaTokensDistributed' },
        totalTransactions: { $sum: 1 },
        contributingBusinesses: { $addToSet: '$businessId' }
      }
    },
    {
      $project: {
        totalVaultContributions: 1,
        totalRewardsDistributed: 1,
        totalTransactions: 1,
        averageContributionPerTransaction: {
          $divide: ['$totalVaultContributions', '$totalTransactions']
        },
        contributingBusinessCount: { $size: '$contributingBusinesses' },
        vaultSurplus: {
          $subtract: ['$totalVaultContributions', { $multiply: ['$totalRewardsDistributed', 0.15] }]
        } // Assuming $0.15 cost per reward
      }
    }
  ]);
};

// Pre-save middleware
transactionSchema.pre('save', function(next) {
  // Set completion timestamp for confirmed/failed transactions
  if ((this.status === 'confirmed' || this.status === 'failed') && !this.completedAt) {
    this.completedAt = new Date();
  }
  
  next();
});

module.exports = mongoose.model('Transaction', transactionSchema); 