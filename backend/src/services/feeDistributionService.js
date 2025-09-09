const { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { 
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAccount,
  getMint
} = require('@solana/spl-token');
const winston = require('winston');

/**
 * Fee Distribution Service
 * Handles automatic fee distribution for the Pizza Platform:
 * - 1% platform fee to operational wallet
 * - 1.3% vault contribution for staking and rewards
 */
class FeeDistributionService {
  constructor() {
    this.connection = new Connection(
      process.env.SOLANA_RPC_ENDPOINT || 'https://api.devnet.solana.com',
      'confirmed'
    );
    
    // Check if we're on devnet or mainnet
    const isDevnet = this.connection.rpcEndpoint.includes('devnet');
    
    // USDC mint for devnet/mainnet
    this.usdcMint = process.env.USDC_MINT ? 
      new PublicKey(process.env.USDC_MINT) : 
      new PublicKey(isDevnet ? 
        '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU' : // USDC devnet mint
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'   // USDC mainnet mint
      );
    
    // Platform wallets (these should be in environment variables)
    this.platformFeeWallet = process.env.PLATFORM_FEE_WALLET || 
      '8qbHbw2BbbTHBW1sbeqakYXVKRQM8Ne7pLK7m6CVfeR'; // Replace with actual wallet
    
    this.vaultWallet = process.env.VAULT_WALLET || 
      '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM'; // Replace with actual vault wallet
    
    // Fee percentages (in basis points for precision)
    this.platformFeeBps = 100;  // 1% = 100 basis points
    this.vaultFeeBps = 130;     // 1.3% = 130 basis points
    this.totalFeeBps = 230;     // 2.3% total
    
    // Fixed transaction amount
    this.fixedTransactionAmount = 15; // $15 USDC
    
    // Setup logging
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.File({ filename: 'logs/fee-distribution.log' }),
        new winston.transports.Console({ 
          format: winston.format.simple(),
          level: 'error'
        })
      ]
    });
  }

  /**
   * Calculate fees for a payment
   * @param {number} amount - Payment amount in USDC
   * @param {string} businessType - 'CN' (Crypto Native) or 'NCN' (Non-Crypto Native)
   * @returns {Object} Fee breakdown
   */
  calculateFees(amount = this.fixedTransactionAmount, businessType = 'CN') {
    // For CN businesses: 1% platform + 1.3% vault = 2.3% total
    // For NCN businesses: 1.45% platform + 1.3% vault = 2.75% total  
    const platformFeeRate = businessType === 'NCN' ? 0.0145 : 0.01;
    const vaultFeeRate = 0.013; // 1.3% for both
    
    const platformFee = amount * platformFeeRate;
    const vaultFee = amount * vaultFeeRate;
    const totalFees = platformFee + vaultFee;
    const businessReceives = amount - totalFees;
    
    return {
      originalAmount: amount,
      platformFee: platformFee,
      vaultFee: vaultFee,
      totalFees: totalFees,
      businessReceives: businessReceives,
      businessType: businessType,
      feeBreakdown: {
        platformFeePercent: (platformFeeRate * 100).toFixed(2) + '%',
        vaultFeePercent: (vaultFeeRate * 100).toFixed(1) + '%',
        totalFeePercent: ((platformFeeRate + vaultFeeRate) * 100).toFixed(1) + '%'
      }
    };
  }

  /**
   * Create fee distribution transaction
   * @param {string} payerWallet - Wallet paying the fees (business wallet)
   * @param {number} amount - Original payment amount
   * @param {string} businessType - Business type ('CN' or 'NCN')
   * @returns {Transaction} Unsigned transaction for fee distribution
   */
  async createFeeDistributionTransaction(payerWallet, amount, businessType) {
    try {
      const fees = this.calculateFees(amount, businessType);
      const payer = new PublicKey(payerWallet);
      
      // Get mint info for USDC
      const mintInfo = await getMint(this.connection, this.usdcMint);
      
      // Convert fee amounts to token amounts (considering decimals)
      const platformFeeAmount = BigInt(Math.floor(fees.platformFee * Math.pow(10, mintInfo.decimals)));
      const vaultFeeAmount = BigInt(Math.floor(fees.vaultFee * Math.pow(10, mintInfo.decimals)));
      
      // Get associated token accounts
      const payerTokenAccount = await getAssociatedTokenAddress(this.usdcMint, payer);
      const platformTokenAccount = await getAssociatedTokenAddress(
        this.usdcMint, 
        new PublicKey(this.platformFeeWallet)
      );
      const vaultTokenAccount = await getAssociatedTokenAddress(
        this.usdcMint, 
        new PublicKey(this.vaultWallet)
      );
      
      const transaction = new Transaction();
      
      // Create platform fee token account if it doesn't exist
      try {
        await getAccount(this.connection, platformTokenAccount);
      } catch (error) {
        const createPlatformAccountIx = createAssociatedTokenAccountInstruction(
          payer,
          platformTokenAccount,
          new PublicKey(this.platformFeeWallet),
          this.usdcMint
        );
        transaction.add(createPlatformAccountIx);
      }
      
      // Create vault token account if it doesn't exist
      try {
        await getAccount(this.connection, vaultTokenAccount);
      } catch (error) {
        const createVaultAccountIx = createAssociatedTokenAccountInstruction(
          payer,
          vaultTokenAccount,
          new PublicKey(this.vaultWallet),
          this.usdcMint
        );
        transaction.add(createVaultAccountIx);
      }
      
      // Add platform fee transfer instruction
      if (platformFeeAmount > 0) {
        const platformFeeIx = createTransferInstruction(
          payerTokenAccount,
          platformTokenAccount,
          payer,
          platformFeeAmount
        );
        transaction.add(platformFeeIx);
      }
      
      // Add vault fee transfer instruction
      if (vaultFeeAmount > 0) {
        const vaultFeeIx = createTransferInstruction(
          payerTokenAccount,
          vaultTokenAccount,
          payer,
          vaultFeeAmount
        );
        transaction.add(vaultFeeIx);
      }
      
      // Set recent blockhash and fee payer
      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = payer;
      
      this.logger.info('Fee distribution transaction created', {
        payer: payerWallet,
        amount: amount,
        businessType: businessType,
        platformFee: fees.platformFee,
        vaultFee: fees.vaultFee,
        totalFees: fees.totalFees
      });
      
      return { transaction, fees };
      
    } catch (error) {
      this.logger.error('Fee distribution transaction creation failed', {
        payerWallet,
        amount,
        businessType,
        error: error.message
      });
      throw new Error('Failed to create fee distribution transaction: ' + error.message);
    }
  }

  /**
   * Process payment with automatic fee distribution
   * @param {Object} paymentData - Payment data
   * @returns {Object} Processing result
   */
  async processPaymentWithFees(paymentData) {
    const {
      customerWallet,
      businessWallet,
      businessId,
      businessType = 'CN',
      amount = this.fixedTransactionAmount,
      paymentReference
    } = paymentData;
    
    try {
      // Calculate fees
      const feeCalculation = this.calculateFees(amount, businessType);
      
      // Create the main payment transaction (customer to business)
      const Business = require('../models/Business');
      const Transaction = require('../models/Transaction');
      
      const business = await Business.findById(businessId);
      if (!business) {
        throw new Error('Business not found');
      }
      
      // Log the payment processing
      this.logger.info('Processing payment with fees', {
        customerWallet,
        businessWallet,
        businessId,
        businessType,
        amount,
        feeCalculation
      });
      
      // The actual payment and fee distribution would be handled by
      // the main transaction processing flow
      
      return {
        success: true,
        paymentReference,
        amount: amount,
        fees: feeCalculation,
        business: {
          id: businessId,
          name: business.businessName,
          type: businessType,
          wallet: businessWallet
        },
        timestamp: new Date()
      };
      
    } catch (error) {
      this.logger.error('Payment processing with fees failed', {
        customerWallet,
        businessWallet,
        businessId,
        error: error.message
      });
      throw new Error('Failed to process payment with fees: ' + error.message);
    }
  }

  /**
   * Get vault statistics for admin dashboard
   * @returns {Object} Vault statistics
   */
  async getVaultStatistics() {
    try {
      const vaultPublicKey = new PublicKey(this.vaultWallet);
      const vaultTokenAccount = await getAssociatedTokenAddress(this.usdcMint, vaultPublicKey);
      
      let vaultBalance = 0;
      try {
        const account = await getAccount(this.connection, vaultTokenAccount);
        const mintInfo = await getMint(this.connection, this.usdcMint);
        vaultBalance = Number(account.amount) / Math.pow(10, mintInfo.decimals);
      } catch (error) {
        // Vault token account doesn't exist or is empty
        vaultBalance = 0;
      }
      
      // Calculate daily/monthly contribution estimates
      const dailyTransactionEstimate = 100; // Estimated transactions per day
      const dailyVaultContribution = dailyTransactionEstimate * this.fixedTransactionAmount * 0.013;
      const monthlyVaultContribution = dailyVaultContribution * 30;
      const yearlyVaultContribution = monthlyVaultContribution * 12;
      
      return {
        currentBalance: vaultBalance,
        vaultWallet: this.vaultWallet,
        contributionRate: '1.3%',
        estimates: {
          daily: dailyVaultContribution,
          monthly: monthlyVaultContribution,
          yearly: yearlyVaultContribution
        },
        lastUpdated: new Date()
      };
      
    } catch (error) {
      this.logger.error('Failed to get vault statistics', {
        error: error.message
      });
      throw new Error('Failed to get vault statistics');
    }
  }

  /**
   * Get platform fee statistics
   * @returns {Object} Platform fee statistics
   */
  async getPlatformFeeStatistics() {
    try {
      const platformPublicKey = new PublicKey(this.platformFeeWallet);
      const platformTokenAccount = await getAssociatedTokenAddress(this.usdcMint, platformPublicKey);
      
      let platformBalance = 0;
      try {
        const account = await getAccount(this.connection, platformTokenAccount);
        const mintInfo = await getMint(this.connection, this.usdcMint);
        platformBalance = Number(account.amount) / Math.pow(10, mintInfo.decimals);
      } catch (error) {
        // Platform fee account doesn't exist or is empty
        platformBalance = 0;
      }
      
      return {
        currentBalance: platformBalance,
        platformWallet: this.platformFeeWallet,
        cnFeeRate: '1.0%',
        ncnFeeRate: '1.45%',
        lastUpdated: new Date()
      };
      
    } catch (error) {
      this.logger.error('Failed to get platform fee statistics', {
        error: error.message
      });
      throw new Error('Failed to get platform fee statistics');
    }
  }
}

module.exports = FeeDistributionService;