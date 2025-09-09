/**
 * IP Helper Utilities for Security Logging
 * Safely extracts client IP addresses from requests
 */

/**
 * Extract client IP address from request
 * Handles various proxy configurations and headers
 * @param {Object} req - Express request object
 * @returns {string} Client IP address
 */
function getClientIP(req) {
    // Handle common proxy headers
    const forwarded = req.headers['x-forwarded-for'];
    const realIP = req.headers['x-real-ip'];
    const clientIP = req.headers['x-client-ip'];
    const cfIP = req.headers['cf-connecting-ip']; // Cloudflare
    
    let ip;
    
    if (forwarded) {
        // X-Forwarded-For can contain multiple IPs, first one is original client
        ip = forwarded.split(',')[0].trim();
    } else if (realIP) {
        ip = realIP;
    } else if (clientIP) {
        ip = clientIP;
    } else if (cfIP) {
        ip = cfIP; // Cloudflare connecting IP
    } else {
        ip = req.connection.remoteAddress || 
             req.socket.remoteAddress || 
             (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
             req.ip;
    }
    
    // Clean up IPv6 mapped IPv4 addresses
    if (ip && ip.startsWith('::ffff:')) {
        ip = ip.substring(7);
    }
    
    // Validate IP format
    if (!isValidIP(ip)) {
        console.warn(`Invalid IP detected: ${ip}, falling back to connection IP`);
        ip = req.connection.remoteAddress || '0.0.0.0';
    }
    
    return ip || '0.0.0.0';
}

/**
 * Get user agent string from request
 * @param {Object} req - Express request object
 * @returns {string} User agent string
 */
function getUserAgent(req) {
    return req.headers['user-agent'] || 'Unknown';
}

/**
 * Validate IP address format
 * @param {string} ip - IP address to validate
 * @returns {boolean} True if valid IP
 */
function isValidIP(ip) {
    if (!ip || typeof ip !== 'string') return false;
    
    // IPv4 regex
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    // IPv6 regex (simplified)
    const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    
    if (ipv4Regex.test(ip)) {
        // Validate IPv4 octets
        const octets = ip.split('.');
        return octets.every(octet => {
            const num = parseInt(octet, 10);
            return num >= 0 && num <= 255;
        });
    }
    
    return ipv6Regex.test(ip);
}

/**
 * Get comprehensive request info for security logging
 * @param {Object} req - Express request object
 * @returns {Object} Security info object
 */
function getSecurityInfo(req) {
    return {
        ip: getClientIP(req),
        userAgent: getUserAgent(req),
        timestamp: new Date(),
        headers: {
            forwarded: req.headers['x-forwarded-for'],
            realIP: req.headers['x-real-ip'],
            cfIP: req.headers['cf-connecting-ip'],
            origin: req.headers['origin'],
            referer: req.headers['referer']
        }
    };
}

/**
 * Check if IP is from localhost/development
 * @param {string} ip - IP address to check
 * @returns {boolean} True if localhost
 */
function isLocalhost(ip) {
    const localhostIPs = [
        '127.0.0.1',
        '::1',
        '0.0.0.0',
        'localhost'
    ];
    
    return localhostIPs.includes(ip) || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.');
}

/**
 * Generate correlation ID for tracking related security events
 * @returns {string} Unique correlation ID
 */
function generateCorrelationId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

module.exports = {
    getClientIP,
    getUserAgent,
    getSecurityInfo,
    isValidIP,
    isLocalhost,
    generateCorrelationId
};