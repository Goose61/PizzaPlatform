const express = require('express');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const { body, validationResult } = require('express-validator');
const AdminUser = require('../models/AdminUser');
const adminAuth = require('../middleware/adminAuth');
const secretManager = require('../config/secrets');

const router = express.Router();

/**
 * Verify reCAPTCHA token
 */
async function verifyRecaptcha(token) {
  if (!token) return false;
  
  try {
    const secrets = await secretManager.initialize();
    const response = await axios.post('https://www.google.com/recaptcha/api/siteverify', null, {
      params: {
        secret: secrets.recaptchaSecret,
        response: token
      }
    });
    
    return response.data.success;
  } catch (error) {
    console.error('reCAPTCHA verification error:', error.message);
    return false;
  }
}

/**
 * Generate JWT token for admin
 */
async function generateAdminToken(admin) {
  const secrets = await secretManager.initialize();
  
  const payload = {
    userId: admin._id,
    username: admin.username,
    role: admin.role,
    permissions: admin.permissions
  };
  
  return jwt.sign(payload, secrets.adminJwtSecret, {
    expiresIn: '2h',
    issuer: 'pizza-platform',
    audience: 'admin'
  });
}

/**
 * POST /api/admin/login
 * Admin login with reCAPTCHA verification
 */
router.post('/login', [
  body('username')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Username must be between 1 and 50 characters')
    .matches(/^[a-zA-Z0-9._-]+$/)
    .withMessage('Username contains invalid characters'),
  body('password')
    .isLength({ min: 1, max: 200 })
    .withMessage('Password must be between 1 and 200 characters'),
  body('recaptchaToken')
    .optional()
    .isString()
    .withMessage('Invalid reCAPTCHA token')
], async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: errors.array()
      });
    }
    
    const { username, password, recaptchaToken } = req.body;
    
    // Validate input
    if (!username || !password) {
      return res.status(400).json({ 
        error: 'Username and password are required',
        code: 'MISSING_CREDENTIALS'
      });
    }

    // Verify reCAPTCHA
    const recaptchaValid = await verifyRecaptcha(recaptchaToken);
    if (!recaptchaValid) {
      return res.status(400).json({ 
        error: 'reCAPTCHA verification failed',
        code: 'INVALID_RECAPTCHA'
      });
    }
    
    // Find admin user
    const admin = await AdminUser.findByLogin(username);
    
    if (!admin) {
      return res.status(401).json({ 
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Check if account is locked
    if (admin.isLocked) {
      return res.status(423).json({ 
        error: 'Account temporarily locked due to too many failed attempts',
        code: 'ACCOUNT_LOCKED'
      });
    }

    // Check if account is active
    if (!admin.isActive) {
      return res.status(403).json({ 
        error: 'Account is disabled',
        code: 'ACCOUNT_DISABLED'
      });
    }

    // Verify password
    const isValidPassword = await admin.comparePassword(password);
    
    if (!isValidPassword) {
      // Increment failed login attempts
      await admin.incLoginAttempts();
      
      return res.status(401).json({ 
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Reset login attempts on successful login
    await admin.resetLoginAttempts();

    // Check if password needs to be changed
    if (admin.passwordNeedsChange()) {
      return res.status(202).json({
        message: 'Password change required',
        code: 'PASSWORD_CHANGE_REQUIRED',
        userId: admin._id
      });
    }

    // Generate JWT token
    const token = await generateAdminToken(admin);
    
    // Log successful login
    console.log(`Admin login successful: ${admin.username} (${admin._id})`);
    
    res.json({
      success: true,
      token,
      expiresIn: '2h',
      admin: {
        id: admin._id,
        username: admin.username,
        role: admin.role,
        permissions: admin.permissions,
        lastLogin: admin.lastLogin
      }
    });

  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'SERVER_ERROR'
    });
  }
});

/**
 * POST /api/admin/logout
 * Admin logout (with token invalidation)
 */
router.post('/logout', adminAuth, async (req, res) => {
  try {
    // In a production environment, you would typically:
    // 1. Add the token to a blacklist/cache
    // 2. Or use shorter-lived tokens with refresh tokens
    
    console.log(`Admin logout: ${req.admin.username} (${req.admin.userId})`);
    
    res.json({ 
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Admin logout error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'SERVER_ERROR'
    });
  }
});

/**
 * GET /api/admin/profile
 * Get admin profile information
 */
router.get('/profile', adminAuth, async (req, res) => {
  try {
    const admin = await AdminUser.findById(req.admin.userId);
    
    if (!admin) {
      return res.status(404).json({ 
        error: 'Admin user not found',
        code: 'USER_NOT_FOUND'
      });
    }

    res.json({
      admin: {
        id: admin._id,
        username: admin.username,
        email: admin.email,
        role: admin.role,
        permissions: admin.permissions,
        lastLogin: admin.lastLogin,
        twoFactorEnabled: admin.twoFactorEnabled,
        passwordNeedsChange: admin.passwordNeedsChange(),
        createdAt: admin.createdAt
      }
    });
  } catch (error) {
    console.error('Get admin profile error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'SERVER_ERROR'
    });
  }
});

/**
 * POST /api/admin/change-password
 * Change admin password
 */
router.post('/change-password', adminAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        error: 'Current password and new password are required',
        code: 'MISSING_PASSWORDS'
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ 
        error: 'New password must be at least 8 characters long',
        code: 'PASSWORD_TOO_SHORT'
      });
    }

    const admin = await AdminUser.findById(req.admin.userId).select('+password');
    
    if (!admin) {
      return res.status(404).json({ 
        error: 'Admin user not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // Verify current password
    const isValidPassword = await admin.comparePassword(currentPassword);
    if (!isValidPassword) {
      return res.status(401).json({ 
        error: 'Current password is incorrect',
        code: 'INVALID_CURRENT_PASSWORD'
      });
    }

    // Update password
    admin.password = newPassword;
    await admin.save();

    console.log(`Password changed for admin: ${admin.username} (${admin._id})`);

    res.json({ 
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'SERVER_ERROR'
    });
  }
});

/**
 * GET /api/admin/verify-token
 * Verify if current token is valid
 */
router.get('/verify-token', adminAuth, (req, res) => {
  res.json({ 
    valid: true,
    admin: {
      id: req.admin.userId,
      username: req.admin.username,
      role: req.admin.role,
      permissions: req.admin.permissions
    }
  });
});

/**
 * GET /api/admin/users
 * Get all users (admin only)
 */
router.get('/users', adminAuth.requirePermission('users.view'), async (req, res) => {
  try {
    const User = require('../models/User');
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const users = await User.find({})
      .select('-password -twoFactorSecret -backupCodes')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await User.countDocuments();

    res.json({
      users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'SERVER_ERROR'
    });
  }
});

module.exports = router; 