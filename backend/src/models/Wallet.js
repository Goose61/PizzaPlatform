const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema({
  // User association
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  
  // Wallet information
  publicKey: {
    type: String,
    required: true,
    unique: true,
    validate: {
      validator: function(v) {
        // Basic Solana public key validation (44 characters, base58)
        return /^[1-9A-HJ-NP-Za-km-z]{44}$/.test(v);
      },
      message: 'Invalid Solana public key format'
    }
  },
  
  // Encrypted private key (AES-256 encrypted)
  encryptedPrivateKey: {
    type: String,
    required: true,
    select: false // Never include in queries by default for security
  },
  
  // Wallet status
  isActive: {
    type: Boolean,
    default: true
  },
  
  // KYC verification level for compliance
  kycTier: {
    type: String,
    enum: ['unverified', 'tier1', 'tier2'],
    default: 'unverified'
  },
  
  // Daily transaction limits tracking
  dailySpending: {
    date: {
      type: Date,
      default: Date.now
    },
    amount: {
      type: Number,
      default: 0
    }
  },
  
  // Cached token balances (updated periodically)
  tokenBalances: [{
    mint: {
      type: String,
      required: true
    },
    balance: {
      type: Number,
      default: 0
    },
    lastUpdated: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Security settings
  withdrawalWhitelist: [{
    address: String,
    label: String,
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Metadata
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastActive: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for performance
walletSchema.index({ userId: 1 });
walletSchema.index({ publicKey: 1 });
walletSchema.index({ 'tokenBalances.mint': 1 });

// Instance methods
walletSchema.methods.updateTokenBalance = function(mint, balance) {
  const existingBalance = this.tokenBalances.find(tb => tb.mint === mint);
  
  if (existingBalance) {
    existingBalance.balance = balance;
    existingBalance.lastUpdated = new Date();
  } else {
    this.tokenBalances.push({
      mint,
      balance,
      lastUpdated: new Date()
    });
  }
  
  return this.save();
};

walletSchema.methods.getTokenBalance = function(mint) {
  const tokenBalance = this.tokenBalances.find(tb => tb.mint === mint);
  return tokenBalance ? tokenBalance.balance : 0;
};

walletSchema.methods.checkDailyLimit = function(amount, tierLimits) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Reset daily spending if it's a new day
  if (this.dailySpending.date < today) {
    this.dailySpending.date = today;
    this.dailySpending.amount = 0;
  }
  
  const maxDaily = tierLimits[this.kycTier] || tierLimits.unverified || 100;
  return (this.dailySpending.amount + amount) <= maxDaily;
};

walletSchema.methods.addDailySpending = function(amount) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Reset if new day
  if (this.dailySpending.date < today) {
    this.dailySpending.date = today;
    this.dailySpending.amount = amount;
  } else {
    this.dailySpending.amount += amount;
  }
  
  this.lastActive = new Date();
  return this.save();
};

walletSchema.methods.isWhitelisted = function(address) {
  return this.withdrawalWhitelist.some(item => item.address === address);
};

// Static methods
walletSchema.statics.findByUserId = function(userId) {
  return this.findOne({ userId });
};

walletSchema.statics.findByPublicKey = function(publicKey) {
  return this.findOne({ publicKey });
};

walletSchema.statics.updateBalances = async function(balanceUpdates) {
  // Bulk update balances
  const bulkOps = balanceUpdates.map(update => ({
    updateOne: {
      filter: { publicKey: update.publicKey },
      update: {
        $set: {
          'tokenBalances.$[elem].balance': update.balance,
          'tokenBalances.$[elem].lastUpdated': new Date()
        }
      },
      arrayFilters: [{ 'elem.mint': update.mint }]
    }
  }));
  
  return this.bulkWrite(bulkOps);
};

module.exports = mongoose.model('Wallet', walletSchema); 