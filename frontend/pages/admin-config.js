// Admin Configuration - Secure Credential Management
// This file can be updated without exposing credentials in the main code

const ADMIN_CONFIG = {
    // Security settings (frontend-only UI behavior)
    security: {
        maxLoginAttempts: 3,
        lockoutDuration: 15, // minutes
        sessionTimeout: 24, // hours
        requireCaptcha: true
    },
    // No credentials stored on frontend
};

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ADMIN_CONFIG;
} 