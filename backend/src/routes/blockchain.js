const express = require('express');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { body, param, query, validationResult } = require('express-validator');
const router = express.Router();

// Import services and models
const WalletService = require('../services/walletService');
const SolanaService = require('../services/solanaService');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');

// Initialize services
const walletService = new WalletService();
const solanaService = new SolanaService();

// Rate limiting for blockchain operations
const blockchainLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Limit each IP to 50 requests per windowMs
  message: 'Too many blockchain requests, please try again later'
});

const transactionLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // Limit transaction requests
  message: 'Too many transaction requests, please slow down'
});

// Authentication middleware
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    
    if (!user || !user.isActive) {
      return res.status(403).json({ error: 'Invalid or inactive user' });
    }
    
    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid token' });
  }
};

// Validation middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      error: 'Validation failed', 
      details: errors.array() 
    });
  }
  next();
};

// Routes

// Create wallet for user
router.post('/wallet/create', 
  blockchainLimiter,
  authenticateToken,
  async (req, res) => {
    try {
      // Check if user already has a wallet
      const existingWallet = await Wallet.findByUserId(req.user._id);
      if (existingWallet) {
        return res.status(400).json({ error: 'User already has a wallet' });
      }

      // Create new wallet
      const walletData = await walletService.createWallet(req.user._id.toString());
      
      // Save to database
      const wallet = new Wallet({
        userId: req.user._id,
        publicKey: walletData.publicKey,
        encryptedPrivateKey: walletData.encryptedPrivateKey,
        isActive: true,
        kycTier: 'unverified'
      });
      
      await wallet.save();

      // Log security event
      await req.user.addSecurityEvent(
        'wallet_created',
        req.ip,
        req.get('User-Agent'),
        `wallet-${Date.now()}`,
        { publicKey: walletData.publicKey }
      );

      res.status(201).json({
        success: true,
        publicKey: walletData.publicKey,
        kycTier: 'unverified',
        message: 'Wallet created successfully'
      });

    } catch (error) {
      console.error('Wallet creation error:', error);
      res.status(500).json({ error: 'Failed to create wallet' });
    }
  }
);

// Get wallet information
router.get('/wallet',
  blockchainLimiter,
  authenticateToken,
  async (req, res) => {
    try {
      const wallet = await Wallet.findByUserId(req.user._id);
      
      if (!wallet) {
        return res.status(404).json({ error: 'Wallet not found' });
      }

      // Get current balances from blockchain
      const [solBalance, splBalance, pizzaBalance] = await Promise.all([
        walletService.getBalance(wallet.publicKey),
        solanaService.getTokenBalance(wallet.publicKey, process.env.SPL_TOKEN_MINT),
        solanaService.getTokenBalance(wallet.publicKey, process.env.PIZZA_TOKEN_MINT)
      ]);

      // Update cached balances
      await wallet.updateTokenBalance(process.env.SPL_TOKEN_MINT, splBalance.balance);
      await wallet.updateTokenBalance(process.env.PIZZA_TOKEN_MINT, pizzaBalance.balance);

      res.json({
        publicKey: wallet.publicKey,
        kycTier: wallet.kycTier,
        isActive: wallet.isActive,
        balances: {
          sol: solBalance,
          spl: splBalance.balance,
          pizza: pizzaBalance.balance
        },
        dailySpending: {
          amount: wallet.dailySpending.amount,
          date: wallet.dailySpending.date
        },
        lastActive: wallet.lastActive
      });

    } catch (error) {
      console.error('Get wallet error:', error);
      res.status(500).json({ error: 'Failed to retrieve wallet information' });
    }
  }
);

// Create QR payment
router.post('/payment/qr',
  transactionLimiter,
  authenticateToken,
  [
    body('merchantWallet').isLength({ min: 44, max: 44 }).withMessage('Invalid merchant wallet address'),
    body('amount').isFloat({ min: 0.001 }).withMessage('Amount must be greater than 0.001'),
    body('merchantInfo.name').optional().isString().withMessage('Merchant name must be a string'),
    body('merchantInfo.location').optional().isString().withMessage('Merchant location must be a string')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { merchantWallet, amount, merchantInfo } = req.body;

      // Get user's wallet
      const wallet = await Wallet.findByUserId(req.user._id);
      if (!wallet) {
        return res.status(404).json({ error: 'Wallet not found' });
      }

      // Check daily limits
      const tierLimits = {
        unverified: 100,
        tier1: parseInt(process.env.MAX_DAILY_AMOUNT_TIER1) || 1000,
        tier2: parseInt(process.env.MAX_DAILY_AMOUNT_TIER2) || 10000
      };

      if (!wallet.checkDailyLimit(amount, tierLimits)) {
        return res.status(400).json({ 
          error: 'Daily spending limit exceeded',
          currentSpending: wallet.dailySpending.amount,
          limit: tierLimits[wallet.kycTier]
        });
      }

      // Generate unique payment reference
      const paymentReference = `PAY-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Create payment transaction
      const transaction = await solanaService.createQRPayment(
        merchantWallet,
        wallet.publicKey,
        amount,
        paymentReference
      );

      // Save transaction to database
      const txRecord = new Transaction({
        signature: '', // Will be filled when transaction is signed and sent
        userId: req.user._id,
        walletAddress: wallet.publicKey,
        type: 'payment',
        status: 'pending',
        inputToken: {
          mint: process.env.SPL_TOKEN_MINT,
          amount: amount,
          symbol: 'SPL'
        },
        merchantWallet,
        merchantInfo,
        paymentReference,
        fees: {
          networkFee: 0.000005, // Estimated Solana network fee
          platformFee: 0
        },
        compliance: {
          kycRequired: amount > tierLimits.unverified,
          kycVerified: wallet.kycTier !== 'unverified',
          dailyLimitCheck: true
        }
      });

      await txRecord.save();

      // Serialize transaction for QR code
      const serializedTx = transaction.serialize({ 
        requireAllSignatures: false,
        verifySignatures: false 
      }).toString('base64');

      res.json({
        success: true,
        paymentReference,
        transaction: serializedTx,
        amount,
        merchantWallet,
        merchantInfo,
        estimatedFee: 0.000005,
        qrData: {
          reference: paymentReference,
          amount,
          merchant: merchantWallet,
          transaction: serializedTx
        }
      });

    } catch (error) {
      console.error('QR payment creation error:', error);
      res.status(500).json({ error: 'Failed to create payment' });
    }
  }
);

// Sign and submit transaction
router.post('/transaction/sign',
  transactionLimiter,
  authenticateToken,
  [
    body('transaction').isString().withMessage('Transaction data is required'),
    body('paymentReference').optional().isString().withMessage('Payment reference must be a string')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { transaction: serializedTx, paymentReference } = req.body;

      // Get user's wallet with private key
      const wallet = await Wallet.findByUserId(req.user._id).select('+encryptedPrivateKey');
      if (!wallet) {
        return res.status(404).json({ error: 'Wallet not found' });
      }

      // Sign transaction
      const signedTx = await walletService.signTransaction(
        serializedTx,
        wallet.encryptedPrivateKey,
        req.user._id.toString()
      );

      // Submit to Solana network
      const signature = await solanaService.connection.sendRawTransaction(
        Buffer.from(signedTx, 'base64'),
        {
          skipPreflight: false,
          preflightCommitment: 'confirmed'
        }
      );

      // Update transaction record
      let txRecord;
      if (paymentReference) {
        txRecord = await Transaction.findOne({ paymentReference });
      }

      if (txRecord) {
        txRecord.signature = signature;
        txRecord.status = 'pending';
        await txRecord.save();
      } else {
        // Create new transaction record
        txRecord = new Transaction({
          signature,
          userId: req.user._id,
          walletAddress: wallet.publicKey,
          type: 'transfer',
          status: 'pending'
        });
        await txRecord.save();
      }

      // Log security event
      await req.user.addSecurityEvent(
        'transaction_signed',
        req.ip,
        req.get('User-Agent'),
        signature,
        { signature, paymentReference }
      );

      res.json({
        success: true,
        signature,
        status: 'pending',
        message: 'Transaction submitted successfully'
      });

      // Start monitoring transaction status
      setTimeout(() => {
        checkTransactionStatus(signature, txRecord._id);
      }, 5000);

    } catch (error) {
      console.error('Transaction signing error:', error);
      res.status(500).json({ error: 'Failed to sign transaction' });
    }
  }
);

// Get swap quote from Jupiter
router.get('/swap/quote',
  blockchainLimiter,
  authenticateToken,
  [
    query('inputMint').isString().withMessage('Input mint is required'),
    query('outputMint').isString().withMessage('Output mint is required'),
    query('amount').isFloat({ min: 0 }).withMessage('Amount must be positive')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { inputMint, outputMint, amount } = req.query;

      const quote = await solanaService.getSwapQuote(
        inputMint,
        outputMint,
        parseFloat(amount)
      );

      res.json({
        success: true,
        quote,
        inputAmount: amount,
        outputAmount: quote.outAmount,
        priceImpact: quote.priceImpactPct,
        estimatedFee: quote.platformFee || 0
      });

    } catch (error) {
      console.error('Swap quote error:', error);
      res.status(500).json({ error: 'Failed to get swap quote' });
    }
  }
);

// Create swap transaction
router.post('/swap/create',
  transactionLimiter,
  authenticateToken,
  [
    body('quote').isObject().withMessage('Quote data is required'),
    body('slippage').optional().isFloat({ min: 0, max: 10 }).withMessage('Slippage must be between 0-10%')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { quote, slippage = 0.5 } = req.body;

      // Get user's wallet
      const wallet = await Wallet.findByUserId(req.user._id);
      if (!wallet) {
        return res.status(404).json({ error: 'Wallet not found' });
      }

      // Create swap transaction
      const transaction = await solanaService.createSwapTransaction(quote, wallet.publicKey);

      // Save swap record
      const swapRecord = new Transaction({
        signature: '', // Will be filled when signed
        userId: req.user._id,
        walletAddress: wallet.publicKey,
        type: 'swap',
        status: 'pending',
        inputToken: {
          mint: quote.inputMint,
          amount: parseFloat(quote.inAmount),
          symbol: 'TOKEN' // TODO: Get actual symbol
        },
        outputToken: {
          mint: quote.outputMint,
          amount: parseFloat(quote.outAmount),
          symbol: 'TOKEN'
        },
        swapDetails: {
          inputMint: quote.inputMint,
          outputMint: quote.outputMint,
          inputAmount: parseFloat(quote.inAmount),
          outputAmount: parseFloat(quote.outAmount),
          slippage,
          priceImpact: parseFloat(quote.priceImpactPct || 0),
          route: quote.routePlan || []
        }
      });

      await swapRecord.save();

      const serializedTx = transaction.serialize({
        requireAllSignatures: false,
        verifySignatures: false
      }).toString('base64');

      res.json({
        success: true,
        transaction: serializedTx,
        swapId: swapRecord._id,
        inputAmount: quote.inAmount,
        outputAmount: quote.outAmount,
        priceImpact: quote.priceImpactPct
      });

    } catch (error) {
      console.error('Swap creation error:', error);
      res.status(500).json({ error: 'Failed to create swap transaction' });
    }
  }
);

// Get transaction history
router.get('/transactions',
  blockchainLimiter,
  authenticateToken,
  [
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1-100'),
    query('type').optional().isIn(['payment', 'swap', 'transfer', 'mint', 'stake', 'unstake', 'reward']).withMessage('Invalid transaction type')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 20;
      const type = req.query.type;

      let query = { userId: req.user._id };
      if (type) {
        query.type = type;
      }

      const transactions = await Transaction.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .select('-rawTransaction'); // Exclude raw transaction data

      res.json({
        success: true,
        transactions,
        count: transactions.length
      });

    } catch (error) {
      console.error('Transaction history error:', error);
      res.status(500).json({ error: 'Failed to retrieve transactions' });
    }
  }
);

// Get transaction by signature
router.get('/transaction/:signature',
  blockchainLimiter,
  authenticateToken,
  [
    param('signature').isString().withMessage('Transaction signature is required')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { signature } = req.params;

      const transaction = await Transaction.findOne({
        signature,
        userId: req.user._id
      });

      if (!transaction) {
        return res.status(404).json({ error: 'Transaction not found' });
      }

      // Get on-chain status
      const onChainTx = await solanaService.connection.getConfirmedTransaction(signature);
      
      if (onChainTx && transaction.status === 'pending') {
        // Update status
        if (onChainTx.meta.err) {
          await transaction.markFailed({
            code: 'TRANSACTION_FAILED',
            message: 'Transaction failed on-chain',
            details: onChainTx.meta.err
          });
        } else {
          await transaction.markConfirmed(
            onChainTx.blockTime,
            onChainTx.slot,
            1
          );
        }
      }

      res.json({
        success: true,
        transaction,
        onChainData: onChainTx ? {
          blockTime: onChainTx.blockTime,
          slot: onChainTx.slot,
          fee: onChainTx.meta.fee,
          status: onChainTx.meta.err ? 'failed' : 'confirmed'
        } : null
      });

    } catch (error) {
      console.error('Get transaction error:', error);
      res.status(500).json({ error: 'Failed to retrieve transaction' });
    }
  }
);

// Get network status
router.get('/network/status',
  blockchainLimiter,
  async (req, res) => {
    try {
      const [networkStatus, walletStatus] = await Promise.all([
        solanaService.getNetworkStatus(),
        walletService.getConnectionStatus()
      ]);

      res.json({
        success: true,
        network: networkStatus,
        wallet: walletStatus,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Network status error:', error);
      res.status(500).json({ error: 'Failed to get network status' });
    }
  }
);

// Helper function to monitor transaction status
async function checkTransactionStatus(signature, transactionId, attempts = 0) {
  if (attempts >= 30) return; // Max 30 attempts (5 minutes)

  try {
    const onChainTx = await solanaService.connection.getConfirmedTransaction(signature);
    
    if (onChainTx) {
      const transaction = await Transaction.findById(transactionId);
      if (!transaction) return;

      if (onChainTx.meta.err) {
        await transaction.markFailed({
          code: 'TRANSACTION_FAILED',
          message: 'Transaction failed on-chain',
          details: onChainTx.meta.err
        });
      } else {
        await transaction.markConfirmed(
          onChainTx.blockTime,
          onChainTx.slot,
          1
        );

        // Update user's daily spending if it's a payment
        if (transaction.type === 'payment') {
          const wallet = await Wallet.findByUserId(transaction.userId);
          if (wallet) {
            await wallet.addDailySpending(transaction.inputToken.amount);
          }
        }
      }
    } else {
      // Transaction not confirmed yet, check again in 10 seconds
      setTimeout(() => {
        checkTransactionStatus(signature, transactionId, attempts + 1);
      }, 10000);
    }
  } catch (error) {
    console.error('Transaction status check error:', error);
  }
}

module.exports = router; 