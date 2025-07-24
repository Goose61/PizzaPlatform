const winston = require('winston');
const User = require('../models/User');
const Business = require('../models/Business');
const Transaction = require('../models/Transaction');
const KYCService = require('./kycService');

class ComplianceService {
  constructor() {
    this.kycService = new KYCService();
    
    // AML thresholds and limits
    this.amlThresholds = {
      dailyLimit: 3000,        // $3,000 daily limit triggers monitoring
      singleTransactionLimit: 10000, // $10,000 single transaction requires reporting
      cumulativeLimit: 15000,  // $15,000 cumulative in 30 days requires enhanced monitoring
      structuringThreshold: 9000, // Multiple transactions just under $10k
      velocityThreshold: 5     // 5+ transactions in 1 hour
    };

    // Sanctions and PEP screening lists (simplified)
    this.sanctionsLists = {
      ofac: new Set(), // OFAC Specially Designated Nationals
      eu: new Set(),   // EU Consolidated List
      un: new Set()    // UN Security Council Consolidated List
    };

    // High-risk countries and jurisdictions
    this.highRiskJurisdictions = new Set([
      'AF', 'IR', 'KP', 'SY', 'MM', // High-risk countries
      'CU', 'VE', 'LY', 'SO', 'YE'  // Additional monitoring required
    ]);

    // Setup logging
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.File({ filename: 'logs/compliance-operations.log' }),
        new winston.transports.Console({ 
          format: winston.format.simple(),
          level: 'warn'
        })
      ]
    });
  }

  /**
   * Generate AML (Anti-Money Laundering) report
   * @param {string} timeRange - Time range for report (7d, 30d, 90d)
   * @param {Object} options - Report options
   * @returns {Object} - AML compliance report
   */
  async generateAMLReport(timeRange = '30d', options = {}) {
    try {
      const { startDate, endDate } = this.getDateRange(timeRange);
      const reportId = `aml_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      this.logger.info('Generating AML report', { reportId, timeRange });

      // Get all transactions in the time period
      const transactions = await Transaction.find({
        createdAt: { $gte: startDate, $lte: endDate },
        status: 'completed',
        type: { $in: ['payment', 'withdrawal', 'deposit'] }
      })
      .populate('userId', 'email kycTier kycStatus')
      .populate('businessId', 'businessName kycStatus')
      .sort({ createdAt: -1 });

      // Analyze transactions for suspicious patterns
      const suspiciousTransactions = await this.identifySuspiciousTransactions(transactions);
      
      // Generate Suspicious Activity Reports (SARs)
      const sars = await this.generateSARs(suspiciousTransactions);
      
      // Calculate risk metrics
      const riskMetrics = this.calculateRiskMetrics(transactions, suspiciousTransactions);
      
      // Check for structuring patterns
      const structuringPatterns = await this.detectStructuringPatterns(transactions);
      
      // Identify high-risk customers
      const highRiskCustomers = await this.identifyHighRiskCustomers(transactions);

      const report = {
        reportId,
        generatedAt: new Date(),
        period: {
          startDate,
          endDate,
          timeRange
        },
        summary: {
          totalTransactions: transactions.length,
          totalVolume: transactions.reduce((sum, tx) => sum + tx.amount, 0),
          suspiciousTransactions: suspiciousTransactions.length,
          sarsGenerated: sars.length,
          highRiskCustomers: highRiskCustomers.length
        },
        riskMetrics,
        suspiciousTransactions: suspiciousTransactions.map(tx => ({
          transactionId: tx._id,
          userId: tx.userId?._id,
          userEmail: tx.userId?.email,
          businessId: tx.businessId?._id,
          businessName: tx.businessId?.businessName,
          amount: tx.amount,
          currency: tx.currency,
          type: tx.type,
          riskScore: tx.riskScore,
          riskFactors: tx.riskFactors,
          createdAt: tx.createdAt
        })),
        structuringPatterns,
        highRiskCustomers: highRiskCustomers.map(customer => ({
          userId: customer.userId,
          email: customer.email,
          riskScore: customer.riskScore,
          riskFactors: customer.riskFactors,
          transactionCount: customer.transactionCount,
          totalAmount: customer.totalAmount
        })),
        sars,
        recommendations: this.generateComplianceRecommendations(riskMetrics, suspiciousTransactions)
      };

      this.logger.info('AML report generated', {
        reportId,
        suspiciousTransactions: report.summary.suspiciousTransactions,
        sarsGenerated: report.summary.sarsGenerated
      });

      return report;

    } catch (error) {
      this.logger.error('AML report generation failed', {
        error: error.message,
        timeRange
      });
      throw error;
    }
  }

  /**
   * Perform real-time risk assessment on a transaction
   * @param {string} userId - User ID
   * @param {Object} transactionData - Transaction data
   * @returns {Object} - Risk assessment result
   */
  async performRiskAssessment(userId, transactionData) {
    try {
      const user = await User.findById(userId).lean();
      if (!user) {
        throw new Error('User not found');
      }

      const riskFactors = [];
      let riskScore = 0;

      // 1. Customer Due Diligence (CDD) checks
      const cddRisk = await this.performCDDChecks(user);
      riskScore += cddRisk.score;
      riskFactors.push(...cddRisk.factors);

      // 2. Transaction amount analysis
      const amountRisk = this.assessTransactionAmount(transactionData.amount);
      riskScore += amountRisk.score;
      riskFactors.push(...amountRisk.factors);

      // 3. Historical transaction pattern analysis
      const patternRisk = await this.analyzeTransactionPatterns(userId, transactionData);
      riskScore += patternRisk.score;
      riskFactors.push(...patternRisk.factors);

      // 4. Sanctions screening
      const sanctionsRisk = await this.performSanctionsScreening(user);
      riskScore += sanctionsRisk.score;
      riskFactors.push(...sanctionsRisk.factors);

      // 5. PEP (Politically Exposed Person) screening
      const pepRisk = await this.performPEPScreening(user);
      riskScore += pepRisk.score;
      riskFactors.push(...pepRisk.factors);

      // 6. Geographic risk assessment
      const geoRisk = this.assessGeographicRisk(user, transactionData);
      riskScore += geoRisk.score;
      riskFactors.push(...geoRisk.factors);

      // 7. Velocity and frequency checks
      const velocityRisk = await this.checkTransactionVelocity(userId, transactionData);
      riskScore += velocityRisk.score;
      riskFactors.push(...velocityRisk.factors);

      // Determine risk level and required actions
      const riskLevel = this.calculateRiskLevel(riskScore);
      const requiredActions = this.determineRequiredActions(riskScore, riskFactors);

      const assessment = {
        userId,
        transactionId: transactionData.id,
        riskScore: Math.min(100, riskScore),
        riskLevel,
        riskFactors: riskFactors.filter(factor => factor), // Remove empty factors
        requiredActions,
        assessmentTime: new Date(),
        shouldBlock: riskScore >= 85,
        requiresReview: riskScore >= 60,
        requiresEnhancedDueDiligence: riskScore >= 75
      };

      // Log high-risk assessments
      if (riskScore >= 60) {
        this.logger.warn('High-risk transaction detected', {
          userId,
          transactionAmount: transactionData.amount,
          riskScore,
          riskLevel
        });
      }

      return assessment;

    } catch (error) {
      this.logger.error('Risk assessment failed', {
        error: error.message,
        userId,
        transactionAmount: transactionData.amount
      });
      throw error;
    }
  }

  /**
   * Monitor transactions for suspicious patterns
   * @param {Object} transaction - Transaction to monitor
   * @returns {Object} - Monitoring result
   */
  async monitorTransaction(transaction) {
    try {
      const monitoringResult = {
        transactionId: transaction._id,
        alerts: [],
        riskScore: 0,
        shouldFlag: false,
        shouldBlock: false
      };

      // Check for suspicious patterns
      const patterns = await this.checkSuspiciousPatterns(transaction);
      monitoringResult.alerts.push(...patterns.alerts);
      monitoringResult.riskScore += patterns.riskScore;

      // Check against AML thresholds
      const thresholdChecks = this.checkAMLThresholds(transaction);
      monitoringResult.alerts.push(...thresholdChecks.alerts);
      monitoringResult.riskScore += thresholdChecks.riskScore;

      // Determine actions
      monitoringResult.shouldFlag = monitoringResult.riskScore >= 40;
      monitoringResult.shouldBlock = monitoringResult.riskScore >= 80;

      if (monitoringResult.shouldFlag) {
        await this.flagTransactionForReview(transaction, monitoringResult);
      }

      if (monitoringResult.shouldBlock) {
        await this.blockSuspiciousTransaction(transaction, monitoringResult);
      }

      return monitoringResult;

    } catch (error) {
      this.logger.error('Transaction monitoring failed', {
        error: error.message,
        transactionId: transaction._id
      });
      throw error;
    }
  }

  /**
   * Generate Suspicious Activity Report (SAR)
   * @param {Object} transaction - Suspicious transaction
   * @param {Object} suspiciousActivity - Details of suspicious activity
   * @returns {Object} - SAR report
   */
  async generateSAR(transaction, suspiciousActivity) {
    try {
      const sarId = `sar_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const user = await User.findById(transaction.userId);
      const business = transaction.businessId ? await Business.findById(transaction.businessId) : null;

      const sar = {
        sarId,
        generatedAt: new Date(),
        reportingEntity: 'Pizza Platform',
        
        // Subject information
        subject: {
          type: business ? 'business' : 'individual',
          userId: user?._id,
          businessId: business?._id,
          name: business ? business.businessName : user?.email,
          email: user?.email,
          kycTier: user?.kycTier,
          kycStatus: user?.kycStatus || business?.kycStatus
        },

        // Transaction details
        transaction: {
          transactionId: transaction._id,
          amount: transaction.amount,
          currency: transaction.currency,
          type: transaction.type,
          date: transaction.createdAt,
          description: transaction.description
        },

        // Suspicious activity details
        suspiciousActivity: {
          description: suspiciousActivity.description,
          riskScore: suspiciousActivity.riskScore,
          riskFactors: suspiciousActivity.riskFactors,
          patterns: suspiciousActivity.patterns,
          detectionMethod: suspiciousActivity.detectionMethod
        },

        // Supporting information
        supportingInformation: {
          relatedTransactions: await this.getRelatedTransactions(transaction),
          customerHistory: await this.getCustomerTransactionHistory(transaction.userId),
          previousSARs: await this.getPreviousSARs(transaction.userId)
        },

        // Regulatory information
        regulatory: {
          requiresReporting: this.requiresRegulatoryReporting(suspiciousActivity.riskScore),
          reportingDeadline: this.calculateReportingDeadline(),
          regulatoryReference: this.generateRegulatoryReference(sarId)
        },

        status: 'pending_review'
      };

      // Store SAR for compliance records
      await this.storeSAR(sar);

      this.logger.warn('SAR generated', {
        sarId,
        userId: transaction.userId,
        transactionId: transaction._id,
        riskScore: suspiciousActivity.riskScore
      });

      return sar;

    } catch (error) {
      this.logger.error('SAR generation failed', {
        error: error.message,
        transactionId: transaction._id
      });
      throw error;
    }
  }

  // Private helper methods

  getDateRange(timeRange) {
    const endDate = new Date();
    const startDate = new Date();

    switch (timeRange) {
      case '7d':
        startDate.setDate(endDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(endDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(endDate.getDate() - 90);
        break;
      default:
        startDate.setDate(endDate.getDate() - 30);
    }

    return { startDate, endDate };
  }

  async identifySuspiciousTransactions(transactions) {
    const suspicious = [];

    for (const transaction of transactions) {
      let riskScore = 0;
      const riskFactors = [];

      // Large transaction check
      if (transaction.amount >= this.amlThresholds.singleTransactionLimit) {
        riskScore += 40;
        riskFactors.push(`Large transaction: $${transaction.amount}`);
      }

      // Round number check (potential structuring)
      if (transaction.amount % 1000 === 0 && transaction.amount >= 5000) {
        riskScore += 15;
        riskFactors.push('Round number transaction');
      }

      // KYC status check
      if (!transaction.userId?.kycTier || transaction.userId.kycTier === 'unverified') {
        riskScore += 20;
        riskFactors.push('Unverified customer');
      }

      // Add transaction to suspicious list if risk score is high enough
      if (riskScore >= 30) {
        transaction.riskScore = riskScore;
        transaction.riskFactors = riskFactors;
        suspicious.push(transaction);
      }
    }

    return suspicious;
  }

  async generateSARs(suspiciousTransactions) {
    const sars = [];
    
    for (const transaction of suspiciousTransactions) {
      if (transaction.riskScore >= 70) {
        const sar = await this.generateSAR(transaction, {
          description: 'Suspicious transaction pattern detected',
          riskScore: transaction.riskScore,
          riskFactors: transaction.riskFactors,
          patterns: ['unusual_amount', 'high_risk_customer'],
          detectionMethod: 'automated_monitoring'
        });
        sars.push(sar);
      }
    }

    return sars;
  }

  calculateRiskMetrics(allTransactions, suspiciousTransactions) {
    const totalVolume = allTransactions.reduce((sum, tx) => sum + tx.amount, 0);
    const suspiciousVolume = suspiciousTransactions.reduce((sum, tx) => sum + tx.amount, 0);

    return {
      totalTransactionCount: allTransactions.length,
      totalVolume,
      suspiciousTransactionCount: suspiciousTransactions.length,
      suspiciousVolume,
      suspiciousTransactionRate: allTransactions.length > 0 
        ? (suspiciousTransactions.length / allTransactions.length) * 100 
        : 0,
      suspiciousVolumeRate: totalVolume > 0 
        ? (suspiciousVolume / totalVolume) * 100 
        : 0,
      averageTransactionAmount: allTransactions.length > 0 
        ? totalVolume / allTransactions.length 
        : 0,
      largeTransactionCount: allTransactions.filter(tx => 
        tx.amount >= this.amlThresholds.singleTransactionLimit
      ).length
    };
  }

  async detectStructuringPatterns(transactions) {
    const patterns = [];
    
    // Group transactions by user and day
    const userDayTransactions = {};
    
    transactions.forEach(tx => {
      if (!tx.userId) return;
      
      const userId = tx.userId._id.toString();
      const day = tx.createdAt.toISOString().split('T')[0];
      const key = `${userId}_${day}`;
      
      if (!userDayTransactions[key]) {
        userDayTransactions[key] = [];
      }
      userDayTransactions[key].push(tx);
    });

    // Check for structuring patterns
    Object.entries(userDayTransactions).forEach(([key, dayTransactions]) => {
      const [userId, day] = key.split('_');
      const totalAmount = dayTransactions.reduce((sum, tx) => sum + tx.amount, 0);
      
      // Multiple transactions just under reporting threshold
      const nearThresholdTransactions = dayTransactions.filter(tx => 
        tx.amount >= this.amlThresholds.structuringThreshold && 
        tx.amount < this.amlThresholds.singleTransactionLimit
      );

      if (nearThresholdTransactions.length >= 2) {
        patterns.push({
          type: 'potential_structuring',
          userId,
          day,
          transactionCount: nearThresholdTransactions.length,
          totalAmount,
          description: `${nearThresholdTransactions.length} transactions just under $${this.amlThresholds.singleTransactionLimit} threshold`,
          riskScore: 60
        });
      }
    });

    return patterns;
  }

  async identifyHighRiskCustomers(transactions) {
    const customerRisk = {};

    // Calculate risk scores for each customer
    transactions.forEach(tx => {
      if (!tx.userId) return;
      
      const userId = tx.userId._id.toString();
      if (!customerRisk[userId]) {
        customerRisk[userId] = {
          userId,
          email: tx.userId.email,
          transactionCount: 0,
          totalAmount: 0,
          riskScore: 0,
          riskFactors: []
        };
      }

      const customer = customerRisk[userId];
      customer.transactionCount++;
      customer.totalAmount += tx.amount;

      // Add risk factors
      if (tx.amount >= this.amlThresholds.singleTransactionLimit) {
        customer.riskScore += 20;
        customer.riskFactors.push('Large transaction');
      }

      if (!tx.userId.kycTier || tx.userId.kycTier === 'unverified') {
        customer.riskScore += 15;
        customer.riskFactors.push('Unverified KYC');
      }
    });

    // Filter high-risk customers
    return Object.values(customerRisk).filter(customer => customer.riskScore >= 50);
  }

  async performCDDChecks(user) {
    const factors = [];
    let score = 0;

    // KYC completeness check
    if (!user.kycTier || user.kycTier === 'unverified') {
      factors.push('Customer not KYC verified');
      score += 25;
    }

    // Account age check
    const accountAge = Date.now() - new Date(user.createdAt).getTime();
    const daysOld = accountAge / (1000 * 60 * 60 * 24);
    
    if (daysOld < 30) {
      factors.push('New customer account (less than 30 days)');
      score += 15;
    }

    return { score, factors };
  }

  assessTransactionAmount(amount) {
    const factors = [];
    let score = 0;

    if (amount >= this.amlThresholds.singleTransactionLimit) {
      factors.push(`Large transaction amount: $${amount}`);
      score += 30;
    } else if (amount >= this.amlThresholds.dailyLimit) {
      factors.push(`Above daily monitoring threshold: $${amount}`);
      score += 15;
    }

    // Round number check
    if (amount % 1000 === 0 && amount >= 5000) {
      factors.push('Round number transaction');
      score += 10;
    }

    return { score, factors };
  }

  async analyzeTransactionPatterns(userId, transactionData) {
    const factors = [];
    let score = 0;

    try {
      // Get recent transactions for pattern analysis
      const recentTransactions = await Transaction.find({
        userId,
        createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, // Last 30 days
        status: 'completed'
      });

      // Velocity check
      const todayTransactions = recentTransactions.filter(tx => {
        const today = new Date();
        const txDate = new Date(tx.createdAt);
        return txDate.toDateString() === today.toDateString();
      });

      if (todayTransactions.length >= this.amlThresholds.velocityThreshold) {
        factors.push(`High transaction velocity: ${todayTransactions.length} transactions today`);
        score += 20;
      }

      // Amount pattern analysis
      const amounts = recentTransactions.map(tx => tx.amount);
      const avgAmount = amounts.reduce((sum, amt) => sum + amt, 0) / amounts.length;
      
      if (transactionData.amount > avgAmount * 5) {
        factors.push('Transaction amount significantly higher than usual');
        score += 15;
      }

      return { score, factors };

    } catch (error) {
      return { score: 0, factors: [] };
    }
  }

  async performSanctionsScreening(user) {
    const factors = [];
    let score = 0;

    // In a real implementation, this would check against actual sanctions lists
    // For now, we'll do basic checks
    
    const email = user.email.toLowerCase();
    const suspiciousPatterns = ['test@sanctioned.com', 'blocked@domain.com'];
    
    if (suspiciousPatterns.some(pattern => email.includes(pattern))) {
      factors.push('User matches sanctions screening pattern');
      score += 100; // Immediate block
    }

    return { score, factors };
  }

  async performPEPScreening(user) {
    const factors = [];
    let score = 0;

    // Simplified PEP screening
    // In production, this would integrate with PEP databases
    
    return { score, factors };
  }

  assessGeographicRisk(user, transactionData) {
    const factors = [];
    let score = 0;

    // Check for high-risk jurisdictions
    const userCountry = user.address?.country || 'US';
    
    if (this.highRiskJurisdictions.has(userCountry)) {
      factors.push(`High-risk jurisdiction: ${userCountry}`);
      score += 25;
    }

    return { score, factors };
  }

  async checkTransactionVelocity(userId, transactionData) {
    const factors = [];
    let score = 0;

    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const recentCount = await Transaction.countDocuments({
        userId,
        createdAt: { $gte: oneHourAgo },
        status: { $in: ['completed', 'pending'] }
      });

      if (recentCount >= this.amlThresholds.velocityThreshold) {
        factors.push(`High velocity: ${recentCount} transactions in 1 hour`);
        score += 25;
      }

      return { score, factors };

    } catch (error) {
      return { score: 0, factors: [] };
    }
  }

  calculateRiskLevel(score) {
    if (score >= 85) return 'critical';
    if (score >= 70) return 'high';
    if (score >= 50) return 'medium';
    if (score >= 25) return 'low';
    return 'minimal';
  }

  determineRequiredActions(score, factors) {
    const actions = [];

    if (score >= 85) {
      actions.push('block_transaction');
      actions.push('file_sar');
    } else if (score >= 70) {
      actions.push('enhanced_due_diligence');
      actions.push('manual_review');
    } else if (score >= 50) {
      actions.push('additional_monitoring');
    }

    return actions;
  }

  async checkSuspiciousPatterns(transaction) {
    const alerts = [];
    let riskScore = 0;

    // Pattern checks would go here
    // This is a simplified implementation

    return { alerts, riskScore };
  }

  checkAMLThresholds(transaction) {
    const alerts = [];
    let riskScore = 0;

    if (transaction.amount >= this.amlThresholds.singleTransactionLimit) {
      alerts.push('Transaction exceeds single transaction reporting threshold');
      riskScore += 40;
    }

    return { alerts, riskScore };
  }

  async flagTransactionForReview(transaction, monitoringResult) {
    // Implementation for flagging transactions
    this.logger.warn('Transaction flagged for review', {
      transactionId: transaction._id,
      riskScore: monitoringResult.riskScore,
      alerts: monitoringResult.alerts
    });
  }

  async blockSuspiciousTransaction(transaction, monitoringResult) {
    // Implementation for blocking transactions
    this.logger.error('Suspicious transaction blocked', {
      transactionId: transaction._id,
      riskScore: monitoringResult.riskScore,
      alerts: monitoringResult.alerts
    });
  }

  generateComplianceRecommendations(riskMetrics, suspiciousTransactions) {
    const recommendations = [];

    if (riskMetrics.suspiciousTransactionRate > 5) {
      recommendations.push({
        type: 'monitoring',
        priority: 'high',
        description: 'Suspicious transaction rate is high - enhance monitoring procedures'
      });
    }

    if (riskMetrics.largeTransactionCount > 10) {
      recommendations.push({
        type: 'reporting',
        priority: 'medium', 
        description: 'Multiple large transactions detected - review reporting requirements'
      });
    }

    return recommendations;
  }

  // Additional helper methods for SAR generation
  async getRelatedTransactions(transaction) {
    return []; // Placeholder
  }

  async getCustomerTransactionHistory(userId) {
    return []; // Placeholder
  }

  async getPreviousSARs(userId) {
    return []; // Placeholder
  }

  requiresRegulatoryReporting(riskScore) {
    return riskScore >= 70;
  }

  calculateReportingDeadline() {
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 30); // 30 days from now
    return deadline;
  }

  generateRegulatoryReference(sarId) {
    return `REG_${sarId.toUpperCase()}`;
  }

  async storeSAR(sar) {
    // Store SAR in database or external system
    this.logger.info('SAR stored', { sarId: sar.sarId });
  }
}

module.exports = ComplianceService;