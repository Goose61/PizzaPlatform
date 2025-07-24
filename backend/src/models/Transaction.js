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
      'payment',       // QR payment to merchant
      'swap',          // Jupiter token swap
      'transfer',      // Direct token transfer
      'mint',          // SPL token minting
      'stake',         // Staking operation
      'unstake',       // Unstaking operation
      'reward',        // Loyalty reward distribution
      'deposit',       // Fiat to crypto conversion
      'withdrawal'     // Crypto to fiat conversion
    ],
    required: true
  },
  
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'failed', 'cancelled'],
    default: 'pending'
  },
  
  // Transaction amounts and tokens
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
  
  // Payment specific fields
  merchantWallet: {
    type: String,
    validate: {
      validator: function(v) {
        return !v || /^[1-9A-HJ-NP-Za-km-z]{44}$/.test(v);
      },
      message: 'Invalid merchant wallet address'
    }
  },
  
  merchantInfo: {
    name: String,
    location: String,
    category: String
  },
  
  // QR payment reference
  paymentReference: {
    type: String,
    index: true
  },
  
  // Swap specific fields
  swapDetails: {
    inputMint: String,
    outputMint: String,
    inputAmount: Number,
    outputAmount: Number,
    minimumReceived: Number,
    slippage: Number,
    priceImpact: Number,
    route: [{
      swapInfo: {
        ammKey: String,
        label: String,
        inputMint: String,
        outputMint: String,
        inAmount: String,
        outAmount: String,
        feeAmount: String,
        feeMint: String
      }
    }]
  },
  
  // Fee information
  fees: {
    networkFee: {
      type: Number,
      default: 0
    },
    platformFee: {
      type: Number,
      default: 0
    },
    swapFee: {
      type: Number,
      default: 0
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
  
  // Compliance tracking
  compliance: {
    kycRequired: {
      type: Boolean,
      default: false
    },
    kycVerified: {
      type: Boolean,
      default: false
    },
    dailyLimitCheck: {
      type: Boolean,
      default: false
    },
    riskScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    }
  },
  
  // Loyalty and rewards
  loyaltyPoints: {
    earned: {
      type: Number,
      default: 0
    },
    redeemed: {
      type: Number,
      default: 0
    }
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

// Indexes for performance and queries
transactionSchema.index({ signature: 1 });
transactionSchema.index({ userId: 1, createdAt: -1 });
transactionSchema.index({ walletAddress: 1, createdAt: -1 });
transactionSchema.index({ type: 1, status: 1 });
transactionSchema.index({ paymentReference: 1 });
transactionSchema.index({ merchantWallet: 1, createdAt: -1 });
transactionSchema.index({ 'inputToken.mint': 1 });
transactionSchema.index({ 'outputToken.mint': 1 });
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

transactionSchema.methods.addLoyaltyPoints = function(points) {
  this.loyaltyPoints.earned += points;
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
        totalAmount: { $sum: '$inputToken.amount' },
        avgAmount: { $avg: '$inputToken.amount' },
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

transactionSchema.statics.getDailyVolume = function(days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return this.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate },
        status: 'confirmed'
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
        totalVolume: { $sum: '$inputToken.amount' },
        uniqueUsers: { $addToSet: '$userId' }
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
        uniqueUserCount: { $size: '$uniqueUsers' }
      }
    },
    { $sort: { date: 1 } }
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