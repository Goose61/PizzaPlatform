const winston = require('winston');
const { Connection, PublicKey, Transaction: SolanaTransaction, sendAndConfirmTransaction } = require('@solana/web3.js');
const { Token, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const User = require('../models/User');
const Transaction = require('../models/Transaction');

class RewardsService {
  constructor() {
    this.connection = new Connection(
      process.env.SOLANA_RPC_ENDPOINT || 'https://api.devnet.solana.com'
    );
    
    // Pizza token mint address
    this.pizzaTokenMint = new PublicKey(process.env.PIZZA_TOKEN_MINT);
    
    // Tier multipliers for rewards
    this.tierMultipliers = {
      unverified: 1.0,
      tier1: 1.5,
      tier2: 2.0
    };
    
    // Base reward rate (1% of transaction value)
    this.baseRewardRate = 0.01;
    
    // Staking APR rates by lock period
    this.stakingRates = {
      30: 0.05,   // 5% APR for 30 days
      90: 0.075,  // 7.5% APR for 90 days  
      180: 0.10   // 10% APR for 180 days
    };
    
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
   * Calculate reward amount for a transaction
   * @param {Object} transaction - Transaction object
   * @param {Object} user - User object
   * @param {Object} businessVault - Business loyalty vault settings (optional)
   * @returns {Object} - Reward calculation result
   */
  async calculateTransactionReward(transaction, user, businessVault = null) {
    try {
      const { amount, type, businessId } = transaction;
      const userTier = user.kycTier || 'unverified';
      
      // Base reward calculation (1% of transaction value)
      let baseReward = amount * this.baseRewardRate;
      
      // Apply KYC tier multiplier
      const tierMultiplier = this.tierMultipliers[userTier] || 1.0;
      let finalReward = baseReward * tierMultiplier;
      
      // Apply business-specific multipliers if available
      let businessMultiplier = 1.0;
      if (businessVault && businessVault.rewardRate) {
        businessMultiplier = businessVault.rewardRate / 100; // Convert percentage to decimal
        finalReward = amount * businessMultiplier * tierMultiplier;
      }
      
      // Special transaction type bonuses
      const typeMultipliers = {
        payment: 1.0,
        subscription: 1.2,  // 20% bonus for subscriptions
        bulk_purchase: 1.1  // 10% bonus for bulk purchases
      };
      
      const typeMultiplier = typeMultipliers[type] || 1.0;
      finalReward *= typeMultiplier;
      
      // Apply minimum and maximum reward limits
      const minReward = 0.001; // Minimum 0.001 PIZZA tokens
      const maxReward = amount * 0.05; // Maximum 5% of transaction value
      
      finalReward = Math.max(minReward, Math.min(finalReward, maxReward));
      
      const calculation = {
        transactionId: transaction._id || transaction.id,
        userId: user._id || user.id,
        businessId,
        baseAmount: amount,
        baseReward,
        tierMultiplier,
        businessMultiplier,
        typeMultiplier,
        finalReward,
        calculatedAt: new Date(),
        details: {
          userTier,
          transactionType: type,
          businessVaultRate: businessVault?.rewardRate || null
        }
      };
      
      this.logger.info('Reward calculated', calculation);
      
      return calculation;
      
    } catch (error) {
      this.logger.error('Reward calculation failed', {
        error: error.message,
        transactionId: transaction._id,
        userId: user._id
      });
      throw error;
    }
  }

  /**
   * Distribute reward tokens to user
   * @param {string} userId - User ID
   * @param {number} amount - Reward amount in PIZZA tokens
   * @param {string} transactionId - Original transaction ID
   * @param {Object} metadata - Additional reward metadata
   * @returns {Object} - Distribution result
   */
  async distributeReward(userId, amount, transactionId, metadata = {}) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }
      
      // Get or create user's token account
      const userWallet = await this.getUserWallet(user);
      if (!userWallet) {
        throw new Error('User wallet not found');
      }
      
      // Mint PIZZA tokens to user's wallet
      const mintResult = await this.mintPizzaTokens(
        userWallet.publicKey,
        amount,
        `Reward for transaction ${transactionId}`
      );
      
      // Create reward transaction record
      const rewardTransaction = new Transaction({
        userId,
        type: 'reward',
        amount,
        currency: 'PIZZA',
        status: mintResult.success ? 'completed' : 'failed',
        metadata: {
          ...metadata,
          originalTransactionId: transactionId,
          mintSignature: mintResult.signature,
          rewardType: 'transaction_reward'
        },
        createdAt: new Date()
      });
      
      await rewardTransaction.save();
      
      // Update user's total rewards earned
      user.totalRewardsEarned = (user.totalRewardsEarned || 0) + amount;
      await user.save();
      
      const result = {
        userId,
        amount,
        transactionId: rewardTransaction._id,
        mintSignature: mintResult.signature,
        success: mintResult.success,
        distributedAt: new Date()
      };
      
      this.logger.info('Reward distributed', result);
      
      return result;
      
    } catch (error) {
      this.logger.error('Reward distribution failed', {
        error: error.message,
        userId,
        amount,
        transactionId
      });
      throw error;
    }
  }

  /**
   * Process staking rewards for all active stakers
   * @returns {Object} - Processing results
   */
  async processStakingRewards() {
    try {
      const now = new Date();
      const results = {
        processed: 0,
        failed: 0,
        totalRewards: 0,
        errors: []
      };
      
      // Find all active staking positions
      const activeStakes = await Transaction.find({
        type: 'stake',
        status: 'active',
        'metadata.lockPeriod': { $exists: true },
        'metadata.stakedAt': { $exists: true }
      });
      
      for (const stake of activeStakes) {
        try {
          const stakeReward = await this.calculateStakingReward(stake, now);
          
          if (stakeReward.amount > 0) {
            await this.distributeReward(
              stake.userId,
              stakeReward.amount,
              stake._id,
              {
                rewardType: 'staking_reward',
                stakingPeriod: stake.metadata.lockPeriod,
                apr: stakeReward.apr
              }
            );
            
            // Update last reward distribution time
            stake.metadata.lastRewardAt = now;
            await stake.save();
            
            results.processed++;
            results.totalRewards += stakeReward.amount;
          }
          
        } catch (error) {
          results.failed++;
          results.errors.push({
            stakeId: stake._id,
            error: error.message
          });
          
          this.logger.error('Staking reward processing failed', {
            stakeId: stake._id,
            error: error.message
          });
        }
      }
      
      this.logger.info('Staking rewards batch processed', results);
      
      return results;
      
    } catch (error) {
      this.logger.error('Staking rewards batch processing failed', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Calculate staking reward for a specific stake
   * @param {Object} stake - Stake transaction
   * @param {Date} currentTime - Current timestamp
   * @returns {Object} - Staking reward calculation
   */
  async calculateStakingReward(stake, currentTime) {
    try {
      const stakedAmount = stake.amount;
      const lockPeriod = stake.metadata.lockPeriod; // in days
      const stakedAt = stake.metadata.stakedAt;
      const lastRewardAt = stake.metadata.lastRewardAt || stakedAt;
      
      // Calculate time elapsed since last reward
      const timeElapsed = currentTime - new Date(lastRewardAt);
      const daysElapsed = timeElapsed / (1000 * 60 * 60 * 24);
      
      // Only process if at least 1 day has passed
      if (daysElapsed < 1) {
        return { amount: 0, apr: 0, daysElapsed };
      }
      
      // Get APR for the lock period
      const apr = this.stakingRates[lockPeriod] || this.stakingRates[30];
      
      // Calculate daily reward rate
      const dailyRate = apr / 365;
      
      // Calculate reward amount
      const rewardAmount = stakedAmount * dailyRate * Math.floor(daysElapsed);
      
      return {
        amount: rewardAmount,
        apr,
        daysElapsed: Math.floor(daysElapsed),
        dailyRate,
        stakedAmount
      };
      
    } catch (error) {
      this.logger.error('Staking reward calculation failed', {
        stakeId: stake._id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Create staking position
   * @param {string} userId - User ID
   * @param {number} amount - Amount to stake
   * @param {number} lockPeriod - Lock period in days (30, 90, or 180)
   * @returns {Object} - Staking result
   */
  async createStakingPosition(userId, amount, lockPeriod) {
    try {
      if (!this.stakingRates[lockPeriod]) {
        throw new Error('Invalid lock period. Must be 30, 90, or 180 days');
      }
      
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }
      
      // Verify user has sufficient PIZZA tokens
      const userBalance = await this.getUserPizzaBalance(user);
      if (userBalance < amount) {
        throw new Error('Insufficient PIZZA token balance');
      }
      
      // Lock tokens (transfer to staking contract)
      const lockResult = await this.lockTokensForStaking(user, amount);
      
      if (!lockResult.success) {
        throw new Error('Failed to lock tokens for staking');
      }
      
      // Create staking transaction record
      const stakingTransaction = new Transaction({
        userId,
        type: 'stake',
        amount,
        currency: 'PIZZA',
        status: 'active',
        metadata: {
          lockPeriod,
          apr: this.stakingRates[lockPeriod],
          stakedAt: new Date(),
          unlockAt: new Date(Date.now() + lockPeriod * 24 * 60 * 60 * 1000),
          lockSignature: lockResult.signature,
          lastRewardAt: new Date()
        }
      });
      
      await stakingTransaction.save();
      
      // Update user's total staked amount
      user.totalStaked = (user.totalStaked || 0) + amount;
      await user.save();
      
      const result = {
        stakeId: stakingTransaction._id,
        amount,
        lockPeriod,
        apr: this.stakingRates[lockPeriod],
        unlockAt: stakingTransaction.metadata.unlockAt,
        success: true
      };
      
      this.logger.info('Staking position created', result);
      
      return result;
      
    } catch (error) {
      this.logger.error('Staking position creation failed', {
        error: error.message,
        userId,
        amount,
        lockPeriod
      });
      throw error;
    }
  }

  /**
   * Unstake tokens (after lock period expires)
   * @param {string} userId - User ID
   * @param {string} stakeId - Stake transaction ID
   * @returns {Object} - Unstaking result
   */
  async unstakeTokens(userId, stakeId) {
    try {
      const stake = await Transaction.findOne({
        _id: stakeId,
        userId,
        type: 'stake',
        status: 'active'
      });
      
      if (!stake) {
        throw new Error('Active stake not found');
      }
      
      const now = new Date();
      const unlockTime = new Date(stake.metadata.unlockAt);
      
      if (now < unlockTime) {
        throw new Error('Stake is still locked. Cannot unstake before unlock time');
      }
      
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }
      
      // Calculate final staking reward
      const finalReward = await this.calculateStakingReward(stake, now);
      
      // Distribute final reward if any
      if (finalReward.amount > 0) {
        await this.distributeReward(
          userId,
          finalReward.amount,
          stakeId,
          { rewardType: 'final_staking_reward' }
        );
      }
      
      // Unlock tokens (return to user's wallet)
      const unlockResult = await this.unlockStakedTokens(user, stake.amount);
      
      if (!unlockResult.success) {
        throw new Error('Failed to unlock staked tokens');
      }
      
      // Update stake status
      stake.status = 'completed';
      stake.metadata.unstakedAt = now;
      stake.metadata.finalReward = finalReward.amount;
      stake.metadata.unlockSignature = unlockResult.signature;
      await stake.save();
      
      // Update user's total staked amount
      user.totalStaked = Math.max(0, (user.totalStaked || 0) - stake.amount);
      await user.save();
      
      const result = {
        stakeId,
        originalAmount: stake.amount,
        finalReward: finalReward.amount,
        totalReturned: stake.amount + finalReward.amount,
        unlockSignature: unlockResult.signature,
        success: true
      };
      
      this.logger.info('Tokens unstaked', result);
      
      return result;
      
    } catch (error) {
      this.logger.error('Unstaking failed', {
        error: error.message,
        userId,
        stakeId
      });
      throw error;
    }
  }

  /**
   * Get user's staking positions
   * @param {string} userId - User ID
   * @returns {Array} - User's staking positions
   */
  async getUserStakingPositions(userId) {
    try {
      const stakes = await Transaction.find({
        userId,
        type: 'stake',
        status: { $in: ['active', 'completed'] }
      }).sort({ createdAt: -1 });
      
      const positions = [];
      
      for (const stake of stakes) {
        const position = {
          stakeId: stake._id,
          amount: stake.amount,
          status: stake.status,
          lockPeriod: stake.metadata.lockPeriod,
          apr: stake.metadata.apr,
          stakedAt: stake.metadata.stakedAt,
          unlockAt: stake.metadata.unlockAt,
          lastRewardAt: stake.metadata.lastRewardAt
        };
        
        // Calculate pending rewards for active stakes
        if (stake.status === 'active') {
          const pendingReward = await this.calculateStakingReward(stake, new Date());
          position.pendingReward = pendingReward.amount;
          position.daysRemaining = Math.max(0, 
            Math.ceil((new Date(stake.metadata.unlockAt) - new Date()) / (1000 * 60 * 60 * 24))
          );
        }
        
        if (stake.status === 'completed') {
          position.unstakedAt = stake.metadata.unstakedAt;
          position.finalReward = stake.metadata.finalReward || 0;
        }
        
        positions.push(position);
      }
      
      return positions;
      
    } catch (error) {
      this.logger.error('Failed to get staking positions', {
        error: error.message,
        userId
      });
      throw error;
    }
  }

  // Helper methods for blockchain interactions
  async getUserWallet(user) {
    // Implementation depends on wallet service
    // This would typically fetch user's Solana wallet from WalletService
    return { publicKey: 'placeholder' }; // Placeholder
  }

  async getUserPizzaBalance(user) {
    // Get user's PIZZA token balance from Solana
    return 1000; // Placeholder
  }

  async mintPizzaTokens(walletAddress, amount, memo) {
    // Mint PIZZA tokens to user's wallet
    return { success: true, signature: 'placeholder' }; // Placeholder
  }

  async lockTokensForStaking(user, amount) {
    // Transfer tokens to staking contract
    return { success: true, signature: 'placeholder' }; // Placeholder
  }

  async unlockStakedTokens(user, amount) {
    // Return tokens from staking contract to user
    return { success: true, signature: 'placeholder' }; // Placeholder
  }
}

module.exports = RewardsService;