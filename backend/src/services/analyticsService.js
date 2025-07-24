const winston = require('winston');
const Business = require('../models/Business');
const Transaction = require('../models/Transaction');
const User = require('../models/User');

class AnalyticsService {
  constructor() {
    // Setup logging
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.File({ filename: 'logs/analytics-operations.log' }),
        new winston.transports.Console({ 
          format: winston.format.simple(),
          level: 'error'
        })
      ]
    });
  }

  /**
   * Get comprehensive business metrics
   * @param {string} businessId - Business ID
   * @param {string} timeRange - Time range (7d, 30d, 90d, 1y)
   * @returns {Object} - Business metrics
   */
  async getBusinessMetrics(businessId, timeRange = '30d') {
    try {
      const business = await Business.findById(businessId);
      if (!business) {
        throw new Error('Business not found');
      }

      // Calculate date range
      const { startDate, endDate } = this.getDateRange(timeRange);

      // Get transactions for the period
      const transactions = await Transaction.find({
        businessId,
        createdAt: { $gte: startDate, $lte: endDate },
        status: 'completed'
      }).populate('userId', 'email kycTier');

      // Calculate core metrics
      const metrics = await this.calculateCoreMetrics(transactions, business);
      
      // Calculate advanced metrics
      const advancedMetrics = await this.calculateAdvancedMetrics(transactions, business, timeRange);
      
      // Get comparative metrics (previous period)
      const previousPeriodMetrics = await this.getPreviousPeriodMetrics(
        businessId, 
        timeRange, 
        startDate
      );

      const result = {
        businessId,
        businessName: business.businessName,
        timeRange,
        period: { startDate, endDate },
        metrics: {
          ...metrics,
          ...advancedMetrics
        },
        comparison: previousPeriodMetrics,
        trends: this.calculateTrends(metrics, previousPeriodMetrics),
        generatedAt: new Date()
      };

      this.logger.info('Business metrics calculated', {
        businessId,
        timeRange,
        totalRevenue: metrics.totalRevenue,
        totalTransactions: metrics.totalTransactions
      });

      return result;

    } catch (error) {
      this.logger.error('Business metrics calculation failed', {
        error: error.message,
        businessId,
        timeRange
      });
      throw error;
    }
  }

  /**
   * Get customer insights and behavior analysis
   * @param {string} businessId - Business ID
   * @param {Object} options - Analysis options
   * @returns {Object} - Customer insights
   */
  async getCustomerInsights(businessId, options = {}) {
    try {
      const { timeRange = '30d', segmentBy = 'value' } = options;
      const { startDate, endDate } = this.getDateRange(timeRange);

      // Get customer transactions
      const transactions = await Transaction.find({
        businessId,
        type: 'payment',
        status: 'completed',
        createdAt: { $gte: startDate, $lte: endDate },
        userId: { $exists: true }
      }).populate('userId', 'email kycTier createdAt');

      // Group transactions by customer
      const customerData = this.groupTransactionsByCustomer(transactions);
      
      // Calculate customer segments
      const segments = this.calculateCustomerSegments(customerData, segmentBy);
      
      // Calculate customer lifetime value
      const lifetimeValues = await this.calculateCustomerLifetimeValues(businessId, customerData);
      
      // Analyze customer behavior patterns
      const behaviorPatterns = this.analyzeBehaviorPatterns(customerData);
      
      // Calculate retention metrics
      const retentionMetrics = await this.calculateRetentionMetrics(businessId, timeRange);

      const insights = {
        businessId,
        timeRange,
        period: { startDate, endDate },
        totalCustomers: Object.keys(customerData).length,
        newCustomers: this.countNewCustomers(customerData, startDate),
        returningCustomers: this.countReturningCustomers(customerData),
        segments,
        lifetimeValues,
        behaviorPatterns,
        retentionMetrics,
        topCustomers: this.getTopCustomers(customerData, 10),
        customerAcquisition: await this.getCustomerAcquisitionMetrics(businessId, timeRange),
        generatedAt: new Date()
      };

      this.logger.info('Customer insights generated', {
        businessId,
        totalCustomers: insights.totalCustomers,
        newCustomers: insights.newCustomers
      });

      return insights;

    } catch (error) {
      this.logger.error('Customer insights calculation failed', {
        error: error.message,
        businessId
      });
      throw error;
    }
  }

  /**
   * Get real-time dashboard data
   * @param {string} businessId - Business ID
   * @returns {Object} - Real-time dashboard data
   */
  async getRealTimeDashboardData(businessId) {
    try {
      const business = await Business.findById(businessId);
      if (!business) {
        throw new Error('Business not found');
      }

      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const thisWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      // Get recent transactions
      const recentTransactions = await Transaction.find({
        businessId,
        status: 'completed'
      })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('userId', 'email');

      // Calculate today's metrics
      const todaysTransactions = recentTransactions.filter(tx => 
        tx.createdAt >= today
      );

      // Calculate this week's metrics
      const weekTransactions = recentTransactions.filter(tx => 
        tx.createdAt >= thisWeek
      );

      // Calculate this month's metrics
      const monthTransactions = recentTransactions.filter(tx => 
        tx.createdAt >= thisMonth
      );

      // Get pending transactions
      const pendingTransactions = await Transaction.find({
        businessId,
        status: 'pending'
      }).sort({ createdAt: -1 });

      const dashboardData = {
        businessId,
        businessName: business.businessName,
        lastUpdated: now,
        
        // Today's metrics
        today: {
          revenue: this.sumTransactionAmounts(todaysTransactions, 'payment'),
          transactions: todaysTransactions.filter(tx => tx.type === 'payment').length,
          customers: new Set(todaysTransactions.map(tx => tx.userId?.toString())).size,
          averageValue: this.calculateAverageTransactionValue(todaysTransactions, 'payment')
        },

        // This week's metrics
        thisWeek: {
          revenue: this.sumTransactionAmounts(weekTransactions, 'payment'),
          transactions: weekTransactions.filter(tx => tx.type === 'payment').length,
          customers: new Set(weekTransactions.map(tx => tx.userId?.toString())).size,
          averageValue: this.calculateAverageTransactionValue(weekTransactions, 'payment')
        },

        // This month's metrics
        thisMonth: {
          revenue: this.sumTransactionAmounts(monthTransactions, 'payment'),
          transactions: monthTransactions.filter(tx => tx.type === 'payment').length,
          customers: new Set(monthTransactions.map(tx => tx.userId?.toString())).size,
          averageValue: this.calculateAverageTransactionValue(monthTransactions, 'payment')
        },

        // Loyalty vault status
        loyaltyVault: {
          balance: business.vaultBalance,
          rewardRate: business.loyaltyVault.rewardRate,
          totalDistributed: business.loyaltyVault.totalDistributed,
          isActive: business.loyaltyVault.isActive
        },

        // Recent activity
        recentTransactions: recentTransactions.slice(0, 10).map(tx => ({
          id: tx._id,
          type: tx.type,
          amount: tx.amount,
          currency: tx.currency,
          status: tx.status,
          customerEmail: tx.userId?.email || 'Anonymous',
          createdAt: tx.createdAt
        })),

        // Pending actions
        pendingTransactions: pendingTransactions.map(tx => ({
          id: tx._id,
          type: tx.type,
          amount: tx.amount,
          currency: tx.currency,
          createdAt: tx.createdAt
        })),

        // Quick stats
        stats: {
          totalCustomers: business.analytics.uniqueCustomers || 0,
          conversionRate: business.analytics.conversionRate || 0,
          customerRetentionRate: business.analytics.customerRetentionRate || 0
        }
      };

      return dashboardData;

    } catch (error) {
      this.logger.error('Real-time dashboard data failed', {
        error: error.message,
        businessId
      });
      throw error;
    }
  }

  /**
   * Generate comprehensive analytics report
   * @param {string} businessId - Business ID
   * @param {Object} options - Report options
   * @returns {Object} - Analytics report
   */
  async generateAnalyticsReport(businessId, options = {}) {
    try {
      const {
        timeRange = '30d',
        includeCustomerInsights = true,
        includeTransactionDetails = false,
        format = 'json'
      } = options;

      // Get business metrics
      const businessMetrics = await this.getBusinessMetrics(businessId, timeRange);
      
      // Get customer insights if requested
      let customerInsights = null;
      if (includeCustomerInsights) {
        customerInsights = await this.getCustomerInsights(businessId, { timeRange });
      }

      // Get transaction details if requested
      let transactionDetails = null;
      if (includeTransactionDetails) {
        const { startDate, endDate } = this.getDateRange(timeRange);
        transactionDetails = await Transaction.find({
          businessId,
          createdAt: { $gte: startDate, $lte: endDate }
        })
        .populate('userId', 'email kycTier')
        .sort({ createdAt: -1 });
      }

      const report = {
        reportId: `report_${businessId}_${Date.now()}`,
        businessId,
        generatedAt: new Date(),
        timeRange,
        businessMetrics,
        customerInsights,
        transactionDetails,
        summary: {
          totalRevenue: businessMetrics.metrics.totalRevenue,
          totalTransactions: businessMetrics.metrics.totalTransactions,
          uniqueCustomers: customerInsights?.totalCustomers || 0,
          averageTransactionValue: businessMetrics.metrics.averageTransactionValue,
          customerRetentionRate: customerInsights?.retentionMetrics?.retentionRate || 0
        },
        recommendations: this.generateRecommendations(businessMetrics, customerInsights)
      };

      this.logger.info('Analytics report generated', {
        reportId: report.reportId,
        businessId,
        timeRange
      });

      return report;

    } catch (error) {
      this.logger.error('Analytics report generation failed', {
        error: error.message,
        businessId
      });
      throw error;
    }
  }

  // Helper methods

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
      case '1y':
        startDate.setFullYear(endDate.getFullYear() - 1);
        break;
      default:
        startDate.setDate(endDate.getDate() - 30);
    }

    return { startDate, endDate };
  }

  async calculateCoreMetrics(transactions, business) {
    const paymentTransactions = transactions.filter(tx => tx.type === 'payment');
    const rewardTransactions = transactions.filter(tx => tx.type === 'reward');
    
    const totalRevenue = this.sumTransactionAmounts(paymentTransactions);
    const totalTransactions = paymentTransactions.length;
    const totalRewardsDistributed = this.sumTransactionAmounts(rewardTransactions);
    
    return {
      totalRevenue,
      totalTransactions,
      totalRewardsDistributed,
      averageTransactionValue: totalTransactions > 0 ? totalRevenue / totalTransactions : 0,
      uniqueCustomers: new Set(
        paymentTransactions.map(tx => tx.userId?.toString()).filter(Boolean)
      ).size,
      // Payment method breakdown
      paymentMethods: this.getPaymentMethodBreakdown(paymentTransactions),
      // Transaction volume by day
      dailyVolume: this.getDailyVolumeBreakdown(paymentTransactions)
    };
  }

  async calculateAdvancedMetrics(transactions, business, timeRange) {
    const paymentTransactions = transactions.filter(tx => tx.type === 'payment');
    
    return {
      // Customer tier analysis
      customerTierBreakdown: this.getCustomerTierBreakdown(paymentTransactions),
      
      // Peak usage analysis
      peakHours: this.analyzePeakUsage(paymentTransactions),
      
      // Revenue concentration
      revenueConcentration: this.analyzeRevenueConcentration(paymentTransactions),
      
      // Growth metrics
      growthRate: await this.calculateGrowthRate(business._id, timeRange),
      
      // Loyalty program effectiveness
      loyaltyEffectiveness: await this.analyzeLoyaltyEffectiveness(
        business._id, 
        transactions
      )
    };
  }

  async getPreviousPeriodMetrics(businessId, timeRange, currentStartDate) {
    try {
      const periodLength = new Date() - currentStartDate;
      const previousEndDate = new Date(currentStartDate);
      const previousStartDate = new Date(currentStartDate.getTime() - periodLength);

      const previousTransactions = await Transaction.find({
        businessId,
        createdAt: { $gte: previousStartDate, $lte: previousEndDate },
        status: 'completed'
      });

      const paymentTransactions = previousTransactions.filter(tx => tx.type === 'payment');
      
      return {
        totalRevenue: this.sumTransactionAmounts(paymentTransactions),
        totalTransactions: paymentTransactions.length,
        uniqueCustomers: new Set(
          paymentTransactions.map(tx => tx.userId?.toString()).filter(Boolean)
        ).size
      };
    } catch (error) {
      return { totalRevenue: 0, totalTransactions: 0, uniqueCustomers: 0 };
    }
  }

  calculateTrends(currentMetrics, previousMetrics) {
    const calculatePercentageChange = (current, previous) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous) * 100;
    };

    return {
      revenueGrowth: calculatePercentageChange(
        currentMetrics.totalRevenue, 
        previousMetrics.totalRevenue
      ),
      transactionGrowth: calculatePercentageChange(
        currentMetrics.totalTransactions, 
        previousMetrics.totalTransactions
      ),
      customerGrowth: calculatePercentageChange(
        currentMetrics.uniqueCustomers, 
        previousMetrics.uniqueCustomers
      )
    };
  }

  groupTransactionsByCustomer(transactions) {
    const customerData = {};
    
    transactions.forEach(tx => {
      if (!tx.userId) return;
      
      const customerId = tx.userId._id.toString();
      if (!customerData[customerId]) {
        customerData[customerId] = {
          userId: customerId,
          email: tx.userId.email,
          kycTier: tx.userId.kycTier,
          transactions: [],
          totalSpent: 0,
          firstTransaction: tx.createdAt,
          lastTransaction: tx.createdAt
        };
      }
      
      customerData[customerId].transactions.push(tx);
      customerData[customerId].totalSpent += tx.amount;
      
      if (tx.createdAt < customerData[customerId].firstTransaction) {
        customerData[customerId].firstTransaction = tx.createdAt;
      }
      if (tx.createdAt > customerData[customerId].lastTransaction) {
        customerData[customerId].lastTransaction = tx.createdAt;
      }
    });
    
    return customerData;
  }

  // Additional helper methods
  sumTransactionAmounts(transactions, type = null) {
    return transactions
      .filter(tx => !type || tx.type === type)
      .reduce((sum, tx) => sum + (tx.amount || 0), 0);
  }

  calculateAverageTransactionValue(transactions, type = null) {
    const filteredTransactions = transactions.filter(tx => !type || tx.type === type);
    if (filteredTransactions.length === 0) return 0;
    
    return this.sumTransactionAmounts(filteredTransactions) / filteredTransactions.length;
  }

  getPaymentMethodBreakdown(transactions) {
    const breakdown = {};
    transactions.forEach(tx => {
      const method = tx.currency || 'unknown';
      breakdown[method] = (breakdown[method] || 0) + 1;
    });
    return breakdown;
  }

  getDailyVolumeBreakdown(transactions) {
    const breakdown = {};
    transactions.forEach(tx => {
      const day = tx.createdAt.toISOString().split('T')[0];
      breakdown[day] = (breakdown[day] || 0) + tx.amount;
    });
    return breakdown;
  }

  getCustomerTierBreakdown(transactions) {
    const breakdown = { unverified: 0, tier1: 0, tier2: 0 };
    transactions.forEach(tx => {
      const tier = tx.userId?.kycTier || 'unverified';
      breakdown[tier] = (breakdown[tier] || 0) + 1;
    });
    return breakdown;
  }

  analyzePeakUsage(transactions) {
    const hourlyBreakdown = {};
    transactions.forEach(tx => {
      const hour = tx.createdAt.getHours();
      hourlyBreakdown[hour] = (hourlyBreakdown[hour] || 0) + 1;
    });
    
    const peakHour = Object.keys(hourlyBreakdown)
      .reduce((a, b) => hourlyBreakdown[a] > hourlyBreakdown[b] ? a : b);
    
    return {
      hourlyBreakdown,
      peakHour: parseInt(peakHour),
      peakTransactions: hourlyBreakdown[peakHour]
    };
  }

  analyzeRevenueConcentration(transactions) {
    const customerRevenue = {};
    transactions.forEach(tx => {
      if (tx.userId) {
        const customerId = tx.userId._id.toString();
        customerRevenue[customerId] = (customerRevenue[customerId] || 0) + tx.amount;
      }
    });
    
    const totalRevenue = Object.values(customerRevenue).reduce((a, b) => a + b, 0);
    const sortedRevenue = Object.values(customerRevenue).sort((a, b) => b - a);
    
    // Calculate top 20% of customers' revenue share
    const top20Count = Math.ceil(sortedRevenue.length * 0.2);
    const top20Revenue = sortedRevenue.slice(0, top20Count).reduce((a, b) => a + b, 0);
    
    return {
      totalCustomers: sortedRevenue.length,
      top20PercentShare: totalRevenue > 0 ? (top20Revenue / totalRevenue) * 100 : 0,
      averageRevenuePerCustomer: totalRevenue / sortedRevenue.length
    };
  }

  async calculateGrowthRate(businessId, timeRange) {
    // Simplified growth rate calculation
    // In a real implementation, this would compare multiple periods
    return {
      monthOverMonth: 0, // Placeholder
      quarterOverQuarter: 0, // Placeholder
      yearOverYear: 0 // Placeholder
    };
  }

  async analyzeLoyaltyEffectiveness(businessId, transactions) {
    const rewardTransactions = transactions.filter(tx => tx.type === 'reward');
    const paymentTransactions = transactions.filter(tx => tx.type === 'payment');
    
    const totalRewardsDistributed = this.sumTransactionAmounts(rewardTransactions);
    const totalRevenue = this.sumTransactionAmounts(paymentTransactions);
    
    return {
      totalRewardsDistributed,
      rewardToRevenueRatio: totalRevenue > 0 ? (totalRewardsDistributed / totalRevenue) * 100 : 0,
      customersWithRewards: new Set(
        rewardTransactions.map(tx => tx.userId?.toString()).filter(Boolean)
      ).size
    };
  }

  calculateCustomerSegments(customerData, segmentBy) {
    // Simplified customer segmentation
    const customers = Object.values(customerData);
    
    if (segmentBy === 'value') {
      return {
        highValue: customers.filter(c => c.totalSpent > 1000).length,
        mediumValue: customers.filter(c => c.totalSpent >= 100 && c.totalSpent <= 1000).length,
        lowValue: customers.filter(c => c.totalSpent < 100).length
      };
    }
    
    return {};
  }

  async calculateCustomerLifetimeValues(businessId, customerData) {
    // Simplified CLV calculation
    const customers = Object.values(customerData);
    const totalCLV = customers.reduce((sum, customer) => sum + customer.totalSpent, 0);
    const averageCLV = customers.length > 0 ? totalCLV / customers.length : 0;
    
    return {
      totalCLV,
      averageCLV,
      highestCLV: Math.max(...customers.map(c => c.totalSpent), 0)
    };
  }

  analyzeBehaviorPatterns(customerData) {
    const customers = Object.values(customerData);
    
    return {
      averageTransactionsPerCustomer: customers.length > 0 
        ? customers.reduce((sum, c) => sum + c.transactions.length, 0) / customers.length 
        : 0,
      repeatCustomers: customers.filter(c => c.transactions.length > 1).length,
      oneTimeCustomers: customers.filter(c => c.transactions.length === 1).length
    };
  }

  async calculateRetentionMetrics(businessId, timeRange) {
    // Simplified retention calculation
    return {
      retentionRate: 0, // Placeholder
      churnRate: 0, // Placeholder
      averageCustomerLifespan: 0 // Placeholder
    };
  }

  countNewCustomers(customerData, startDate) {
    return Object.values(customerData)
      .filter(customer => customer.firstTransaction >= startDate).length;
  }

  countReturningCustomers(customerData) {
    return Object.values(customerData)
      .filter(customer => customer.transactions.length > 1).length;
  }

  getTopCustomers(customerData, limit = 10) {
    return Object.values(customerData)
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, limit)
      .map(customer => ({
        userId: customer.userId,
        email: customer.email,
        totalSpent: customer.totalSpent,
        transactionCount: customer.transactions.length,
        firstTransaction: customer.firstTransaction,
        lastTransaction: customer.lastTransaction
      }));
  }

  async getCustomerAcquisitionMetrics(businessId, timeRange) {
    // Placeholder for customer acquisition metrics
    return {
      acquisitionCost: 0,
      acquisitionRate: 0,
      acquisitionChannels: {}
    };
  }

  generateRecommendations(businessMetrics, customerInsights) {
    const recommendations = [];
    
    // Revenue-based recommendations
    if (businessMetrics.metrics.totalRevenue < 1000) {
      recommendations.push({
        type: 'revenue',
        priority: 'high',
        title: 'Increase Revenue',
        description: 'Consider implementing promotional campaigns to boost sales'
      });
    }
    
    // Customer retention recommendations
    if (customerInsights && customerInsights.behaviorPatterns.oneTimeCustomers > customerInsights.behaviorPatterns.repeatCustomers) {
      recommendations.push({
        type: 'retention',
        priority: 'medium',
        title: 'Improve Customer Retention',
        description: 'Focus on converting one-time customers to repeat customers through loyalty programs'
      });
    }
    
    return recommendations;
  }
}

module.exports = AnalyticsService;