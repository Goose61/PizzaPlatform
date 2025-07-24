const crypto = require('crypto');
const User = require('../models/User');
const Business = require('../models/Business');
const Transaction = require('../models/Transaction');

class AdvancedSecurity {
  constructor() {
    // Fraud detection patterns
    this.suspiciousPatterns = {
      velocityLimits: {
        transactions: 10, // Max transactions per hour
        amount: 10000,    // Max transaction amount per hour
        accounts: 3       // Max accounts accessed per hour
      },
      anomalyThresholds: {
        unusualAmount: 5,      // Multiplier for unusual transaction amounts
        unusualTime: 2,        // Hours outside normal pattern
        unusualLocation: 500   // Miles from usual location
      }
    };

    // Device fingerprinting components
    this.deviceComponents = [
      'userAgent',
      'screen',
      'timezone',
      'language',
      'platform'
    ];

    // IP reputation cache
    this.ipReputationCache = new Map();
    this.cacheTimeout = 60 * 60 * 1000; // 1 hour
  }

  /**
   * Detect suspicious activity patterns
   * @param {string} userId - User ID
   * @param {string} action - Action being performed
   * @param {Object} metadata - Request metadata
   * @returns {Object} - Risk assessment result
   */
  async detectSuspiciousActivity(userId, action, metadata) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        return { riskScore: 100, reason: 'User not found', block: true };
      }

      const riskFactors = [];
      let riskScore = 0;

      // 1. Velocity checks
      const velocityRisk = await this.checkVelocityLimits(userId, action, metadata);
      riskScore += velocityRisk.score;
      if (velocityRisk.factors.length > 0) {
        riskFactors.push(...velocityRisk.factors);
      }

      // 2. Geographic anomaly detection
      const locationRisk = await this.checkGeographicAnomaly(userId, metadata);
      riskScore += locationRisk.score;
      if (locationRisk.factors.length > 0) {
        riskFactors.push(...locationRisk.factors);
      }

      // 3. Device fingerprinting
      const deviceRisk = await this.checkDeviceFingerprint(userId, metadata);
      riskScore += deviceRisk.score;
      if (deviceRisk.factors.length > 0) {
        riskFactors.push(...deviceRisk.factors);
      }

      // 4. Behavioral analysis
      const behaviorRisk = await this.analyzeBehaviorPattern(userId, action, metadata);
      riskScore += behaviorRisk.score;
      if (behaviorRisk.factors.length > 0) {
        riskFactors.push(...behaviorRisk.factors);
      }

      // 5. IP reputation check
      const ipRisk = await this.checkIPReputation(metadata.ipAddress);
      riskScore += ipRisk.score;
      if (ipRisk.factors.length > 0) {
        riskFactors.push(...ipRisk.factors);
      }

      // 6. Time-based analysis
      const timeRisk = this.analyzeTimePattern(userId, metadata);
      riskScore += timeRisk.score;
      if (timeRisk.factors.length > 0) {
        riskFactors.push(...timeRisk.factors);
      }

      // Determine risk level and action
      const riskLevel = this.calculateRiskLevel(riskScore);
      const shouldBlock = riskScore >= 80;
      const requiresReview = riskScore >= 60;

      const result = {
        userId,
        action,
        riskScore: Math.min(100, riskScore),
        riskLevel,
        riskFactors,
        shouldBlock,
        requiresReview,
        recommendedAction: this.getRecommendedAction(riskScore, riskFactors),
        timestamp: new Date()
      };

      // Log suspicious activity
      if (riskScore >= 40) {
        await this.logSuspiciousActivity(user, result);
      }

      return result;

    } catch (error) {
      console.error('❌ Suspicious activity detection failed:', error);
      return {
        riskScore: 0,
        riskLevel: 'unknown',
        error: error.message,
        shouldBlock: false
      };
    }
  }

  /**
   * Check transaction velocity limits
   * @param {string} userId - User ID
   * @param {string} action - Action type
   * @param {Object} metadata - Request metadata
   * @returns {Object} - Velocity risk assessment
   */
  async checkVelocityLimits(userId, action, metadata) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const factors = [];
    let score = 0;

    try {
      // Check transaction velocity
      if (action === 'transaction' || action === 'payment') {
        const recentTransactions = await Transaction.find({
          userId,
          createdAt: { $gte: oneHourAgo },
          status: { $in: ['completed', 'pending'] }
        });

        // Transaction count check
        if (recentTransactions.length > this.suspiciousPatterns.velocityLimits.transactions) {
          factors.push(`High transaction velocity: ${recentTransactions.length} transactions in 1 hour`);
          score += 25;
        }

        // Transaction amount check
        const totalAmount = recentTransactions.reduce((sum, tx) => sum + (tx.amount || 0), 0);
        if (totalAmount > this.suspiciousPatterns.velocityLimits.amount) {
          factors.push(`High transaction amount velocity: $${totalAmount} in 1 hour`);
          score += 30;
        }
      }

      // Check login velocity
      if (action === 'login') {
        const recentEvents = user.securityEvents.filter(event => 
          event.timestamp >= oneHourAgo && 
          (event.type === 'login_success' || event.type === 'login_failed')
        );

        if (recentEvents.length > 10) {
          factors.push(`High login velocity: ${recentEvents.length} attempts in 1 hour`);
          score += 20;
        }
      }

      return { score, factors };

    } catch (error) {
      console.error('Velocity check failed:', error);
      return { score: 0, factors: [] };
    }
  }

  /**
   * Check for geographic anomalies
   * @param {string} userId - User ID
   * @param {Object} metadata - Request metadata
   * @returns {Object} - Geographic risk assessment
   */
  async checkGeographicAnomaly(userId, metadata) {
    const factors = [];
    let score = 0;

    try {
      const { ipAddress, location } = metadata;
      if (!ipAddress || !location) {
        return { score: 0, factors: [] };
      }

      // Get user's recent locations from security events
      const user = await User.findById(userId);
      const recentEvents = user.securityEvents
        .filter(event => event.timestamp >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
        .filter(event => event.details && event.details.location);

      if (recentEvents.length === 0) {
        return { score: 0, factors: [] };
      }

      // Calculate distance from usual locations
      const distances = recentEvents.map(event => 
        this.calculateDistance(location, event.details.location)
      );

      const averageDistance = distances.reduce((sum, d) => sum + d, 0) / distances.length;
      const minDistance = Math.min(...distances);

      // Flag if significantly far from usual locations
      if (minDistance > this.suspiciousPatterns.anomalyThresholds.unusualLocation) {
        factors.push(`Unusual location: ${minDistance.toFixed(0)} miles from usual location`);
        score += 15;
      }

      // Check for rapid geographic changes
      if (recentEvents.length > 1) {
        const lastEvent = recentEvents[recentEvents.length - 1];
        const timeDiff = (new Date() - lastEvent.timestamp) / (1000 * 60 * 60); // hours
        const lastDistance = this.calculateDistance(location, lastEvent.details.location);

        if (lastDistance > 500 && timeDiff < 6) {
          factors.push(`Rapid location change: ${lastDistance.toFixed(0)} miles in ${timeDiff.toFixed(1)} hours`);
          score += 25;
        }
      }

      return { score, factors };

    } catch (error) {
      console.error('Geographic anomaly check failed:', error);
      return { score: 0, factors: [] };
    }
  }

  /**
   * Check device fingerprint consistency
   * @param {string} userId - User ID
   * @param {Object} metadata - Request metadata
   * @returns {Object} - Device risk assessment
   */
  async checkDeviceFingerprint(userId, metadata) {
    const factors = [];
    let score = 0;

    try {
      const { userAgent, deviceFingerprint } = metadata;
      if (!deviceFingerprint) {
        return { score: 5, factors: ['Device fingerprint not available'] };
      }

      // Get user's recent device fingerprints
      const user = await User.findById(userId);
      const recentEvents = user.securityEvents
        .filter(event => event.timestamp >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
        .filter(event => event.details && event.details.deviceFingerprint);

      if (recentEvents.length === 0) {
        factors.push('New device detected');
        score += 10;
        return { score, factors };
      }

      // Check if device fingerprint matches any recent ones
      const knownDevices = recentEvents.map(event => event.details.deviceFingerprint);
      const isKnownDevice = knownDevices.includes(deviceFingerprint);

      if (!isKnownDevice) {
        factors.push('Unrecognized device');
        score += 20;

        // Check for significant changes in device components
        const latestFingerprint = knownDevices[knownDevices.length - 1];
        const componentChanges = this.compareDeviceFingerprints(deviceFingerprint, latestFingerprint);
        
        if (componentChanges > 3) {
          factors.push(`Multiple device component changes: ${componentChanges}`);
          score += 15;
        }
      }

      return { score, factors };

    } catch (error) {
      console.error('Device fingerprint check failed:', error);
      return { score: 0, factors: [] };
    }
  }

  /**
   * Analyze behavioral patterns
   * @param {string} userId - User ID
   * @param {string} action - Action type
   * @param {Object} metadata - Request metadata
   * @returns {Object} - Behavior risk assessment
   */
  async analyzeBehaviorPattern(userId, action, metadata) {
    const factors = [];
    let score = 0;

    try {
      const user = await User.findById(userId);
      const recentEvents = user.securityEvents
        .filter(event => event.timestamp >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));

      if (recentEvents.length === 0) {
        return { score: 0, factors: [] };
      }

      // Analyze time patterns
      const currentHour = new Date().getHours();
      const usualHours = recentEvents.map(event => event.timestamp.getHours());
      const averageHour = usualHours.reduce((sum, h) => sum + h, 0) / usualHours.length;
      const hourDeviation = Math.abs(currentHour - averageHour);

      if (hourDeviation > this.suspiciousPatterns.anomalyThresholds.unusualTime) {
        factors.push(`Unusual time pattern: ${hourDeviation.toFixed(1)} hours from normal`);
        score += 10;
      }

      // Check for rapid successive actions
      const recentSimilarActions = recentEvents.filter(event => 
        event.type === action && 
        event.timestamp >= new Date(Date.now() - 5 * 60 * 1000) // Last 5 minutes
      );

      if (recentSimilarActions.length > 5) {
        factors.push(`Rapid successive actions: ${recentSimilarActions.length} ${action} attempts in 5 minutes`);
        score += 20;
      }

      return { score, factors };

    } catch (error) {
      console.error('Behavior pattern analysis failed:', error);
      return { score: 0, factors: [] };
    }
  }

  /**
   * Check IP reputation
   * @param {string} ipAddress - IP address to check
   * @returns {Object} - IP reputation assessment
   */
  async checkIPReputation(ipAddress) {
    const factors = [];
    let score = 0;

    try {
      // Check cache first
      const cached = this.ipReputationCache.get(ipAddress);
      if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
        return cached.result;
      }

      // Basic IP checks
      if (this.isPrivateIP(ipAddress)) {
        factors.push('Private IP address');
        score += 5;
      }

      // Check against known bad IP patterns
      if (this.isSuspiciousIP(ipAddress)) {
        factors.push('IP matches suspicious patterns');
        score += 30;
      }

      // In a real implementation, you would check against:
      // - Threat intelligence feeds
      // - Proxy/VPN detection services
      // - Geolocation inconsistencies
      // - Known malicious IP databases

      const result = { score, factors };
      
      // Cache the result
      this.ipReputationCache.set(ipAddress, {
        result,
        timestamp: Date.now()
      });

      return result;

    } catch (error) {
      console.error('IP reputation check failed:', error);
      return { score: 0, factors: [] };
    }
  }

  /**
   * Analyze time-based patterns
   * @param {string} userId - User ID
   * @param {Object} metadata - Request metadata
   * @returns {Object} - Time pattern assessment
   */
  analyzeTimePattern(userId, metadata) {
    const factors = [];
    let score = 0;

    try {
      const now = new Date();
      const hour = now.getHours();
      const dayOfWeek = now.getDay();

      // Flag activity during unusual hours (2 AM - 6 AM)
      if (hour >= 2 && hour <= 6) {
        factors.push('Activity during unusual hours');
        score += 8;
      }

      // Flag weekend activity for business accounts
      if (metadata.accountType === 'business' && (dayOfWeek === 0 || dayOfWeek === 6)) {
        factors.push('Business activity during weekend');
        score += 5;
      }

      return { score, factors };

    } catch (error) {
      console.error('Time pattern analysis failed:', error);
      return { score: 0, factors: [] };
    }
  }

  /**
   * Multi-factor authentication for businesses
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Next middleware function
   */
  async requireBusinessAuth(req, res, next) {
    try {
      const { businessId } = req.body || req.query;
      
      if (!businessId) {
        return res.status(400).json({ error: 'Business ID required' });
      }

      const business = await Business.findOne({
        _id: businessId,
        ownerId: req.session.userId
      });

      if (!business) {
        return res.status(404).json({ error: 'Business not found or access denied' });
      }

      const ipAddress = req.ip || req.connection.remoteAddress;
      
      // Check IP whitelist if configured
      if (business.settings.ipWhitelist && business.settings.ipWhitelist.length > 0) {
        if (!business.settings.ipWhitelist.includes(ipAddress)) {
          console.warn(`🚫 Business access from non-whitelisted IP: ${ipAddress} for business ${business.businessName}`);
          return res.status(403).json({ 
            error: 'Access denied: IP address not whitelisted' 
          });
        }
      }

      // Rate limiting for business operations
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const recentBusinessActions = await this.getRecentBusinessActions(businessId, oneHourAgo);
      
      if (recentBusinessActions > 100) {
        return res.status(429).json({ 
          error: 'Rate limit exceeded for business operations' 
        });
      }

      // Attach business to request for downstream middleware
      req.business = business;
      next();

    } catch (error) {
      console.error('❌ Business authentication failed:', error);
      res.status(500).json({ error: 'Authentication error' });
    }
  }

  // Helper methods

  calculateRiskLevel(score) {
    if (score >= 80) return 'critical';
    if (score >= 60) return 'high';
    if (score >= 40) return 'medium';
    if (score >= 20) return 'low';
    return 'minimal';
  }

  getRecommendedAction(score, factors) {
    if (score >= 80) {
      return 'block_transaction';
    } else if (score >= 60) {
      return 'require_additional_verification';
    } else if (score >= 40) {
      return 'flag_for_review';
    } else if (score >= 20) {
      return 'monitor_closely';
    }
    return 'allow';
  }

  async logSuspiciousActivity(user, riskAssessment) {
    try {
      await user.addSecurityEvent(
        'suspicious_activity',
        riskAssessment.metadata?.ipAddress,
        riskAssessment.metadata?.userAgent,
        crypto.randomBytes(16).toString('hex'),
        {
          riskScore: riskAssessment.riskScore,
          riskLevel: riskAssessment.riskLevel,
          riskFactors: riskAssessment.riskFactors,
          action: riskAssessment.action
        }
      );

      console.warn(`🚨 Suspicious activity detected: ${user.email} - Risk Score: ${riskAssessment.riskScore}`);
      
    } catch (error) {
      console.error('Failed to log suspicious activity:', error);
    }
  }

  calculateDistance(location1, location2) {
    // Simplified distance calculation using Haversine formula
    if (!location1.lat || !location1.lng || !location2.lat || !location2.lng) {
      return 0;
    }

    const R = 3959; // Earth's radius in miles
    const dLat = this.deg2rad(location2.lat - location1.lat);
    const dLng = this.deg2rad(location2.lng - location1.lng);
    
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(this.deg2rad(location1.lat)) * Math.cos(this.deg2rad(location2.lat)) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;
    
    return distance;
  }

  deg2rad(deg) {
    return deg * (Math.PI/180);
  }

  compareDeviceFingerprints(fingerprint1, fingerprint2) {
    // Simplified comparison - count different components
    try {
      const fp1 = JSON.parse(fingerprint1);
      const fp2 = JSON.parse(fingerprint2);
      
      let differences = 0;
      this.deviceComponents.forEach(component => {
        if (fp1[component] !== fp2[component]) {
          differences++;
        }
      });
      
      return differences;
    } catch (error) {
      return 0;
    }
  }

  isPrivateIP(ip) {
    const privateRanges = [
      /^10\./,
      /^192\.168\./,
      /^172\.(1[6-9]|2\d|3[01])\./,
      /^127\./,
      /^::1$/,
      /^fe80:/
    ];
    
    return privateRanges.some(range => range.test(ip));
  }

  isSuspiciousIP(ip) {
    // Basic suspicious IP patterns
    const suspiciousPatterns = [
      /^0\.0\.0\.0$/,
      /^255\.255\.255\.255$/,
      // Add more patterns as needed
    ];
    
    return suspiciousPatterns.some(pattern => pattern.test(ip));
  }

  async getRecentBusinessActions(businessId, since) {
    try {
      const count = await Transaction.countDocuments({
        businessId,
        createdAt: { $gte: since }
      });
      return count;
    } catch (error) {
      return 0;
    }
  }
}

module.exports = AdvancedSecurity;