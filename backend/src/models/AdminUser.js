const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const adminUserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 50,
    match: /^[a-zA-Z0-9_-]+$/, // Alphanumeric, underscore, hyphen only
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, // Basic email validation
  },
  password: {
    type: String,
    required: true,
    minlength: 8,
    select: false, // Don't include password in queries by default
  },
  role: {
    type: String,
    default: 'admin',
    enum: ['admin', 'super_admin'],
  },
  permissions: [{
    type: String,
    enum: [
      'users.view',
      'users.edit', 
      'users.delete',
      'analytics.view',
      'settings.edit',
      'security.manage',
      '*' // Super admin permission
    ]
  }],
  isActive: {
    type: Boolean,
    default: true,
  },
  lastLogin: {
    type: Date,
  },
  loginAttempts: {
    type: Number,
    default: 0,
  },
  lockUntil: {
    type: Date,
  },
  twoFactorSecret: {
    type: String,
    select: false, // Don't include in queries
  },
  twoFactorEnabled: {
    type: Boolean,
    default: false,
  },
  backupCodes: [{
    code: String,
    used: { type: Boolean, default: false }
  }],
  passwordChangedAt: {
    type: Date,
    default: Date.now,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AdminUser',
  },
}, {
  timestamps: true,
});

// Constants for account lockout
adminUserSchema.statics.MAX_LOGIN_ATTEMPTS = 5;
adminUserSchema.statics.LOCK_TIME = 30 * 60 * 1000; // 30 minutes

// Virtual for checking if account is locked
adminUserSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Pre-save middleware to hash password
adminUserSchema.pre('save', async function(next) {
  // Only hash password if it's been modified
  if (!this.isModified('password')) return next();
  
  try {
    // Hash password with bcrypt (12 rounds for admin accounts)
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    this.passwordChangedAt = new Date();
    next();
  } catch (error) {
    next(error);
  }
});

// Instance method to compare password
adminUserSchema.methods.comparePassword = async function(candidatePassword) {
  if (!candidatePassword) return false;
  
  return await bcrypt.compare(candidatePassword, this.password);
};

// Instance method to handle failed login attempts
adminUserSchema.methods.incLoginAttempts = function() {
  // If we have a previous lock that has expired, restart at 1
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { lockUntil: 1 },
      $set: { loginAttempts: 1 }
    });
  }
  
  const updates = { $inc: { loginAttempts: 1 } };
  
  // Lock account after max attempts
  if (this.loginAttempts + 1 >= this.constructor.MAX_LOGIN_ATTEMPTS && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + this.constructor.LOCK_TIME };
  }
  
  return this.updateOne(updates);
};

// Instance method to reset login attempts
adminUserSchema.methods.resetLoginAttempts = function() {
  return this.updateOne({
    $unset: { loginAttempts: 1, lockUntil: 1 },
    $set: { lastLogin: new Date() }
  });
};

// Instance method to check if password needs to be changed
adminUserSchema.methods.passwordNeedsChange = function(maxAge = 90) {
  if (!this.passwordChangedAt) return true;
  
  const daysSinceChange = (Date.now() - this.passwordChangedAt) / (1000 * 60 * 60 * 24);
  return daysSinceChange > maxAge;
};

// Static method to find admin by username or email
adminUserSchema.statics.findByLogin = function(login) {
  return this.findOne({
    $or: [
      { username: login },
      { email: login }
    ],
    isActive: true
  }).select('+password +twoFactorSecret');
};

// Static method to create super admin (for setup)
adminUserSchema.statics.createSuperAdmin = async function(userData) {
  const existingAdmin = await this.findOne({ role: 'super_admin' });
  if (existingAdmin) {
    throw new Error('Super admin already exists');
  }
  
  return await this.create({
    ...userData,
    role: 'super_admin',
    permissions: ['*'], // All permissions
    isActive: true
  });
};

// Index for performance
adminUserSchema.index({ username: 1 });
adminUserSchema.index({ email: 1 });
adminUserSchema.index({ isActive: 1 });

module.exports = mongoose.model('AdminUser', adminUserSchema); 