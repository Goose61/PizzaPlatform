const User = require('../models/User');

/**
 * Authentication middleware
 * Checks if user is logged in via session
 */
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

/**
 * Two-Factor Authentication middleware
 * Checks if user has 2FA enabled and verified
 */
async function require2FA(req, res, next) {
  try {
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    // Check if user account is still active
    if (!user.isActive) {
      return res.status(403).json({ error: 'Account is inactive' });
    }
    
    // Check if account is locked
    if (user.isLocked) {
      return res.status(423).json({ error: 'Account is temporarily locked' });
    }
    
    // Verify session ownership matches user
    if (req.session.email && req.session.email !== user.email) {
      return res.status(401).json({ error: 'Session mismatch' });
    }
    
    if (user.twoFactorEnabled && !req.session.twoFactorVerified) {
      return res.status(403).json({ 
        error: '2FA verification required',
        requires2FA: true 
      });
    }
    
    req.user = user;
    next();
  } catch (error) {
    console.error('❌ 2FA check error:', error);
    res.status(500).json({ error: 'Authentication error' });
  }
}

module.exports = {
  requireAuth,
  require2FA
};