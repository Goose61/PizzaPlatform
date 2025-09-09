/**
 * VaultService - Unified Platform Vault Management
 * 
 * Handles:
 * - Unified platform vault ($71,175 total, $7,117.50/merchant)
 * - Optional Kamino staking (4% APY, $1,190.70 split)
 * - Fund rewards ($47,974.40) and gift card redemptions ($6,000)
 * - Surplus management: $23,200.60
 */

const { Connection, PublicKey, Transaction, SystemProgram } = require('@solana/web3.js');
const { Token, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const secretManager = require('../config/secrets');

class VaultService {
  constructor() {
    this.connection = null;
    this.vaultAddress = null;
    this.treasuryAddress = null;
    
    // Vault economics (scalable)
    this.vaultContributionPerMerchant = 7117.50; // $7,117.50 per merchant per year
    this.baseVaultSize = 71175; // Base vault size for initial operations
    
    // Vault allocation
    this.allocations = {
      rewards: 47974.40,      // $47,974.40 for rewards (67.5%)
      giftCards: 6000,        // $6,000 for gift card redemptions (8.4%)
      surplus: 23200.60       // $23,200.60 surplus (32.6%)
    };
    
    // Kamino staking configuration
    this.kaminoStaking = {
      enabled: false,
      apy: 0.04,              // 4% APY
      totalYield: 2381.40,    // 4% of $59,534 (rewards + gift cards)
      platformShare: 1190.70, // 50% of yield
      merchantShare: 1190.70  // 50% of yield
    };
    
    this.kaminoProgramId = null;
  }

  async initialize() {
    const secrets = await secretManager.initialize();
    
    // Initialize Solana connection
    this.connection = new Connection(secrets.solanaRpcEndpoint);
    this.vaultAddress = new PublicKey(secrets.platformVaultAddress);
    this.treasuryAddress = new PublicKey(secrets.treasuryWalletAddress);
    this.kaminoProgramId = new PublicKey(secrets.kaminoProgramId);
    
    console.log('✅ VaultService initialized');
    console.log(`📊 Vault size: $${this.totalVaultSize.toLocaleString()}`);
    console.log(`💰 Surplus: $${this.allocations.surplus.toLocaleString()}`);
  }

  /**
   * Get current vault status and balances
   */
  async getVaultStatus() {
    try {
      // Get vault balance (simplified - would use actual program accounts)
      const vaultBalance = {
        usdc: this.totalVaultSize,
        pizzaSPL: 0
      };

      // Calculate allocations
      const allocatedFunds = {
        rewards: {
          allocated: this.allocations.rewards,
          used: 0, // Would track actual usage
          remaining: this.allocations.rewards
        },
        giftCards: {
          allocated: this.allocations.giftCards,
          used: 0, // Would track actual usage
          remaining: this.allocations.giftCards
        },
        surplus: {
          amount: this.allocations.surplus,
          stakingEnabled: this.kaminoStaking.enabled,
          yield: this.kaminoStaking.enabled ? this.kaminoStaking.totalYield : 0
        }
      };

      return {
        totalVaultSize: this.totalVaultSize,
        currentBalance: vaultBalance,
        allocations: allocatedFunds,
        merchantCount: this.merchantCount,
        contributionPerMerchant: this.vaultContributionPerMerchant,
        stakingStatus: this.getStakingStatus()
      };
    } catch (error) {
      console.error('Error getting vault status:', error);
      throw new Error('Failed to get vault status');
    }
  }

  /**
   * Process merchant vault contribution
   */
  async processMerchantContribution(businessId, amount) {
    try {
      // Validate contribution amount matches expected
      const expectedContribution = this.vaultContributionPerMerchant / 365; // Daily contribution
      
      if (Math.abs(amount - expectedContribution) > 0.01) {
        console.warn(`Contribution amount mismatch for ${businessId}: expected ${expectedContribution}, got ${amount}`);
      }

      // Record contribution (simplified)
      const contribution = {
        businessId,
        amount,
        timestamp: new Date(),
        type: 'vault_contribution',
        allocationBreakdown: {
          rewards: amount * (this.allocations.rewards / this.totalVaultSize),
          giftCards: amount * (this.allocations.giftCards / this.totalVaultSize),
          surplus: amount * (this.allocations.surplus / this.totalVaultSize)
        }
      };

      return contribution;
    } catch (error) {
      console.error('Error processing merchant contribution:', error);
      throw new Error('Failed to process vault contribution');
    }
  }

  /**
   * Fund reward distribution from vault
   */
  async fundRewardDistribution(amount, recipient, transactionId) {
    try {
      // Check if sufficient funds in rewards allocation
      const rewardFunds = this.allocations.rewards; // Would track actual remaining balance
      
      if (amount > rewardFunds) {
        throw new Error('Insufficient reward funds in vault');
      }

      // Create funding transaction (simplified)
      const funding = {
        type: 'reward_funding',
        amount,
        recipient,
        sourceAllocation: 'rewards',
        transactionId,
        timestamp: new Date(),
        vaultBalance: rewardFunds - amount
      };

      console.log(`💰 Funded ${amount} $PIZZA SPL reward from vault`);
      return funding;
    } catch (error) {
      console.error('Error funding reward distribution:', error);
      throw new Error('Failed to fund reward distribution');
    }
  }

  /**
   * Fund gift card redemption from vault
   */
  async fundGiftCardRedemption(cardValue, recipient, nftAddress) {
    try {
      // Check if sufficient funds in gift card allocation
      const giftCardFunds = this.allocations.giftCards; // Would track actual remaining balance
      
      if (cardValue > giftCardFunds) {
        throw new Error('Insufficient gift card funds in vault');
      }

      // Create funding transaction (simplified)
      const funding = {
        type: 'gift_card_funding',
        amount: cardValue,
        recipient,
        nftAddress,
        sourceAllocation: 'giftCards',
        timestamp: new Date(),
        vaultBalance: giftCardFunds - cardValue
      };

      console.log(`🎁 Funded ${cardValue} $PIZZA SPL gift card redemption from vault`);
      return funding;
    } catch (error) {
      console.error('Error funding gift card redemption:', error);
      throw new Error('Failed to fund gift card redemption');
    }
  }

  /**
   * Enable/disable Kamino staking for surplus funds
   */
  async toggleKaminoStaking(enable = true) {
    try {
      this.kaminoStaking.enabled = enable;
      
      if (enable) {
        // Stake surplus + rewards + gift card allocations
        const stakingAmount = this.allocations.surplus + this.allocations.rewards + this.allocations.giftCards;
        
        // Initialize Kamino staking (simplified)
        const stakingResult = {
          stakingEnabled: true,
          stakingAmount,
          estimatedYield: stakingAmount * this.kaminoStaking.apy,
          platformYieldShare: (stakingAmount * this.kaminoStaking.apy) / 2,
          merchantYieldShare: (stakingAmount * this.kaminoStaking.apy) / 2,
          stakingPool: 'kamino_usdc_pool',
          stakingDate: new Date()
        };

        console.log(`📈 Kamino staking enabled: $${stakingAmount.toLocaleString()} staked`);
        console.log(`💹 Estimated annual yield: $${stakingResult.estimatedYield.toLocaleString()}`);
        
        return stakingResult;
      } else {
        // Disable staking
        console.log('📉 Kamino staking disabled');
        return { stakingEnabled: false };
      }
    } catch (error) {
      console.error('Error toggling Kamino staking:', error);
      throw new Error('Failed to toggle staking');
    }
  }

  /**
   * Get Kamino staking status and yields
   */
  getStakingStatus() {
    if (!this.kaminoStaking.enabled) {
      return {
        enabled: false,
        potentialYield: this.kaminoStaking.totalYield,
        stakingAmount: this.allocations.surplus + this.allocations.rewards + this.allocations.giftCards
      };
    }

    return {
      enabled: true,
      apy: this.kaminoStaking.apy,
      totalYield: this.kaminoStaking.totalYield,
      platformShare: this.kaminoStaking.platformShare,
      merchantShare: this.kaminoStaking.merchantShare,
      stakingAmount: this.allocations.surplus + this.allocations.rewards + this.allocations.giftCards,
      yieldPerMerchant: this.kaminoStaking.merchantShare / this.merchantCount // $119.07 per merchant
    };
  }

  /**
   * Calculate merchant staking dividends
   */
  getMerchantStakingDividends(businessId) {
    if (!this.kaminoStaking.enabled) {
      return { dividends: 0, stakingEnabled: false };
    }

    const dividendsPerMerchant = this.kaminoStaking.merchantShare / this.merchantCount; // $119.07
    
    return {
      stakingEnabled: true,
      annualDividends: dividendsPerMerchant,
      monthlyDividends: dividendsPerMerchant / 12, // $9.92 per month
      contributionRequired: this.vaultContributionPerMerchant, // $7,117.50
      roi: (dividendsPerMerchant / this.vaultContributionPerMerchant) * 100, // 1.67% ROI
      nextPayoutDate: this.calculateNextPayoutDate()
    };
  }

  /**
   * Calculate next staking payout date (quarterly)
   */
  calculateNextPayoutDate() {
    const now = new Date();
    const quarter = Math.floor(now.getMonth() / 3);
    const nextQuarter = new Date(now.getFullYear(), (quarter + 1) * 3, 1);
    
    if (nextQuarter <= now) {
      nextQuarter.setFullYear(nextQuarter.getFullYear() + 1);
      nextQuarter.setMonth(0);
    }
    
    return nextQuarter;
  }

  /**
   * Get vault analytics and projections
   */
  async getVaultAnalytics() {
    const utilizationRate = {
      rewards: this.allocations.rewards / this.totalVaultSize,
      giftCards: this.allocations.giftCards / this.totalVaultSize,
      surplus: this.allocations.surplus / this.totalVaultSize
    };

    const projections = {
      dailyContribution: this.totalVaultSize / 365, // $195 per day
      monthlyContribution: this.totalVaultSize / 12, // $5,931.25 per month
      rewardBurnRate: this.allocations.rewards / 365, // $131.41 per day for rewards
      giftCardBurnRate: this.allocations.giftCards / 365, // $16.44 per day for gift cards
      surplusAccumulation: this.allocations.surplus + (this.kaminoStaking.enabled ? this.kaminoStaking.totalYield : 0)
    };

    return {
      vaultSize: this.totalVaultSize,
      allocations: this.allocations,
      utilizationRate,
      projections,
      stakingStatus: this.getStakingStatus(),
      merchantCount: this.merchantCount,
      sustainabilityMetrics: {
        rewardCoverage: this.allocations.rewards / (this.merchantCount * 36500 * 0.15), // Days of reward coverage
        giftCardCoverage: this.allocations.giftCards / (this.merchantCount * 600), // Days of gift card coverage
        surplusRatio: this.allocations.surplus / this.totalVaultSize // 32.6% surplus ratio
      }
    };
  }

  /**
   * Emergency vault operations
   */
  async emergencyWithdraw(amount, reason, authorizedBy) {
    try {
      // Only allow emergency withdrawals from surplus
      if (amount > this.allocations.surplus) {
        throw new Error('Emergency withdrawal exceeds surplus allocation');
      }

      const withdrawal = {
        type: 'emergency_withdrawal',
        amount,
        reason,
        authorizedBy,
        timestamp: new Date(),
        remainingSurplus: this.allocations.surplus - amount
      };

      console.log(`🚨 Emergency withdrawal: $${amount} - ${reason}`);
      return withdrawal;
    } catch (error) {
      console.error('Emergency withdrawal failed:', error);
      throw new Error('Failed to process emergency withdrawal');
    }
  }

  /**
   * Validate vault health and sustainability
   */
  async validateVaultHealth() {
    const analytics = await this.getVaultAnalytics();
    
    const healthChecks = {
      sufficientRewardFunds: analytics.allocations.rewards > 0,
      sufficientGiftCardFunds: analytics.allocations.giftCards > 0,
      positiveSurplus: analytics.allocations.surplus > 0,
      sustainableRewardRate: analytics.sustainabilityMetrics.rewardCoverage > 30, // 30+ days coverage
      sustainableGiftCardRate: analytics.sustainabilityMetrics.giftCardCoverage > 30, // 30+ days coverage
      healthySurplusRatio: analytics.sustainabilityMetrics.surplusRatio > 0.3 // 30%+ surplus
    };

    const overallHealth = Object.values(healthChecks).every(check => check);

    return {
      healthy: overallHealth,
      checks: healthChecks,
      recommendations: this.getHealthRecommendations(healthChecks),
      analytics
    };
  }

  /**
   * Get health recommendations based on vault status
   */
  getHealthRecommendations(healthChecks) {
    const recommendations = [];

    if (!healthChecks.sufficientRewardFunds) {
      recommendations.push('Increase merchant contributions or reduce reward rate');
    }

    if (!healthChecks.sustainableRewardRate) {
      recommendations.push('Monitor reward distribution rate closely');
    }

    if (!healthChecks.healthySurplusRatio) {
      recommendations.push('Consider enabling Kamino staking to increase yield');
    }

    if (recommendations.length === 0) {
      recommendations.push('Vault operating optimally - consider enabling staking for additional yield');
    }

    return recommendations;
  }
}

module.exports = VaultService;