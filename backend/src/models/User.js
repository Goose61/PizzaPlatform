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
        'suspicious_activity'
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
  
  // KYC (Know Your Customer) information
  kycTier: {
    type: String,
    enum: ['unverified', 'tier1', 'tier2'],
    default: 'unverified'
  },
  kycStatus: {
    type: String,
    enum: ['unverified', 'pending', 'approved', 'rejected'],
    default: 'unverified'
  },
  kycDocuments: [{
    type: {
      type: String,
      enum: ['passport', 'license', 'government_id', 'utility_bill', 'proof_of_address'],
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
    verifiedAt: Date
  }],
  kycVerificationId: {
    type: String,
    default: null
  },
  kycNotes: {
    type: String,
    default: null
  },
  
  // Transaction limits and tracking
  dailyTransactionAmount: {
    type: Number,
    default: 0
  },
  lastTransactionReset: {
    type: Date,
    default: Date.now
  }
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

module.exports = mongoose.model('User', userSchema); 