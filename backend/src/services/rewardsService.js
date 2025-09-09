const winston = require('winston');
const { Connection, PublicKey } = require('@solana/web3.js');
const User = require('../models/User');
const Business = require('../models/Business');
const Transaction = require('../models/Transaction');

/**
 * RewardsService - Fixed Rate Reward Distribution
 * 
 * Handles fixed 0.3 $PIZZA SPL reward per $15 transaction
 * Manages platform vault funding from 1.3% transaction fees
 * Distributes rewards from unified platform vault with $2,320.06 annual surplus
 * Cost-controlled at $0.15 per reward vs $0.195 vault contribution
 */
class RewardsService {
  constructor() {
    this.connection = new Connection(
      process.env.SOLANA_RPC_ENDPOINT || 'https://api.devnet.solana.com'
    );
    
    // Fixed reward configuration
    this.fixedRewardAmount = 0.3;        // 0.3 $PIZZA SPL per transaction
    this.transactionAmount = 15;         // Fixed $15 USDC transactions
    this.rewardCost = 0.15;             // $0.15 cost per reward
    this.vaultContributionPerTx = 0.195; // $0.195 from 1.3% of $15
    
    // Annual targets and projections
    this.annualTargets = {
      vaultContribution: 7117.50,       // $7,117.50 per business per year
      rewardDistribution: 4797.44,      // $4,797.44 in rewards per business
      vaultSurplus: 2320.06,           // $2,320.06 surplus per business
      transactionsPerBusiness: 36500,   // 100 transactions per day
      pizzaTokensPerBusiness: 10950     // 36,500 * 0.3 = 10,950 tokens
    };
    
    // Token configuration
    this.pizzaSPLMint = new PublicKey(process.env.PIZZA_TOKEN_MINT);
    this.usdcMint = new PublicKey(process.env.USDC_MINT);
    this.treasuryAddress = new PublicKey(process.env.TREASURY_WALLET_ADDRESS);
    
    // Initialize services
    this.GiftCardService = require('./giftCardService');
    this.giftCardService = new this.GiftCardService();
    
    // Setup logging
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.File({ filename: 'logs/rewards-operations.log' }),
        new winston.transports.Console({
          format: winston.format.simple(),
          level: 'error'
        })
      ]
    });
  }
  
  /**
   * Process fixed reward distribution for payment transaction
   */
  async processPaymentReward(transactionData) {
    try {
      const { 
        userId,
        businessId,
        transactionId,
        customerWalletAddress,
        transactionAmount = 15
      } = transactionData;
      
      // Validate transaction amount (must be $15)
      if (transactionAmount !== this.transactionAmount) {
        throw new Error(`Invalid transaction amount. Must be $${this.transactionAmount}`);
      }
      
      // Get business for vault contribution calculation
      const business = await Business.findById(businessId);
      if (!business) {
        throw new Error('Business not found');
      }
      
      // Calculate fees and contributions
      const feeCalculation = business.calculateTransactionFees(transactionAmount);
      const vaultContribution = feeCalculation.vaultContribution;
      
      // Distribute fixed reward to customer
      const rewardResult = await this.distributeFixedReward({
        userId,
        customerWalletAddress,
        amount: this.fixedRewardAmount,
        transactionId
      });
      
      // Fund platform vault
      await this.fundPlatformVault({
        businessId,
        amount: vaultContribution,
        transactionId
      });
      
      // Update transaction record with reward info
      await Transaction.findById(transactionId).then(tx => {
        if (tx) {
          tx.recordRewardDistribution({
            tokens: this.fixedRewardAmount,
            vaultContribution,
            transactionId: rewardResult.distributionTxId
          });
        }
      });
      
      // Update user payment statistics
      await this.updateUserPaymentStats(userId, businessId, transactionAmount);
      
      this.logger.info('Payment reward processed', {
        userId,
        businessId,
        transactionId,
        rewardAmount: this.fixedRewardAmount,
        vaultContribution,
        rewardCost: this.rewardCost,
        surplus: vaultContribution - this.rewardCost
      });
      
      return {
        rewardDistributed: this.fixedRewardAmount,
        vaultContribution,
        rewardCost: this.rewardCost,
        surplus: vaultContribution - this.rewardCost,
        distributionTxId: rewardResult.distributionTxId
      };
      
    } catch (error) {
      this.logger.error('Payment reward processing failed', error);
      throw error;
    }
  }
  
  /**
   * Distribute fixed 0.3 $PIZZA SPL reward to customer
   */
  async distributeFixedReward(rewardData) {
    try {
      const { userId, customerWalletAddress, amount, transactionId } = rewardData;
      
      // Create reward distribution transaction on Solana
      const distributionTx = await this.createRewardDistributionTx({
        recipientAddress: customerWalletAddress,
        amount,
        fromVault: 'platform'
      });
      
      // Update user wallet balance
      const user = await User.findById(userId);
      if (user) {
        await user.updateBalance('pizza_spl', amount);
        await user.processPayment(rewardData.businessId, this.transactionAmount);
      }
      
      this.logger.info('Fixed reward distributed', {
        userId,
        customerWallet: customerWalletAddress,
        amount,
        distributionTxId: distributionTx.signature,
        referenceTransactionId: transactionId
      });
      
      return {
        distributionTxId: distributionTx.signature,
        amount,
        recipient: customerWalletAddress,
        cost: this.rewardCost
      };
      
    } catch (error) {
      this.logger.error('Fixed reward distribution failed', error);
      throw error;
    }
  }
  
  /**
   * Fund platform vault with 1.3% contribution from transactions
   */
  async fundPlatformVault(vaultData) {
    try {
      const { businessId, amount, transactionId } = vaultData;
      
      // Update business vault contribution tracking
      const business = await Business.findById(businessId);
      if (business) {
        await business.addVaultContribution(amount);
      }
      
      // Record vault funding transaction
      const vaultTx = await this.createVaultFundingTx({
        fromBusiness: businessId,
        amount,
        vaultType: 'platform'
      });
      
      this.logger.info('Platform vault funded', {
        businessId,
        amount,
        vaultTxId: vaultTx.signature,
        referenceTransactionId: transactionId,
        businessTotalContribution: business?.vaultContribution?.totalContributed || 0
      });
      
      return {
        vaultTxId: vaultTx.signature,
        amount,
        businessId
      };
      
    } catch (error) {
      this.logger.error('Platform vault funding failed', error);
      throw error;
    }
  }
  
  /**
   * Issue gift card as additional reward (100 per month per business)
   */
  async issueGiftCardReward(giftCardData) {
    try {
      const { businessId, recipientWalletAddress, campaignId } = giftCardData;
      
      // Check if business has reached monthly quota
      const business = await Business.findById(businessId);
      const monthlyCount = await this.giftCardService.getCurrentMonthMintCount(businessId);
      
      if (monthlyCount >= 100) {
        return {
          issued: false,
          reason: 'Monthly gift card quota reached (100 cards/month)'
        };
      }
      
      // Issue gift card NFT
      const giftCardResult = await this.giftCardService.mintGiftCard({
        businessId,
        recipientWalletAddress,
        customMessage: 'Reward gift card from your recent purchase!',
        campaignId
      });
      
      this.logger.info('Gift card reward issued', {
        businessId,
        recipientWallet: recipientWalletAddress,
        giftCardId: giftCardResult.giftCardId,
        value: 5, // 5 $PIZZA SPL value
        monthlyCount: monthlyCount + 1
      });
      
      return {
        issued: true,
        giftCardId: giftCardResult.giftCardId,
        value: 5,
        expiryDate: giftCardResult.expiryDate,
        nftAddress: giftCardResult.nftAddress
      };
      
    } catch (error) {
      this.logger.error('Gift card reward issuance failed', error);
      return {
        issued: false,
        reason: 'Gift card issuance failed',
        error: error.message
      };
    }
  }
  
  /**
   * Calculate merchant loyalty perks based on $PIZZA SPL holdings
   */
  async calculateLoyaltyPerks(userData) {
    try {
      const { userId, businessId, pizzaSPLBalance } = userData;
      
      const business = await Business.findById(businessId);
      if (!business || !business.loyaltyProgram.isActive) {
        return {
          hasPerks: false,
          reason: 'Business loyalty program not active'
        };
      }
      
      const availablePerks = [];
      
      // Check discount rules
      for (const discountRule of business.loyaltyProgram.discountRules) {
        if (pizzaSPLBalance >= discountRule.requiredTokens) {
          availablePerks.push({
            type: 'discount',
            value: `${discountRule.discountPercent}%`,
            description: discountRule.description,
            requiredTokens: discountRule.requiredTokens
          });
        }
      }
      
      // Check NFT rewards
      for (const nftReward of business.loyaltyProgram.nftRewards) {
        if (pizzaSPLBalance >= nftReward.requiredTokens) {
          availablePerks.push({
            type: 'nft',
            value: nftReward.nftType,
            description: nftReward.description,
            requiredTokens: nftReward.requiredTokens
          });
        }
      }
      
      // Check credit conversion
      const creditRules = business.loyaltyProgram.creditRules;
      if (creditRules && creditRules.conversionRate > 0) {
        const availableCredit = Math.floor(pizzaSPLBalance / creditRules.conversionRate);
        if (availableCredit > 0) {
          availablePerks.push({
            type: 'store_credit',
            value: `$${availableCredit}`,
            description: `Convert ${creditRules.conversionRate} $PIZZA SPL to $1 store credit`,
            conversionRate: creditRules.conversionRate,
            redemptionRate: creditRules.redemptionRate
          });
        }
      }
      
      this.logger.info('Loyalty perks calculated', {
        userId,
        businessId,
        pizzaSPLBalance,
        availablePerks: availablePerks.length
      });
      
      return {
        hasPerks: availablePerks.length > 0,
        perks: availablePerks,
        totalBalance: pizzaSPLBalance
      };
      
    } catch (error) {
      this.logger.error('Loyalty perk calculation failed', error);
      return {
        hasPerks: false,
        error: error.message
      };
    }
  }
  
  /**
   * Get reward distribution analytics
   */
  async getRewardAnalytics(businessId = null) {
    try {
      // Build aggregation pipeline
      const matchStage = {
        type: 'payment',
        status: 'confirmed',
        'rewards.pizzaTokensDistributed': { $gt: 0 }
      };
      
      if (businessId) {
        matchStage.businessId = new require('mongoose').Types.ObjectId(businessId);
      }
      
      const analytics = await Transaction.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: businessId ? null : '$businessId',
            totalTransactions: { $sum: 1 },
            totalRewardsDistributed: { $sum: '$rewards.pizzaTokensDistributed' },
            totalVaultContributions: { $sum: '$rewards.vaultFunded' },
            averageRewardPerTx: { $avg: '$rewards.pizzaTokensDistributed' },
            totalRewardCost: { $sum: { $multiply: ['$rewards.pizzaTokensDistributed', this.rewardCost / this.fixedRewardAmount] } },
            giftCardsIssued: { $sum: { $cond: ['$rewards.giftCardIssued', 1, 0] } }
          }
        },
        {
          $project: {
            businessId: '$_id',
            totalTransactions: 1,
            totalRewardsDistributed: 1,
            totalVaultContributions: 1,
            averageRewardPerTx: 1,
            totalRewardCost: 1,
            giftCardsIssued: 1,
            vaultSurplus: { $subtract: ['$totalVaultContributions', '$totalRewardCost'] },
            averageVaultContribution: { $divide: ['$totalVaultContributions', '$totalTransactions'] }
          }
        }
      ]);
      
      const result = analytics[0] || {
        totalTransactions: 0,
        totalRewardsDistributed: 0,
        totalVaultContributions: 0,
        averageRewardPerTx: 0,
        totalRewardCost: 0,
        giftCardsIssued: 0,
        vaultSurplus: 0
      };
      
      // Add configuration and targets
      result.configuration = {
        fixedRewardAmount: this.fixedRewardAmount,
        rewardCost: this.rewardCost,
        vaultContributionPerTx: this.vaultContributionPerTx,
        targetSurplusPerTx: this.vaultContributionPerTx - this.rewardCost
      };
      
      result.targets = this.annualTargets;
      
      return result;
      
    } catch (error) {
      this.logger.error('Reward analytics retrieval failed', error);
      return {
        error: error.message,
        configuration: {
          fixedRewardAmount: this.fixedRewardAmount,
          rewardCost: this.rewardCost,
          vaultContributionPerTx: this.vaultContributionPerTx
        }
      };
    }
  }
  
  /**
   * Update user payment statistics
   */
  async updateUserPaymentStats(userId, businessId, transactionAmount) {
    try {
      const user = await User.findById(userId);
      if (!user) return;
      
      // Update payment totals
      if (!user.payments) {
        user.payments = {
          totalTransactions: 0,
          totalVolume: 0,
          pizzaSPLRewardsEarned: 0,
          favoriteBusinesses: []
        };
      }
      
      user.payments.totalTransactions += 1;
      user.payments.totalVolume += transactionAmount;
      user.payments.pizzaSPLRewardsEarned += this.fixedRewardAmount;
      user.payments.lastTransactionDate = new Date();
      
      // Update favorite business
      await user.updateFavoriteBusiness(businessId, transactionAmount);
      
      await user.save();
      
    } catch (error) {
      this.logger.error('User payment stats update failed', error);
    }
  }
  
  // Helper methods for blockchain operations
  async createRewardDistributionTx(distributionData) {
    // Mock implementation - would create actual Solana transaction
    return {
      signature: 'mock_reward_dist_' + Date.now(),
      success: true
    };
  }
  
  async createVaultFundingTx(fundingData) {
    // Mock implementation - would create actual vault funding transaction
    return {
      signature: 'mock_vault_fund_' + Date.now(),
      success: true
    };
  }
}

module.exports = RewardsService;