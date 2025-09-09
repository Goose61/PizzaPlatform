const express = require('express');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { body, param, query, validationResult } = require('express-validator');
const securityMiddleware = require('../middleware/security');
const router = express.Router();

// Import services and models
const SolanaService = require('../services/solanaService');
const SolanaPayService = require('../services/solanaPayService');
const RewardsService = require('../services/rewardsService');
const GiftCardService = require('../services/giftCardService');
// Investment token service removed - no longer needed in vendor-only system
const User = require('../models/User');
const Business = require('../models/Business');
const Transaction = require('../models/Transaction');
const secretManager = require('../config/secrets');

// Initialize services
const solanaService = new SolanaService();
const solanaPayService = new SolanaPayService();
const rewardsService = new RewardsService();
const giftCardService = new GiftCardService();
// Investment token service instance removed

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
    const secrets = await secretManager.initialize();
    const decoded = jwt.verify(token, secrets.jwtSecret, {
      algorithms: ['HS256'], // Explicitly specify allowed algorithms
      issuer: 'pizza-platform',
      audience: 'user-api'
    });
    const user = await User.findById(decoded.userId);
    
    if (!user || !user.isActive) {
      return res.status(403).json({ error: 'Invalid or inactive user' });
    }
    
    // Additional security checks
    if (user.isLocked) {
      return res.status(423).json({ error: 'Account is temporarily locked' });
    }
    
    req.user = user;
    next();
  } catch (error) {
    console.error('JWT verification error:', error.message);
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

// Get user wallet information (non-custodial focus)
router.get('/wallet',
  blockchainLimiter,
  authenticateToken,
  async (req, res) => {
    try {
      // Get current token balances from user model cache
      const user = await User.findById(req.user._id);
      
      if (!user.wallet || !user.wallet.address) {
        return res.status(404).json({ 
          error: 'Wallet not connected',
          message: 'Please connect your Phantom or Solflare wallet'
        });
      }

      // Get live balances from blockchain
      const [pizzaSPLBalance, usdcBalance] = await Promise.all([
        solanaService.getTokenBalance(user.wallet.address, process.env.PIZZA_TOKEN_MINT),
        solanaService.getTokenBalance(user.wallet.address, process.env.USDC_MINT)
      ]);

      // Update cached balances
      if (user.wallet.pizzaSPLBalance !== pizzaSPLBalance.balance) {
        await user.updateBalance('pizza_spl', pizzaSPLBalance.balance - user.wallet.pizzaSPLBalance);
      }
      if (user.wallet.usdcBalance !== usdcBalance.balance) {
        await user.updateBalance('usdc', usdcBalance.balance - user.wallet.usdcBalance);
      }

      res.json({
        address: user.wallet.address,
        walletType: user.wallet.walletType,
        balances: {
          pizzaSPL: pizzaSPLBalance.balance,
          usdc: usdcBalance.balance
        },
        investmentTokens: user.investmentTokens?.balance || 0,
        giftCards: user.giftCards?.filter(card => !card.used && new Date() < card.expiryDate) || [],
        kycStatus: user.kyc.status,
        paymentStats: {
          totalTransactions: user.payments?.totalTransactions || 0,
          totalVolume: user.payments?.totalVolume || 0,
          rewardsEarned: user.payments?.pizzaSPLRewardsEarned || 0
        }
      });

    } catch (error) {
      console.error('Get wallet error:', error);
      res.status(500).json({ error: 'Failed to retrieve wallet information' });
    }
  }
);

// Connect non-custodial wallet
router.post('/wallet/connect',
  blockchainLimiter,
  authenticateToken,
  [
    body('walletAddress').isString().isLength({ min: 32, max: 44 }).withMessage('Invalid wallet address'),
    body('walletType').isIn(['phantom', 'solflare', 'other']).withMessage('Invalid wallet type')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { walletAddress, walletType } = req.body;

      // Update user wallet information
      const user = await User.findById(req.user._id);
      if (!user.wallet) {
        user.wallet = {};
      }
      
      user.wallet.address = walletAddress;
      user.wallet.walletType = walletType;
      user.wallet.lastBalanceUpdate = new Date();
      
      await user.save();

      // Log security event
      await user.addSecurityEvent(
        'wallet_connected',
        req.ip,
        req.get('User-Agent'),
        `wallet-connect-${Date.now()}`,
        { walletAddress, walletType }
      );

      res.json({
        success: true,
        message: 'Wallet connected successfully',
        walletAddress,
        walletType
      });

    } catch (error) {
      console.error('Wallet connection error:', error);
      res.status(500).json({ error: 'Failed to connect wallet' });
    }
  }
);

// Generate fixed $15 USDC payment QR code
router.post('/payment/qr',
  transactionLimiter,
  authenticateToken,
  [
    body('businessId').isMongoId().withMessage('Valid business ID is required'),
    body('paymentMethod').isIn(['usdc', 'pizza_spl']).withMessage('Payment method must be usdc or pizza_spl')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { businessId, paymentMethod = 'usdc' } = req.body;

      // Validate business exists
      const business = await Business.findById(businessId);
      if (!business) {
        return res.status(404).json({ error: 'Business not found' });
      }

      // Generate Solana Pay QR for fixed $15 USDC payment
      const paymentQR = await solanaService.generatePaymentQR(businessId, {
        paymentMethod,
        customerWallet: req.user.wallet?.address
      });

      res.json({
        success: true,
        qrData: paymentQR.qrCodeURL,
        amount: 15, // Fixed $15 USDC
        paymentMethod,
        businessName: business.businessName,
        paymentReference: paymentQR.paymentReference,
        estimatedReward: 0.3, // Fixed 0.3 $PIZZA SPL reward
        message: `Pay $15 to ${business.businessName} and earn 0.3 $PIZZA SPL`
      });

    } catch (error) {
      console.error('Payment QR generation error:', error);
      res.status(500).json({ error: 'Failed to generate payment QR code' });
    }
  }
);

// Process fixed $15 payment transaction
router.post('/payment/process',
  transactionLimiter,
  securityMiddleware.financialLimiter,
  authenticateToken,
  [
    body('businessId').isMongoId().withMessage('Valid business ID is required'),
    body('paymentReference').isString().isLength({ min: 10, max: 100 }).withMessage('Invalid payment reference format'),
    body('paymentMethod').isIn(['usdc', 'pizza_spl']).withMessage('Payment method must be usdc or pizza_spl'),
    body('transactionSignature').optional().isString().isLength({ min: 64, max: 88 }).withMessage('Invalid transaction signature format')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { businessId, paymentReference, paymentMethod, transactionSignature } = req.body;

      // Validate user has connected wallet
      if (!req.user.wallet?.address) {
        return res.status(400).json({ error: 'Wallet not connected' });
      }

      // CRITICAL FIX: Check for duplicate payment reference to prevent double-spending
      const existingTransaction = await Transaction.findOne({ 
        paymentReference,
        status: { $in: ['pending', 'completed'] }
      });
      
      if (existingTransaction) {
        console.warn(`🚫 Duplicate payment attempt blocked: ${paymentReference} by user ${req.user._id}`);
        return res.status(409).json({ 
          error: 'Payment already processed',
          code: 'DUPLICATE_PAYMENT_REFERENCE'
        });
      }

      // Create pending transaction record FIRST to prevent race conditions
      const pendingTransaction = new Transaction({
        signature: transactionSignature || `pending_${Date.now()}`,
        userId: req.user._id,
        businessId,
        paymentReference,
        paymentMethod,
        amount: 15,
        status: 'pending',
        createdAt: new Date()
      });
      await pendingTransaction.save();

      // Process the fixed payment
      const paymentResult = await solanaService.processFixedPayment({
        customerWalletAddress: req.user.wallet.address,
        businessId,
        paymentMethod,
        paymentReference,
        userId: req.user._id
      });

      // Distribute fixed reward
      const rewardResult = await rewardsService.processPaymentReward({
        userId: req.user._id,
        businessId,
        transactionId: paymentResult.signature,
        customerWalletAddress: req.user.wallet.address,
        transactionAmount: 15
      });

      // Create transaction record
      const transaction = new Transaction({
        signature: paymentResult.signature,
        userId: req.user._id,
        walletAddress: req.user.wallet.address,
        type: 'payment',
        status: 'confirmed',
        amount: 15, // Fixed amount
        businessId,
        paymentReference,
        fees: paymentResult.fees,
        rewards: {
          pizzaTokensDistributed: 0.3,
          vaultFunded: paymentResult.fees.vaultContribution
        },
        jupiterSwap: paymentMethod === 'pizza_spl' ? paymentResult.jupiterSwap : undefined
      });

      await transaction.save();

      res.json({
        success: true,
        transactionSignature: paymentResult.signature,
        amount: 15,
        paymentMethod,
        reward: {
          pizzaTokens: 0.3,
          message: 'You earned 0.3 $PIZZA SPL!'
        },
        fees: paymentResult.fees,
        merchantReceived: paymentResult.merchantReceived
      });

    } catch (error) {
      console.error('Payment processing error:', error);
      res.status(500).json({ error: 'Failed to process payment' });
    }
  }
);

// Get Jupiter swap quote for $PIZZA SPL to USDC
router.get('/swap/quote',
  blockchainLimiter,
  authenticateToken,
  [
    query('inputAmount').isFloat({ min: 0.1 }).withMessage('Input amount must be at least 0.1'),
    query('outputToken').isIn(['USDC']).withMessage('Only USDC output supported')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { inputAmount, outputToken = 'USDC' } = req.query;

      // Get Jupiter quote for $PIZZA SPL to USDC conversion
      const quote = await solanaService.getJupiterQuote({
        inputMint: process.env.PIZZA_TOKEN_MINT,
        outputMint: process.env.USDC_MINT,
        amount: Math.ceil(parseFloat(inputAmount) * 1e6), // Convert to micro tokens
        slippageBps: 75 // 0.75% slippage tolerance
      });

      if (!quote) {
        return res.status(400).json({ error: 'Swap quote unavailable' });
      }

      res.json({
        success: true,
        inputAmount: parseFloat(inputAmount),
        outputAmount: parseFloat(quote.outAmount) / 1e6, // Convert from micro USDC
        swapLoss: 0.0075, // 0.75% customer-absorbed loss
        priceImpact: parseFloat(quote.priceImpactPct || 0),
        route: quote.routePlan,
        estimatedFee: 0.00025 // Solana network fee
      });

    } catch (error) {
      console.error('Swap quote error:', error);
      res.status(500).json({ error: 'Failed to get swap quote' });
    }
  }
);

// Convert $PIZZA SPL to investment tokens (requires KYC)
router.post('/investment-token/convert',
  transactionLimiter,
  authenticateToken,
  [
    body('pizzaAmount').isInt({ min: 10 }).withMessage('Minimum 10 $PIZZA SPL required for conversion'),
    body('usdcAmount').equals('0.10').withMessage('USDC amount must be exactly $0.10')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { pizzaAmount, usdcAmount } = req.body;

      // Check KYC status
      if (req.user.kyc.status !== 'verified') {
        return res.status(403).json({ 
          error: 'KYC verification required for investment token conversion',
          kycRequired: true
        });
      }

      // Validate conversion ratio (10 $PIZZA SPL + $0.10 USDC = 1 investment token)
      const conversionRatio = 10;
      const investmentTokens = Math.floor(pizzaAmount / conversionRatio);
      
      if (investmentTokens === 0) {
        return res.status(400).json({ error: 'Insufficient $PIZZA SPL for conversion' });
      }

      // Process investment token conversion
      const conversionResult = await investmentTokenService.convertToInvestmentToken({
        userId: req.user._id,
        pizzaAmount: investmentTokens * conversionRatio, // Use exact amount
        usdcAmount: parseFloat(usdcAmount),
        walletAddress: req.user.wallet.address
      });

      res.json({
        success: true,
        investmentTokensMinted: conversionResult.tokensIssued,
        pizzaUsed: investmentTokens * conversionRatio,
        usdcUsed: parseFloat(usdcAmount),
        conversionRate: '10:1',
        governanceVotes: conversionResult.tokensIssued,
        transactionSignature: conversionResult.mintTransaction,
        totalInvestmentTokens: conversionResult.totalBalance
      });

    } catch (error) {
      console.error('Investment token conversion error:', error);
      res.status(500).json({ error: 'Failed to convert to investment tokens' });
    }
  }
);

// Mint gift card NFT (business-initiated)
router.post('/gift-card/mint',
  transactionLimiter,
  authenticateToken,
  [
    body('businessId').isMongoId().withMessage('Valid business ID is required'),
    body('recipientAddress').optional().isString().withMessage('Recipient address must be a string'),
    body('customMessage').optional().isString().withMessage('Custom message must be a string')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { businessId, recipientAddress, customMessage } = req.body;

      // Note: This endpoint would typically be called by business owners
      // For now, allow any authenticated user to mint for testing
      const giftCardResult = await giftCardService.mintGiftCard({
        businessId,
        recipientWalletAddress: recipientAddress || req.user.wallet.address,
        customMessage: customMessage || 'Thank you for your business!',
        campaignId: `campaign_${Date.now()}`
      });

      if (!giftCardResult.success) {
        return res.status(400).json({ 
          error: giftCardResult.reason || 'Gift card minting failed' 
        });
      }

      res.json({
        success: true,
        giftCardId: giftCardResult.giftCardId,
        nftAddress: giftCardResult.nftAddress,
        value: 5, // 5 $PIZZA SPL value
        expiryDate: giftCardResult.expiryDate,
        mintingCost: 0.50,
        message: 'Gift card NFT minted successfully'
      });

    } catch (error) {
      console.error('Gift card minting error:', error);
      res.status(500).json({ error: 'Failed to mint gift card NFT' });
    }
  }
);

// Redeem gift card NFT
router.post('/gift-card/redeem',
  transactionLimiter,
  authenticateToken,
  [
    body('giftCardId').isString().withMessage('Gift card ID is required')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { giftCardId } = req.body;

      const redemptionResult = await giftCardService.redeemGiftCard({
        giftCardId,
        recipientWalletAddress: req.user.wallet.address,
        recipientUserId: req.user._id
      });

      if (!redemptionResult.success) {
        return res.status(400).json({ 
          error: redemptionResult.reason || 'Gift card redemption failed' 
        });
      }

      res.json({
        success: true,
        pizzaTokensReceived: redemptionResult.tokensTransferred,
        transactionSignature: redemptionResult.transferTransaction,
        message: `You received ${redemptionResult.tokensTransferred} $PIZZA SPL!`
      });

    } catch (error) {
      console.error('Gift card redemption error:', error);
      res.status(500).json({ error: 'Failed to redeem gift card' });
    }
  }
);

// Get transaction history with new transaction types
router.get('/transactions',
  blockchainLimiter,
  authenticateToken,
  [
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1-100'),
    query('type').optional().isIn([
      'payment', 
      'pizza_spl_swap', 
      'reward_distribution',
      'gift_card_mint',
      'gift_card_redeem',
      'investment_token_conversion',
      'vault_contribution'
    ]).withMessage('Invalid transaction type')
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
        .populate('businessId', 'businessName businessType')
        .select('-rawTransaction');

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
      }).populate('businessId', 'businessName businessType');

      if (!transaction) {
        return res.status(404).json({ error: 'Transaction not found' });
      }

      // Validate payment transaction on Solana if still pending
      if (transaction.status === 'pending') {
        const validation = await solanaService.validatePaymentTransaction(signature);
        
        if (validation.valid) {
          await transaction.markConfirmed(
            validation.blockTime,
            validation.slot,
            validation.confirmations
          );
        }
      }

      res.json({
        success: true,
        transaction
      });

    } catch (error) {
      console.error('Get transaction error:', error);
      res.status(500).json({ error: 'Failed to retrieve transaction' });
    }
  }
);

// Get platform vault analytics (admin only)
router.get('/vault/analytics',
  blockchainLimiter,
  authenticateToken,
  async (req, res) => {
    try {
      // Basic auth check - would need admin role in production
      if (!req.user.email.includes('admin')) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const VaultService = require('../services/vaultService');
      const vaultService = new VaultService();
      
      const analytics = await vaultService.getPlatformVaultAnalytics();

      res.json({
        success: true,
        analytics
      });

    } catch (error) {
      console.error('Vault analytics error:', error);
      res.status(500).json({ error: 'Failed to retrieve vault analytics' });
    }
  }
);

// Get network status
router.get('/network/status',
  blockchainLimiter,
  async (req, res) => {
    try {
      const networkStatus = await solanaService.getNetworkStatus();

      res.json({
        success: true,
        network: networkStatus,
        services: {
          solana: 'operational',
          jupiter: 'operational',
          kamino: 'operational'
        },
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Network status error:', error);
      res.status(500).json({ error: 'Failed to get network status' });
    }
  }
);

module.exports = router;

// Additional endpoints required by frontend

// Get payment status by reference
router.get('/payment/status/:paymentReference',
  authenticateToken,
  [
    param('paymentReference').isString().isLength({ min: 5, max: 120 }).withMessage('Invalid payment reference')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { paymentReference } = req.params;
      const tx = await Transaction.findOne({ paymentReference, userId: req.user._id });
      if (!tx) {
        return res.json({ completed: false });
      }
      const completed = ['confirmed', 'failed', 'cancelled'].includes(tx.status);
      res.json({
        completed,
        success: tx.status === 'confirmed',
        error: tx.status === 'failed' ? (tx.error?.message || 'failed') : null
      });
    } catch (error) {
      console.error('Payment status check error:', error);
      res.status(500).json({ error: 'Failed to check payment status' });
    }
  }
);

// Get authenticated user's gift cards
router.get('/gift-cards/my-cards',
  authenticateToken,
  async (req, res) => {
    try {
      const user = await User.findById(req.user._id).lean();
      const giftCards = (user?.giftCards || []).map(card => ({
        nftAddress: card.nftAddress,
        value: card.value,
        expiryDate: card.expiryDate,
        redeemed: !!card.redeemed,
        businessId: card.businessId,
        businessName: undefined // can be populated below
      }));

      // Populate business names
      const businessIds = [...new Set(giftCards.map(c => c.businessId).filter(Boolean))];
      if (businessIds.length > 0) {
        const businesses = await Business.find({ _id: { $in: businessIds } }).select('businessName');
        const map = new Map(businesses.map(b => [b._id.toString(), b.businessName]));
        giftCards.forEach(c => {
          if (c.businessId) c.businessName = map.get(c.businessId.toString()) || 'Business';
        });
      }

      res.json(giftCards);
    } catch (error) {
      console.error('Get my gift cards error:', error);
      res.status(500).json({ error: 'Failed to load gift cards' });
    }
  }
);

// Generate payment QR code
router.post('/generate-qr',
  blockchainLimiter,
  authenticateToken,
  [
    body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be a positive number'),
    body('memo').optional().isString().isLength({ max: 32 }).withMessage('Memo must be 32 characters or less'),
    body('businessEmail').optional().isEmail().withMessage('Valid business email required')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { amount, memo, businessEmail } = req.body;
      
      // Validate amount is exactly $15 for fixed payment system
      if (parseFloat(amount) !== 15) {
        return res.status(400).json({ 
          error: 'Payment amount must be exactly $15 USDC' 
        });
      }
      
      // Find business for QR generation
      const business = await Business.findOne({ 
        ownerId: req.user._id,
        businessType: 'CN',
        isActive: true 
      });
      
      if (!business) {
        return res.status(400).json({ 
          error: 'Business not found or not active' 
        });
      }
      
      // Business must have linked their wallet address
      const businessWallet = business.settlement?.walletAddress;
      
      if (!businessWallet) {
        return res.status(400).json({ 
          error: 'Business wallet not linked. Please link your Solana wallet address in settings.' 
        });
      }
      
      // Generate QR code using Solana Pay
      const qrResult = await solanaPayService.createPizzaPaymentQR({
        businessWallet: businessWallet,
        businessName: business.businessName,
        memo: memo || `Pizza payment - ${business.businessName}`
      });
      
      if (!qrResult.success) {
        return res.status(500).json({ 
          error: qrResult.error || 'Failed to generate QR code' 
        });
      }
      
      res.json({
        success: true,
        qrImage: qrResult.qrImage,
        qrUrl: qrResult.qrUrl,
        reference: qrResult.reference,
        memo: qrResult.memo,
        amount: qrResult.amounts.total,
        businessAmount: qrResult.amounts.business,
        platformFee: qrResult.amounts.platformFee,
        vaultFee: qrResult.amounts.vaultFee,
        recipient: businessWallet,
        businessName: business.businessName,
        currency: 'USDC',
        network: 'devnet',
        paymentType: 'solana-pay'
      });
      
    } catch (error) {
      console.error('QR generation error:', error);
      res.status(500).json({ error: 'Failed to generate payment QR code' });
    }
  }
);

// Solana Pay Transaction Request endpoint
// This endpoint creates a transaction for the customer to sign
router.post('/solana-pay/transaction',
  blockchainLimiter,
  [
    body('account').isString().withMessage('Customer account is required'),
    body('reference').isString().withMessage('Payment reference is required'),
    body('businessWallet').isString().withMessage('Business wallet is required')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { account, reference, businessWallet } = req.body;
      
      // Create transaction request
      const transactionResult = await solanaPayService.createTransactionRequest({
        account,
        reference,
        businessWallet,
        amount: 15 // Fixed $15 USDC
      });
      
      if (!transactionResult.success) {
        return res.status(400).json({ 
          error: transactionResult.error 
        });
      }
      
      res.json({
        transaction: transactionResult.transaction,
        message: transactionResult.message
      });
      
    } catch (error) {
      console.error('Transaction request error:', error);
      res.status(500).json({ error: 'Failed to create transaction' });
    }
  }
);

// Check payment status by reference
router.get('/payment-status/:reference',
  blockchainLimiter,
  authenticateToken,
  [
    param('reference').isString().withMessage('Payment reference is required')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { reference } = req.params;
      
      // Check payment status
      const statusResult = await solanaPayService.getPaymentStatus(reference);
      
      if (!statusResult.success) {
        return res.status(400).json({ 
          error: statusResult.error 
        });
      }
      
      res.json({
        status: statusResult.status,
        signature: statusResult.signature,
        blockTime: statusResult.blockTime,
        slot: statusResult.slot
      });
      
    } catch (error) {
      console.error('Payment status error:', error);
      res.status(500).json({ error: 'Failed to check payment status' });
    }
  }
);

// Validate completed payment
router.post('/validate-payment',
  blockchainLimiter,
  authenticateToken,
  [
    body('signature').isString().withMessage('Transaction signature is required'),
    body('reference').isString().withMessage('Payment reference is required')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { signature, reference } = req.body;
      
      // Validate payment
      const validationResult = await solanaPayService.validatePayment(signature, reference);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: validationResult.error 
        });
      }
      
      // If payment is valid, create transaction record and distribute fees
      if (validationResult.validated) {
        // Find the business
        const business = await Business.findOne({ 
          ownerId: req.user._id,
          businessType: 'CN',
          isActive: true 
        });
        
        if (business) {
          // Create transaction record
          const transaction = new Transaction({
            userId: req.user._id,
            businessId: business._id,
            type: 'payment',
            amount: 15,
            currency: 'USDC',
            signature: validationResult.signature,
            status: 'confirmed',
            blockTime: validationResult.blockTime,
            slot: validationResult.slot,
            paymentReference: reference,
            fees: {
              platform: 0.15,
              vault: 0.195,
              total: 0.345
            },
            netAmount: 14.655
          });
          
          await transaction.save();
          
          // TODO: Implement automatic fee distribution
          // This would transfer the platform fee and vault contribution
          // to their respective wallets
        }
      }
      
      res.json({
        success: true,
        validated: validationResult.validated,
        signature: validationResult.signature,
        blockTime: validationResult.blockTime,
        slot: validationResult.slot
      });
      
    } catch (error) {
      console.error('Payment validation error:', error);
      res.status(500).json({ error: 'Failed to validate payment' });
    }
  }
);

module.exports = router;