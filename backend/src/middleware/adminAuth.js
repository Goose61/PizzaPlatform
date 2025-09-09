const jwt = require('jsonwebtoken');
const secretManager = require('../config/secrets');

/**
 * Admin Authentication Middleware
 * Validates JWT tokens for admin access and ensures proper authorization
 */
const adminAuth = async (req, res, next) => {
  try {
    // Extract token from Authorization header
    const authHeader = req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'Access denied. No valid token provided.',
        code: 'NO_TOKEN'
      });
    }

    const token = authHeader.replace('Bearer ', '');
    
    // Get admin JWT secret
    const secrets = await secretManager.initialize();
    
    // Verify and decode token - prevent algorithm confusion attacks
    const decoded = jwt.verify(token, secrets.adminJwtSecret, {
      algorithms: ['HS256'], // Explicitly specify allowed algorithms
      issuer: 'pizza-platform',
      audience: 'admin-dashboard'
    });
    
    // Check if token is for admin role
    if (!decoded.role || decoded.role !== 'admin') {
      return res.status(403).json({ 
        error: 'Access denied. Admin privileges required.',
        code: 'INSUFFICIENT_PRIVILEGES'
      });
    }

    // Check token expiration
    if (decoded.exp && Date.now() >= decoded.exp * 1000) {
      return res.status(401).json({ 
        error: 'Token expired. Please login again.',
        code: 'TOKEN_EXPIRED'
      });
    }

    // Add admin info to request object
    req.admin = {
      userId: decoded.userId,
      role: decoded.role,
      username: decoded.username,
      permissions: decoded.permissions || []
    };

    // Log admin access for security auditing
    console.log(`Admin access: ${req.admin.username} (${req.admin.userId}) - ${req.method} ${req.originalUrl}`);

    next();
  } catch (error) {
    // Handle specific JWT errors
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        error: 'Invalid token format.',
        code: 'INVALID_TOKEN'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Token has expired. Please login again.',
        code: 'TOKEN_EXPIRED'
      });
    }

    if (error.name === 'NotBeforeError') {
      return res.status(401).json({ 
        error: 'Token not yet valid.',
        code: 'TOKEN_NOT_ACTIVE'
      });
    }

    // Log security-related errors
    console.error('Admin auth error:', error.message);
    
    return res.status(500).json({ 
      error: 'Authentication service error.',
      code: 'AUTH_SERVICE_ERROR'
    });
  }
};

/**
 * Optional: Permission-based authorization
 * Usage: adminAuth.requirePermission('users.manage')
 */
adminAuth.requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.admin) {
      return res.status(401).json({ 
        error: 'Authentication required.',
        code: 'NOT_AUTHENTICATED'
      });
    }

    if (!req.admin.permissions.includes(permission) && !req.admin.permissions.includes('*')) {
      return res.status(403).json({ 
        error: `Permission '${permission}' required.`,
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    }

    next();
  };
};

module.exports = adminAuth; 