const winston = require('winston');
const Business = require('../models/Business');
// RampService removed - no longer needed for CN-only system

/**
 * BusinessTypeService - CN-Only Business Management
 * 
 * Handles CN (crypto-native) business onboarding and management
 * Applies unified fee structure (1% platform + 1.3% vault)
 * Manages USDC settlement to non-custodial wallets
 * Handles vault management with optional Kamino staking
 */
class BusinessTypeService {
  constructor() {
    // Unified fee structure for all CN businesses (NCN removed)
    this.feeStructure = {
      platformFeePercent: 0.01,       // 1% platform fee ($0.15 on $15)
      vaultContributionPercent: 0.013, // 1.3% vault contribution ($0.195 on $15)
      totalFeePercent: 0.023,         // 2.3% total fees ($0.345 on $15)
      settlementMethod: 'usdc-retain',
      netSettlementAmount: 14.655,    // $15 - $0.345 = $14.655
      stakingAllowed: true,
      kaminoStakingAPY: 0.04          // 4% APY
    };
    
    // Annual contribution targets
    this.annualTargets = {
      vaultContribution: 7117.50,      // $7,117.50 per business per year
      transactionVolume: 547500,       // $547,500 per business per year
      averageTransactionAmount: 15     // $15 USDC per transaction
    };
    
    // Kamino staking configuration for CN businesses
    this.kaminoStaking = {
      apy: 0.04,                       // 4% APY
      yieldSplit: {
        businessShare: 119.07,         // $119.07 dividends to business
        platformShare: 119.07          // $119.07 to platform
      }
    };
    
    // Initialize services
    // Ramp service removed - CN businesses only
    
    // Setup logging
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.File({ filename: 'logs/business-type-operations.log' }),
        new winston.transports.Console({
          format: winston.format.simple(),
          level: 'error'
        })
      ]
    });
  }
  
  /**
   * Initialize CN business (all businesses are CN now)
   */
  async initializeBusiness(businessData) {
    try {
      const { businessId } = businessData;
      
      this.logger.info('CN business initialization started', {
        businessId
      });
      
      return {
        businessType: 'CN',
        confidence: 1.0,
        reasoning: ['Crypto Native business type (only supported type)'],
        feeStructure: this.feeStructure,
        benefits: this.getBusinessTypeBenefits()
      };
      
    } catch (error) {
      this.logger.error('Business initialization failed', error);
      throw error;
    }
  }
  
  /**
   * Apply CN business type to existing business (all businesses are CN now)
   */
  async applyBusinessType(businessId, adminId) {
    try {
      const business = await Business.findById(businessId);
      if (!business) {
        throw new Error('Business not found');
      }
      
      // Setup CN business configuration
      await this.setupCNStakingEligibility(businessId);
      
      const updateData = {
        businessType: 'CN',
        feeStructure: this.feeStructure,
        settlement: {
          method: this.feeStructure.settlementMethod,
          stakingEnabled: this.feeStructure.stakingAllowed
        },
        vaultContribution: {
          totalContributed: business.vaultContribution?.totalContributed || 0,
          stakingEnabled: true,
          stakingYield: {
            totalEarned: business.vaultContribution?.stakingYield?.totalEarned || 0,
            businessShare: 0,
            platformShare: 0
          }
        },
        lastTypeUpdate: new Date(),
        typeUpdatedBy: adminId
      };
      
      await Business.findByIdAndUpdate(businessId, updateData);
      
      this.logger.info('CN business type applied successfully', {
        businessId,
        adminId,
        feeStructure: this.feeStructure
      });
      
      return {
        success: true,
        businessType: 'CN',
        feeStructure: this.feeStructure,
        settlement: updateData.settlement,
        nextSteps: this.getBusinessTypeNextSteps()
      };
      
    } catch (error) {
      this.logger.error('Failed to apply CN business type', error);
      throw error;
    }
  }
  
  /**
   * Calculate fees for CN business transaction
   */
  calculateTransactionFees(transactionAmount = 15) {
    try {
      const platformFee = transactionAmount * this.feeStructure.platformFeePercent;
      const vaultContribution = transactionAmount * this.feeStructure.vaultContributionPercent;
      const totalFees = platformFee + vaultContribution;
      const merchantAmount = transactionAmount - totalFees;
      
      return {
        transactionAmount,
        platformFee: Math.round(platformFee * 10000) / 10000,
        vaultContribution: Math.round(vaultContribution * 10000) / 10000,
        totalFees: Math.round(totalFees * 10000) / 10000,
        merchantAmount: Math.round(merchantAmount * 10000) / 10000,
        feePercentage: this.feeStructure.totalFeePercent * 100,
        businessType: 'CN'
      };
      
    } catch (error) {
      this.logger.error('CN fee calculation failed', error);
      throw error;
    }
  }
  
  
  /**
   * Setup Kamino staking eligibility for CN business
   */
  async setupCNStakingEligibility(businessId) {
    try {
      const business = await Business.findById(businessId);
      
      const stakingConfig = {
        eligible: true,
        apy: this.kaminoStaking.apy,
        yieldSplitRatio: {
          business: 0.5,
          platform: 0.5
        },
        minimumStakingAmount: 1000, // $1,000 USDC minimum
        setupDate: new Date()
      };
      
      await Business.findByIdAndUpdate(businessId, {
        'vaultContribution.stakingConfig': stakingConfig
      });
      
      this.logger.info('Kamino staking eligibility setup completed', {
        businessId,
        apy: this.kaminoStaking.apy
      });
      
    } catch (error) {
      this.logger.error('CN staking setup failed', error);
      // Don't throw error - staking can be enabled later
      this.logger.warn('Business can still operate without staking initially');
    }
  }
  
  /**
   * Process CN settlement (USDC retention with optional staking)
   */
  async processSettlement(businessId, settlementData) {
    try {
      const business = await Business.findById(businessId);
      if (!business) {
        throw new Error('Business not found');
      }
      
      const { enableStaking = false, stakingAmount = 0 } = settlementData;
      
      let settlementResult = {
        businessId: business._id,
        settlementType: 'usdc-retain',
        usdcRetained: business.vaultContribution?.totalContributed || 0,
        stakingEnabled: enableStaking
      };
      
      // Process Kamino staking if enabled
      if (enableStaking && stakingAmount > 0) {
        const stakingResult = await this.processKaminoStaking(business._id, stakingAmount);
        settlementResult = { ...settlementResult, ...stakingResult };
      }
      
      // Update business settlement tracking
      await this.updateSettlementTracking(business._id, 'CN', settlementResult);
      
      this.logger.info('CN settlement processed', {
        businessId: business._id,
        usdcRetained: settlementResult.usdcRetained,
        stakingEnabled: enableStaking,
        stakingAmount
      });
      
      return settlementResult;
      
    } catch (error) {
      this.logger.error('CN settlement failed', error);
      throw error;
    }
  }
  
  /**
   * Get CN business analytics
   */
  async getBusinessAnalytics() {
    try {
      const cnCount = await Business.countDocuments({ businessType: 'CN' });
      const unclassifiedCount = await Business.countDocuments({ businessType: { $exists: false } });
      
      // Get fee revenue for CN businesses
      const cnRevenue = await this.calculateRevenueByType('CN');
      
      // Get settlement statistics
      const settlementStats = await this.getSettlementStatistics();
      
      return {
        distribution: {
          CN: cnCount,
          unclassified: unclassifiedCount,
          total: cnCount + unclassifiedCount
        },
        revenue: {
          CN: cnRevenue,
          total: cnRevenue
        },
        settlements: settlementStats,
        targets: this.annualTargets
      };
      
    } catch (error) {
      this.logger.error('Failed to get CN business analytics', error);
      throw error;
    }
  }
  
  // Helper methods
  getBusinessTypeBenefits() {
    return [
      'Lower platform fees (1% platform fee)',
      'USDC retention and flexibility',
      'Optional 4% APY through Kamino staking',
      'Advanced loyalty program customization',
      'Significant annual savings vs traditional processors',
      '$119.07 annual dividends from staking (when enabled)'
    ];
  }
  
  getBusinessTypeNextSteps() {
    return [
      'Set up USDC wallet for merchant payments',
      'Configure loyalty program rules and perks',
      'Consider enabling Kamino staking for 4% APY',
      'Customize merchant dashboard preferences'
    ];
  }
  
  async calculateRevenueByType(businessType) {
    // Calculate total revenue generated by businesses of this type
    // This would aggregate transaction fees from the database
    return 0; // Placeholder
  }
  
  async getSettlementStatistics() {
    // Get settlement statistics for CN businesses only
    const stakingEnabled = await Business.countDocuments({ 
      businessType: 'CN',
      'vaultContribution.stakingEnabled': true 
    });
    
    return {
      cnStakingEnabled: stakingEnabled,
      totalVaultContributions: 0 // Would be calculated from actual data
    };
  }
  
  async updateSettlementTracking(businessId, businessType, settlementData) {
    // Update business record with settlement tracking data
    await Business.findByIdAndUpdate(businessId, {
      $push: {
        'settlementHistory': {
          type: businessType,
          data: settlementData,
          timestamp: new Date()
        }
      },
      'lastSettlement': new Date()
    });
  }
  
  async processKaminoStaking(businessId, stakingAmount) {
    // Process Kamino staking for CN business
    // This would integrate with Kamino protocol
    return {
      stakingAmount,
      expectedYield: stakingAmount * this.kaminoStaking.apy,
      businessShare: this.kaminoStaking.yieldSplit.businessShare,
      platformShare: this.kaminoStaking.yieldSplit.platformShare
    };
  }

  /**
   * Classify business and setup initial configuration
   * Returns placeholder wallet address - businesses need to link their actual wallets
   */
  async classifyBusiness(businessData) {
    try {
      const { businessId, businessType } = businessData;
      
      this.logger.info('Business classification started', {
        businessId,
        businessType
      });

      // For CN businesses, return placeholder configuration
      // Actual wallet linking happens through Phantom wallet connection
      return {
        businessType: 'CN',
        walletAddress: '', // Empty - business must link their own wallet via Phantom
        rampAccountId: null, // CN businesses don't use Ramp
        feeStructure: this.feeStructure,
        settlement: {
          method: 'usdc-retain',
          stakingEnabled: true
        }
      };
      
    } catch (error) {
      this.logger.error('Business classification failed', error);
      throw new Error('Failed to classify business: ' + error.message);
    }
  }
}

module.exports = BusinessTypeService;