const Transaction = require('../models/Transaction');
const Business = require('../models/Business');
const mongoose = require('mongoose');
const crypto = require('crypto');

class TransactionService {
    constructor() {
        this.initialized = false;
    }

    async initialize() {
        if (!this.initialized) {
            console.log('🔄 Transaction Service initialized');
            this.initialized = true;
        }
        return this;
    }

    /**
     * Create a new payment transaction record
     * @param {Object} paymentData - Payment transaction data
     * @returns {Object} Created transaction
     */
    async createPaymentTransaction(paymentData) {
        try {
            const {
                signature,
                userId,
                businessId,
                walletAddress,
                amount = 15, // Fixed $15 USDC
                memo,
                paymentReference,
                jupiterSwap = null,
                blockTime = null,
                slot = null
            } = paymentData;

            // Get business information
            const business = await Business.findById(businessId);
            if (!business) {
                throw new Error('Business not found');
            }

            // Calculate fees (standardized for CN businesses)
            const fees = {
                platformFee: 0.15,      // 1% of $15
                vaultContribution: 0.195, // 1.3% of $15
                totalFees: 0.345,       // Total fees
                networkFee: 0.00025,    // Solana network fee
                jupiterSwapFee: jupiterSwap ? (jupiterSwap.inputAmount * 0.0075) : 0 // 0.75% if swap used
            };

            // Create transaction record
            const transaction = new Transaction({
                signature,
                userId,
                businessId,
                walletAddress,
                type: 'payment',
                status: 'confirmed', // Set as confirmed for QR payments
                amount,
                businessInfo: {
                    name: business.businessName,
                    type: business.businessType || 'CN',
                    category: business.businessCategory,
                    walletAddress: business.settlement?.walletAddress
                },
                paymentReference,
                jupiterSwap,
                fees,
                blockTime: blockTime || new Date(),
                slot,
                confirmations: 1,
                settlement: {
                    method: 'usdc-retain',
                    processed: false,
                    netAmount: amount - fees.totalFees // $15 - $0.345 = $14.655
                },
                rewards: {
                    pizzaTokensDistributed: 0.3, // Fixed 0.3 $PIZZA SPL per transaction
                    giftCardIssued: false,
                    vaultFunded: fees.vaultContribution
                },
                notes: memo,
                completedAt: new Date()
            });

            await transaction.save();

            // Update business vault contribution tracking
            await this.updateBusinessVaultContribution(businessId, fees.vaultContribution);

            console.log(`💰 Payment transaction created: ${signature} for business ${business.businessName}`);
            
            return {
                success: true,
                transaction,
                fees,
                netAmount: transaction.settlement.netAmount
            };

        } catch (error) {
            console.error('❌ Error creating payment transaction:', error);
            throw error;
        }
    }

    /**
     * Create a test transaction for development
     * @param {String} businessId - Business ID
     * @returns {Object} Created transaction
     */
    async createTestTransaction(businessId) {
        try {
            const business = await Business.findById(businessId);
            if (!business) {
                throw new Error('Business not found');
            }

            const testSignature = this.generateTestSignature();
            const testWallet = this.generateTestWalletAddress();

            const transactionData = {
                signature: testSignature,
                userId: business.ownerId,
                businessId: businessId,
                walletAddress: testWallet,
                amount: 15,
                memo: `Test payment for ${business.businessName}`,
                paymentReference: `test-${Date.now()}`,
                blockTime: new Date(),
                slot: Math.floor(Math.random() * 1000000) + 200000000
            };

            return await this.createPaymentTransaction(transactionData);

        } catch (error) {
            console.error('❌ Error creating test transaction:', error);
            throw error;
        }
    }

    /**
     * Get transactions for a specific business
     * @param {String} businessId - Business ID
     * @param {Object} options - Query options
     * @returns {Array} Transactions
     */
    async getBusinessTransactions(businessId, options = {}) {
        try {
            const {
                limit = 50,
                offset = 0,
                startDate,
                endDate,
                status,
                type = 'payment'
            } = options;

            const query = { businessId, type };
            
            if (status) query.status = status;
            
            if (startDate || endDate) {
                query.createdAt = {};
                if (startDate) query.createdAt.$gte = new Date(startDate);
                if (endDate) query.createdAt.$lte = new Date(endDate);
            }

            const transactions = await Transaction.find(query)
                .sort({ createdAt: -1 })
                .limit(limit)
                .skip(offset)
                .populate('userId', 'email')
                .populate('businessId', 'businessName businessType');

            return transactions;

        } catch (error) {
            console.error('❌ Error getting business transactions:', error);
            throw error;
        }
    }

    /**
     * Update business vault contribution tracking
     * @param {String} businessId - Business ID
     * @param {Number} contribution - Vault contribution amount
     */
    async updateBusinessVaultContribution(businessId, contribution) {
        try {
            await Business.findByIdAndUpdate(
                businessId,
                {
                    $inc: { 
                        'vaultContribution.totalContributed': contribution,
                        'totalVaultContributions': contribution
                    },
                    $set: {
                        'vaultContribution.lastContribution': new Date()
                    }
                }
            );

            console.log(`📊 Updated vault contribution for business ${businessId}: +$${contribution}`);

        } catch (error) {
            console.error('❌ Error updating vault contribution:', error);
            // Don't throw here as it shouldn't fail the main transaction
        }
    }

    /**
     * Get transaction statistics for a business
     * @param {String} businessId - Business ID
     * @param {Object} dateRange - Date range options
     * @returns {Object} Statistics
     */
    async getBusinessTransactionStats(businessId, dateRange = {}) {
        try {
            const { startDate, endDate } = dateRange;
            const matchStage = { businessId: new mongoose.Types.ObjectId(businessId), type: 'payment' };
            
            if (startDate || endDate) {
                matchStage.createdAt = {};
                if (startDate) matchStage.createdAt.$gte = new Date(startDate);
                if (endDate) matchStage.createdAt.$lte = new Date(endDate);
            }

            const stats = await Transaction.aggregate([
                { $match: matchStage },
                {
                    $group: {
                        _id: null,
                        totalTransactions: { $sum: 1 },
                        totalVolume: { $sum: '$amount' },
                        totalFees: { $sum: '$fees.totalFees' },
                        totalVaultContributions: { $sum: '$fees.vaultContribution' },
                        totalRewards: { $sum: '$rewards.pizzaTokensDistributed' },
                        netRevenue: { $sum: '$settlement.netAmount' },
                        confirmedCount: {
                            $sum: { $cond: [{ $eq: ['$status', 'confirmed'] }, 1, 0] }
                        }
                    }
                },
                {
                    $project: {
                        totalTransactions: 1,
                        totalVolume: 1,
                        totalFees: 1,
                        totalVaultContributions: 1,
                        totalRewards: 1,
                        netRevenue: 1,
                        successRate: {
                            $multiply: [
                                { $divide: ['$confirmedCount', '$totalTransactions'] },
                                100
                            ]
                        }
                    }
                }
            ]);

            return stats[0] || {
                totalTransactions: 0,
                totalVolume: 0,
                totalFees: 0,
                totalVaultContributions: 0,
                totalRewards: 0,
                netRevenue: 0,
                successRate: 0
            };

        } catch (error) {
            console.error('❌ Error getting transaction stats:', error);
            throw error;
        }
    }

    /**
     * Generate a test Solana transaction signature
     * @returns {String} Test signature
     */
    generateTestSignature() {
        // Generate a realistic-looking base58 Solana signature (88 characters)
        const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
        let signature = '';
        for (let i = 0; i < 88; i++) {
            signature += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return signature;
    }

    /**
     * Generate a test wallet address
     * @returns {String} Test wallet address
     */
    generateTestWalletAddress() {
        // Generate a realistic-looking base58 Solana wallet address (44 characters)
        const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
        let address = '';
        for (let i = 0; i < 44; i++) {
            address += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return address;
    }

    /**
     * Mark a transaction as failed
     * @param {String} transactionId - Transaction ID
     * @param {Object} errorInfo - Error information
     * @returns {Object} Updated transaction
     */
    async markTransactionFailed(transactionId, errorInfo) {
        try {
            const transaction = await Transaction.findByIdAndUpdate(
                transactionId,
                {
                    status: 'failed',
                    error: errorInfo,
                    completedAt: new Date()
                },
                { new: true }
            );

            console.log(`❌ Transaction marked as failed: ${transactionId}`);
            return transaction;

        } catch (error) {
            console.error('❌ Error marking transaction as failed:', error);
            throw error;
        }
    }

    /**
     * Process settlement for a transaction
     * @param {String} transactionId - Transaction ID
     * @param {Object} settlementData - Settlement data
     * @returns {Object} Updated transaction
     */
    async processSettlement(transactionId, settlementData) {
        try {
            const transaction = await Transaction.findByIdAndUpdate(
                transactionId,
                {
                    'settlement.processed': true,
                    'settlement.settlementDate': new Date(),
                    'settlement.externalReference': settlementData.externalReference
                },
                { new: true }
            );

            console.log(`💸 Settlement processed for transaction: ${transactionId}`);
            return transaction;

        } catch (error) {
            console.error('❌ Error processing settlement:', error);
            throw error;
        }
    }
}

module.exports = TransactionService;