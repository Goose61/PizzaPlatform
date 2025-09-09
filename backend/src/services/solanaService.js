const { 
  Connection, 
  PublicKey, 
  Transaction, 
  SystemProgram,
  LAMPORTS_PER_SOL 
} = require('@solana/web3.js');
const { 
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAccount,
  getMint
} = require('@solana/spl-token');
// Jupiter integration will be implemented separately
const fetch = require('node-fetch');
const winston = require('winston');
const { encodeURL } = require('@solana/pay');

class SolanaService {
  constructor() {
    this.connection = new Connection(
      process.env.SOLANA_RPC_ENDPOINT || 'https://api.devnet.solana.com',
      'confirmed'
    );
    
    // Check if we're on devnet or mainnet
    const isDevnet = this.connection.rpcEndpoint.includes('devnet');
    
    // Token addresses from environment with devnet/mainnet defaults
    this.usdcMint = process.env.USDC_MINT ? 
      new PublicKey(process.env.USDC_MINT) : 
      new PublicKey(isDevnet ? 
        '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU' : // USDC devnet mint
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'   // USDC mainnet mint
      );
    
    this.pizzaSPLMint = process.env.PIZZA_TOKEN_MINT ? 
      new PublicKey(process.env.PIZZA_TOKEN_MINT) : 
      new PublicKey('So11111111111111111111111111111111111111112'); // SOL mint (for testing)
    
    this.pizzaInvestmentTokenMint = process.env.PIZZA_INVESTMENT_TOKEN_MINT ? 
      new PublicKey(process.env.PIZZA_INVESTMENT_TOKEN_MINT) : 
      new PublicKey('So11111111111111111111111111111111111111112'); // SOL mint (for testing)
    
    // Fixed transaction configuration
    this.fixedTransactionAmount = 15; // $15 USDC
    this.fixedRewardAmount = 0.3; // 0.3 $PIZZA SPL per transaction
    this.jupiterSwapLoss = 0.0075; // 0.75% customer-absorbed loss
    
    // Solana Pay configuration
    this.solanaPayTransferFee = 0.00025; // $0.00025 per transfer
    
    // Jupiter DEX integration
    this.jupiterQuoteAPI = 'https://quote-api.jup.ag/v6/quote';
    this.jupiterSwapAPI = 'https://quote-api.jup.ag/v6/swap';
    
    // Setup logging
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.File({ filename: 'logs/solana-operations.log' }),
        new winston.transports.Console({ 
          format: winston.format.simple(),
          level: 'error'
        })
      ]
    });
    
    // Initialize services
    this.BusinessTypeService = require('./businessTypeService');
    this.businessTypeService = new this.BusinessTypeService();

    // Transaction validation thresholds
    this.validationThresholds = {
      highValueTransaction: 1000 * LAMPORTS_PER_SOL, // 1000 SOL
      maxTokenTransfer: 10000, // Max SPL token transfer amount
      maxUSDCTransfer: 50000   // Max USDC transfer ($50k)
    };
  }

  /**
   * Get SPL token balance for a wallet
   * @param {string} walletAddress - Wallet public key
   * @param {string} tokenMint - Token mint address (optional, defaults to SPL token)
   * @returns {Object} - Token balance information
   */
  async getTokenBalance(walletAddress, tokenMint = null) {
    try {
      const wallet = new PublicKey(walletAddress);
      const mint = tokenMint ? new PublicKey(tokenMint) : this.splTokenMint;
      
      // Get associated token account
      const tokenAccount = await getAssociatedTokenAddress(mint, wallet);
      
      try {
        const account = await getAccount(this.connection, tokenAccount);
        const mintInfo = await getMint(this.connection, mint);
        
        // Convert balance considering decimals
        const balance = Number(account.amount) / Math.pow(10, mintInfo.decimals);
        
        return {
          balance,
          tokenAccount: tokenAccount.toString(),
          mint: mint.toString(),
          decimals: mintInfo.decimals,
          exists: true
        };
        
      } catch (error) {
        // Token account doesn't exist
        return {
          balance: 0,
          tokenAccount: tokenAccount.toString(),
          mint: mint.toString(),
          decimals: 6, // Default decimals
          exists: false
        };
      }
      
    } catch (error) {
      this.logger.error('Token balance check failed', {
        walletAddress,
        tokenMint,
        error: error.message
      });
      throw new Error('Failed to get token balance');
    }
  }

  /**
   * Create a transaction to transfer SPL tokens
   * @param {string} fromWallet - Sender wallet address
   * @param {string} toWallet - Recipient wallet address
   * @param {number} amount - Amount to transfer
   * @param {string} tokenMint - Token mint address (optional)
   * @returns {Transaction} - Unsigned transaction
   */
  async createTokenTransfer(fromWallet, toWallet, amount, tokenMint = null) {
    try {
      const from = new PublicKey(fromWallet);
      const to = new PublicKey(toWallet);
      const mint = tokenMint ? new PublicKey(tokenMint) : this.splTokenMint;
      
      // Get mint info for decimals
      const mintInfo = await getMint(this.connection, mint);
      const transferAmount = BigInt(amount * Math.pow(10, mintInfo.decimals));
      
      // Get associated token accounts
      const fromTokenAccount = await getAssociatedTokenAddress(mint, from);
      const toTokenAccount = await getAssociatedTokenAddress(mint, to);
      
      const transaction = new Transaction();
      
      // Check if recipient token account exists, create if not
      try {
        await getAccount(this.connection, toTokenAccount);
      } catch (error) {
        // Create associated token account for recipient
        const createAccountInstruction = createAssociatedTokenAccountInstruction(
          from, // payer
          toTokenAccount,
          to, // owner
          mint
        );
        transaction.add(createAccountInstruction);
      }
      
      // Add transfer instruction
      const transferInstruction = createTransferInstruction(
        fromTokenAccount,
        toTokenAccount,
        from,
        transferAmount
      );
      transaction.add(transferInstruction);
      
      // Set recent blockhash
      const { blockhash } = await this.connection.getRecentBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = from;
      
      this.logger.info('Token transfer transaction created', {
        from: fromWallet,
        to: toWallet,
        amount,
        mint: mint.toString()
      });
      
      return transaction;
      
    } catch (error) {
      this.logger.error('Token transfer creation failed', {
        fromWallet,
        toWallet,
        amount,
        error: error.message
      });
      throw new Error('Failed to create token transfer');
    }
  }

  /**
   * Get Jupiter swap quote 
   * @param {string} inputMint - Input token mint
   * @param {string} outputMint - Output token mint
   * @param {number} amount - Input amount
   * @returns {Object} - Swap quote information
   */
  async getSwapQuote(inputMint, outputMint, amount) {
    try {
      const inputMintInfo = await getMint(this.connection, new PublicKey(inputMint));
      const amountInLamports = Math.floor(amount * Math.pow(10, inputMintInfo.decimals));
      
      const queryParams = new URLSearchParams({
        inputMint: inputMint,
        outputMint: outputMint,
        amount: amountInLamports.toString(),
        slippageBps: '50' // 0.5% slippage
      });
      
      const quoteUrl = `${this.jupiterQuoteAPI}?${queryParams}`;
      
      this.logger.info('Getting Jupiter swap quote', {
        inputMint,
        outputMint,
        amount,
        amountInLamports
      });
      
      const response = await fetch(quoteUrl);
      const quote = await response.json();
      
      if (!response.ok) {
        throw new Error(quote.error || 'Failed to get swap quote');
      }
      
      this.logger.info('Swap quote received', {
        inputMint,
        outputMint,
        inputAmount: amount,
        outputAmount: quote.outAmount,
        priceImpact: quote.priceImpactPct
      });
      
      return quote;
      
    } catch (error) {
      this.logger.error('Failed to get swap quote', {
        inputMint,
        outputMint,
        amount,
        error: error.message
      });
      throw new Error('Failed to get swap quote: ' + error.message);
    }
    
    /* 
    // Uncomment when Jupiter package is installed
    try {
      const inputMintInfo = await getMint(this.connection, new PublicKey(inputMint));
      const amountInLamports = Math.floor(amount * Math.pow(10, inputMintInfo.decimals));
      
      const quoteUrl = `${this.jupiterQuoteAPI}/quote` +
        `?inputMint=${inputMint}` +
        `&outputMint=${outputMint}` +
        `&amount=${amountInLamports}` +
        `&slippageBps=50`; // 0.5% slippage
      
      const response = await fetch(quoteUrl);
      const quote = await response.json();
      
      if (!response.ok) {
        throw new Error(quote.error || 'Failed to get swap quote');
      }
      
      this.logger.info('Swap quote received', {
        inputMint,
        outputMint,
        inputAmount: amount,
        outputAmount: quote.outAmount,
        priceImpact: quote.priceImpactPct
      });
      
      return quote;
      
    } catch (error) {
      this.logger.error('Swap quote failed', {
        inputMint,
        outputMint,
        amount,
        error: error.message
      });
      throw new Error('Failed to get swap quote');
    }
    */
  }

  /**
   * Create Jupiter swap transaction
   * @param {Object} quote - Quote from getSwapQuote
   * @param {string} userPublicKey - User's wallet address
   * @returns {Transaction} - Unsigned swap transaction
   */
  async createSwapTransaction(quote, userPublicKey) {
    try {
      const swapResponse = await fetch(this.jupiterSwapAPI, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          quoteResponse: quote,
          userPublicKey: userPublicKey,
          wrapAndUnwrapSol: true,
          computeUnitPriceMicroLamports: 'auto'
        })
      });
      
      const swapResult = await swapResponse.json();
      
      if (!swapResponse.ok) {
        throw new Error(swapResult.error || 'Failed to create swap transaction');
      }
      
      // Deserialize the transaction
      const transaction = Transaction.from(Buffer.from(swapResult.swapTransaction, 'base64'));
      
      this.logger.info('Swap transaction created', {
        userPublicKey,
        inputAmount: quote.inAmount,
        outputAmount: quote.outAmount
      });
      
      return transaction;
      
    } catch (error) {
      this.logger.error('Swap transaction creation failed', {
        error: error.message,
        userPublicKey
      });
      throw new Error('Failed to create swap transaction: ' + error.message);
    }
    
    /*
    // Uncomment when Jupiter package is installed
    try {
      const swapResponse = await fetch(`${this.jupiterSwapAPI}/swap`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          quoteResponse: quote,
          userPublicKey: userPublicKey,
          wrapAndUnwrapSol: true,
        }),
      });
      
      const swapResult = await swapResponse.json();
      
      if (!swapResponse.ok) {
        throw new Error(swapResult.error || 'Failed to create swap transaction');
      }
      
      // Deserialize the transaction
      const transaction = Transaction.from(Buffer.from(swapResult.swapTransaction, 'base64'));
      
      this.logger.info('Swap transaction created', {
        userPublicKey,
        inputMint: quote.inputMint,
        outputMint: quote.outputMint,
        inputAmount: quote.inAmount,
        outputAmount: quote.outAmount
      });
      
      return transaction;
      
    } catch (error) {
      this.logger.error('Swap transaction creation failed', {
        userPublicKey,
        error: error.message
      });
      throw new Error('Failed to create swap transaction');
    }
    */
  }

  // QR payment functionality moved to Solana Pay standard implementation
  // Use SolanaPayService for all Solana Pay related operations

  /**
   * Verify payment transaction on-chain
   * @param {string} signature - Transaction signature
   * @param {string} expectedAmount - Expected payment amount
   * @param {string} expectedRecipient - Expected recipient address
   * @returns {Object} - Payment verification result
   */
  async verifyPayment(signature, expectedAmount, expectedRecipient) {
    try {
      const transaction = await this.connection.getConfirmedTransaction(signature);
      
      if (!transaction) {
        return { verified: false, reason: 'Transaction not found' };
      }
      
      if (transaction.meta.err) {
        return { verified: false, reason: 'Transaction failed', error: transaction.meta.err };
      }
      
      // Parse token transfers from transaction
      const tokenTransfers = transaction.meta.postTokenBalances
        .filter(balance => balance.uiTokenAmount.uiAmount > 0)
        .map(balance => ({
          mint: balance.mint,
          amount: balance.uiTokenAmount.uiAmount,
          owner: balance.owner
        }));
      
      // Verify amount and recipient
      const validTransfer = tokenTransfers.find(transfer => 
        transfer.owner === expectedRecipient &&
        Math.abs(transfer.amount - expectedAmount) < 0.001 // Allow small precision differences
      );
      
      if (validTransfer) {
        this.logger.info('Payment verified', {
          signature,
          amount: validTransfer.amount,
          recipient: expectedRecipient
        });
        
        return {
          verified: true,
          amount: validTransfer.amount,
          recipient: expectedRecipient,
          blockTime: transaction.blockTime
        };
      } else {
        return { verified: false, reason: 'Amount or recipient mismatch' };
      }
      
    } catch (error) {
      this.logger.error('Payment verification failed', {
        signature,
        error: error.message
      });
      return { verified: false, reason: 'Verification error', error: error.message };
    }
  }

  /**
   * Get transaction history for a wallet
   * @param {string} walletAddress - Wallet address
   * @param {number} limit - Number of transactions to return
   * @returns {Array} - Array of transaction data
   */
  async getTransactionHistory(walletAddress, limit = 10) {
    try {
      const publicKey = new PublicKey(walletAddress);
      const signatures = await this.connection.getSignaturesForAddress(publicKey, { limit });
      
      const transactions = await Promise.all(
        signatures.map(async (sig) => {
          try {
            const tx = await this.connection.getConfirmedTransaction(sig.signature);
            return {
              signature: sig.signature,
              blockTime: tx.blockTime,
              status: tx.meta.err ? 'failed' : 'success',
              fee: tx.meta.fee / LAMPORTS_PER_SOL,
              slot: tx.slot
            };
          } catch (error) {
            return {
              signature: sig.signature,
              blockTime: sig.blockTime,
              status: 'error',
              error: error.message
            };
          }
        })
      );
      
      return transactions.filter(tx => tx !== null);
      
    } catch (error) {
      this.logger.error('Transaction history fetch failed', {
        walletAddress,
        error: error.message
      });
      throw new Error('Failed to get transaction history');
    }
  }

  /**
   * Validate transaction before signing - CRITICAL SECURITY METHOD
   * @param {string} serializedTx - Serialized transaction data
   * @param {string} expectedSignerPublicKey - Expected signer's public key
   * @param {string} userId - User ID for audit logging
   * @returns {Object} - Validation result
   */
  async validateTransactionBeforeSigning(serializedTx, expectedSignerPublicKey, userId) {
    const validationResult = {
      isValid: false,
      errors: [],
      requiresAdditionalAuth: false,
      warnings: []
    };

    try {
      // Parse the transaction
      let transaction;
      try {
        const txBuffer = Buffer.from(serializedTx, 'base64');
        transaction = Transaction.from(txBuffer);
      } catch (parseError) {
        validationResult.errors.push('Invalid transaction format');
        return validationResult;
      }

      // 1. Verify expected signer is in the transaction
      const expectedSigner = new PublicKey(expectedSignerPublicKey);
      const transactionSigners = transaction.signatures.map(sig => sig.publicKey.toString());
      
      if (!transactionSigners.includes(expectedSigner.toString())) {
        validationResult.errors.push('Transaction does not include expected signer');
        return validationResult;
      }

      // 2. Analyze instructions for security risks
      for (const instruction of transaction.instructions) {
        const programId = instruction.programId.toString();
        
        // Check for suspicious program interactions
        if (!this.isAllowedProgramId(programId)) {
          validationResult.errors.push(`Interaction with unauthorized program: ${programId}`);
          continue;
        }

        // Validate token transfers
        if (programId === TOKEN_PROGRAM_ID.toString()) {
          const tokenValidation = this.validateTokenInstruction(instruction, expectedSigner);
          if (!tokenValidation.isValid) {
            validationResult.errors.push(...tokenValidation.errors);
            continue;
          }
          
          // Check for high-value transfers requiring additional auth
          if (tokenValidation.requiresAdditionalAuth) {
            validationResult.requiresAdditionalAuth = true;
            validationResult.warnings.push('High-value token transfer detected');
          }
        }

        // Validate SOL transfers
        if (programId === SystemProgram.programId.toString()) {
          const solValidation = this.validateSystemInstruction(instruction, expectedSigner);
          if (!solValidation.isValid) {
            validationResult.errors.push(...solValidation.errors);
            continue;
          }
          
          if (solValidation.requiresAdditionalAuth) {
            validationResult.requiresAdditionalAuth = true;
            validationResult.warnings.push('High-value SOL transfer detected');
          }
        }
      }

      // 3. Check transaction size limits
      if (transaction.instructions.length > 10) {
        validationResult.errors.push('Transaction contains too many instructions');
      }

      // 4. Verify transaction has reasonable fee
      const feePayerBalance = await this.connection.getBalance(transaction.feePayer);
      if (feePayerBalance < 5000) { // 0.000005 SOL minimum
        validationResult.warnings.push('Fee payer has low SOL balance');
      }

      // Mark as valid if no errors found
      validationResult.isValid = validationResult.errors.length === 0;

      // Log validation attempt for audit
      this.logger.info('Transaction validation performed', {
        userId,
        isValid: validationResult.isValid,
        requiresAdditionalAuth: validationResult.requiresAdditionalAuth,
        errorCount: validationResult.errors.length,
        warningCount: validationResult.warnings.length
      });

      return validationResult;

    } catch (error) {
      this.logger.error('Transaction validation failed', {
        userId,
        error: error.message
      });
      validationResult.errors.push('Transaction validation system error');
      return validationResult;
    }
  }

  /**
   * Check if program ID is allowed for interactions
   * @param {string} programId - Program ID to check
   * @returns {boolean} - Whether program is allowed
   */
  isAllowedProgramId(programId) {
    const allowedPrograms = [
      SystemProgram.programId.toString(),
      TOKEN_PROGRAM_ID.toString(),
      ASSOCIATED_TOKEN_PROGRAM_ID.toString(),
      this.splTokenMint.toString(),
      this.pizzaTokenMint.toString(),
      // Jupiter program IDs (add as needed)
      'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4', // Jupiter V6
      'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB'  // Jupiter V4
    ];

    return allowedPrograms.includes(programId);
  }

  /**
   * Validate token transfer instructions
   * @param {Object} instruction - Token instruction
   * @param {PublicKey} expectedSigner - Expected signer
   * @returns {Object} - Validation result
   */
  validateTokenInstruction(instruction, expectedSigner) {
    const result = { isValid: true, errors: [], requiresAdditionalAuth: false };

    try {
      // For SPL token transfers, check amount limits
      // This is a simplified validation - in production, you'd decode the instruction data properly
      const keys = instruction.keys;
      
      // Basic checks for token transfer structure
      if (keys.length < 3) {
        result.errors.push('Invalid token instruction structure');
        result.isValid = false;
        return result;
      }

      // Check if signer is authorized for source account
      const sourceAccount = keys[0];
      if (!sourceAccount.isSigner && !keys.some(key => key.pubkey.equals(expectedSigner) && key.isSigner)) {
        result.errors.push('Unauthorized token transfer');
        result.isValid = false;
        return result;
      }

      // Additional checks would go here for amount validation
      // For now, we'll mark large transfers for additional auth
      result.requiresAdditionalAuth = true; // Conservative approach

      return result;

    } catch (error) {
      result.errors.push('Token instruction validation error');
      result.isValid = false;
      return result;
    }
  }

  /**
   * Validate system (SOL) transfer instructions
   * @param {Object} instruction - System instruction
   * @param {PublicKey} expectedSigner - Expected signer
   * @returns {Object} - Validation result
   */
  validateSystemInstruction(instruction, expectedSigner) {
    const result = { isValid: true, errors: [], requiresAdditionalAuth: false };

    try {
      const keys = instruction.keys;
      
      if (keys.length < 2) {
        result.errors.push('Invalid system instruction structure');
        result.isValid = false;
        return result;
      }

      // Check if expected signer is the source (from) account
      const fromAccount = keys[0];
      if (!fromAccount.pubkey.equals(expectedSigner)) {
        result.errors.push('Unauthorized SOL transfer from different account');
        result.isValid = false;
        return result;
      }

      // Decode transfer amount from instruction data (simplified)
      if (instruction.data && instruction.data.length >= 12) {
        // SystemInstruction::Transfer has 4 bytes instruction + 8 bytes lamports
        const transferAmount = Buffer.from(instruction.data.slice(4, 12)).readBigUInt64LE();
        
        if (transferAmount > this.validationThresholds.highValueTransaction) {
          result.requiresAdditionalAuth = true;
        }
      }

      return result;

    } catch (error) {
      result.errors.push('System instruction validation error');
      result.isValid = false;
      return result;
    }
  }

  /**
   * Get current network status and fees
   * @returns {Object} - Network status information
   */
  async getNetworkStatus() {
    try {
      const [slot, blockhash, feeCalculator] = await Promise.all([
        this.connection.getSlot(),
        this.connection.getRecentBlockhash(),
        this.connection.getRecentBlockhash()
      ]);
      
      return {
        currentSlot: slot,
        recentBlockhash: blockhash.blockhash,
        feeCalculator: feeCalculator.feeCalculator,
        network: process.env.SOLANA_NETWORK,
        endpoint: this.connection.rpcEndpoint
      };
      
    } catch (error) {
      this.logger.error('Network status check failed', {
        error: error.message
      });
      throw new Error('Failed to get network status');
    }
  }

  /**
   * Process fixed $15 USDC Solana Pay payment
   */
  async processFixedPayment(paymentData) {
    try {
      const { 
        customerWalletAddress,
        businessId,
        paymentMethod = 'usdc' // 'usdc' or 'pizza_spl'
      } = paymentData;
      
      const Business = require('../models/Business');
      const business = await Business.findById(businessId);
      
      if (!business) {
        throw new Error('Business not found');
      }
      
      // Calculate fees based on business type
      const feeCalculation = business.calculateTransactionFees(this.fixedTransactionAmount);
      
      let finalResult;
      
      if (paymentMethod === 'pizza_spl') {
        // Atomic swap $PIZZA SPL to USDC via Jupiter
        finalResult = await this.processAtomicSwapPayment({
          customerWalletAddress,
          business,
          feeCalculation
        });
      } else {
        // Direct USDC payment
        finalResult = await this.processDirectUSDCPayment({
          customerWalletAddress,
          business,
          feeCalculation
        });
      }
      
      this.logger.info('Fixed payment processed', {
        businessId,
        paymentMethod,
        amount: this.fixedTransactionAmount,
        fees: feeCalculation,
        transactionId: finalResult.signature
      });
      
      return finalResult;
      
    } catch (error) {
      this.logger.error('Fixed payment processing failed', error);
      throw error;
    }
  }
  
  /**
   * Process atomic $PIZZA SPL to USDC swap via Jupiter DEX
   */
  async processAtomicSwapPayment(paymentData) {
    try {
      const { customerWalletAddress, business, feeCalculation } = paymentData;
      
      // Calculate $PIZZA SPL amount needed (with 0.75% loss)
      const requiredUSDC = this.fixedTransactionAmount;
      const pizzaSPLAmount = requiredUSDC / (1 - this.jupiterSwapLoss);
      
      // Get Jupiter quote for swap
      const jupiterQuote = await this.getJupiterQuote({
        inputMint: this.pizzaSPLMint.toBase58(),
        outputMint: this.usdcMint.toBase58(),
        amount: Math.ceil(pizzaSPLAmount * 1e6), // Convert to micro tokens
        slippageBps: 75 // 0.75% slippage
      });
      
      if (!jupiterQuote) {
        throw new Error('Jupiter quote failed - swap not available');
      }
      
      // Execute atomic transaction:
      // 1. Swap $PIZZA SPL to USDC
      // 2. Distribute USDC (fees + merchant payment)
      // 3. Distribute reward tokens
      const swapResult = await this.executeAtomicSwap({
        customerWalletAddress,
        businessWalletAddress: business.businessWallet?.publicKey,
        jupiterQuote,
        feeCalculation
      });
      
      return {
        signature: swapResult.signature,
        amount: this.fixedTransactionAmount,
        paymentMethod: 'pizza_spl',
        jupiterSwap: {
          inputAmount: pizzaSPLAmount,
          outputAmount: requiredUSDC,
          swapLoss: this.jupiterSwapLoss,
          route: jupiterQuote.routePlan
        },
        fees: feeCalculation,
        merchantReceived: feeCalculation.merchantAmount,
        rewardDistributed: this.fixedRewardAmount
      };
      
    } catch (error) {
      this.logger.error('Atomic swap payment failed', error);
      throw error;
    }
  }
  
  /**
   * Process direct USDC payment (no swap needed)
   */
  async processDirectUSDCPayment(paymentData) {
    try {
      const { customerWalletAddress, business, feeCalculation } = paymentData;
      
      // Execute direct USDC transfer with fee distribution
      const transferResult = await this.executeDirectTransfer({
        customerWalletAddress,
        businessWalletAddress: business.businessWallet?.publicKey,
        amount: this.fixedTransactionAmount,
        feeCalculation
      });
      
      return {
        signature: transferResult.signature,
        amount: this.fixedTransactionAmount,
        paymentMethod: 'usdc',
        fees: feeCalculation,
        merchantReceived: feeCalculation.merchantAmount,
        rewardDistributed: this.fixedRewardAmount,
        networkFee: this.solanaPayTransferFee
      };
      
    } catch (error) {
      this.logger.error('Direct USDC payment failed', error);
      throw error;
    }
  }
  
  /**
   * Distribute 0.3 $PIZZA SPL reward to customer
   */
  async distributeFixedReward(customerWalletAddress, transactionId) {
    try {
      // Create reward distribution transaction
      const rewardTx = await this.createRewardDistributionTransaction({
        recipientAddress: customerWalletAddress,
        amount: this.fixedRewardAmount,
        referenceTransactionId: transactionId
      });
      
      this.logger.info('Fixed reward distributed', {
        recipient: customerWalletAddress,
        amount: this.fixedRewardAmount,
        rewardTransactionId: rewardTx.signature
      });
      
      return {
        signature: rewardTx.signature,
        amount: this.fixedRewardAmount,
        recipient: customerWalletAddress
      };
      
    } catch (error) {
      this.logger.error('Reward distribution failed', error);
      throw error;
    }
  }
  
  /**
   * Get Jupiter DEX quote for $PIZZA SPL to USDC swap
   */
  async getJupiterQuote(quoteParams) {
    try {
      const queryParams = new URLSearchParams({
        inputMint: quoteParams.inputMint,
        outputMint: quoteParams.outputMint,
        amount: quoteParams.amount.toString(),
        slippageBps: quoteParams.slippageBps.toString()
      });
      
      const response = await fetch(`${this.jupiterQuoteAPI}?${queryParams}`);
      
      if (!response.ok) {
        throw new Error(`Jupiter quote failed: ${response.statusText}`);
      }
      
      const quote = await response.json();
      
      this.logger.info('Jupiter quote obtained', {
        inputAmount: quoteParams.amount,
        outputAmount: quote.outAmount,
        priceImpactPct: quote.priceImpactPct
      });
      
      return quote;
      
    } catch (error) {
      this.logger.error('Jupiter quote request failed', error);
      return null;
    }
  }
  
  /**
   * Execute atomic swap transaction
   */
  async executeAtomicSwap(swapData) {
    try {
      // This would implement the actual atomic swap transaction
      // For now, return mock data
      const mockSignature = 'mock_atomic_swap_' + Date.now();
      
      this.logger.info('Atomic swap executed', {
        customer: swapData.customerWalletAddress,
        business: swapData.businessWalletAddress,
        signature: mockSignature
      });
      
      return {
        signature: mockSignature,
        success: true
      };
      
    } catch (error) {
      this.logger.error('Atomic swap execution failed', error);
      throw error;
    }
  }
  
  /**
   * Execute direct USDC transfer
   */
  async executeDirectTransfer(transferData) {
    try {
      // This would implement the actual USDC transfer
      // For now, return mock data
      const mockSignature = 'mock_direct_transfer_' + Date.now();
      
      this.logger.info('Direct USDC transfer executed', {
        customer: transferData.customerWalletAddress,
        business: transferData.businessWalletAddress,
        amount: transferData.amount,
        signature: mockSignature
      });
      
      return {
        signature: mockSignature,
        success: true
      };
      
    } catch (error) {
      this.logger.error('Direct transfer execution failed', error);
      throw error;
    }
  }
  
  /**
   * Create reward distribution transaction
   */
  async createRewardDistributionTransaction(rewardData) {
    try {
      // This would implement the actual $PIZZA SPL token transfer
      // For now, return mock data
      const mockSignature = 'mock_reward_dist_' + Date.now();
      
      this.logger.info('Reward distribution transaction created', {
        recipient: rewardData.recipientAddress,
        amount: rewardData.amount,
        signature: mockSignature
      });
      
      return {
        signature: mockSignature,
        success: true
      };
      
    } catch (error) {
      this.logger.error('Reward distribution transaction failed', error);
      throw error;
    }
  }
  
  /**
   * Generate Solana Pay QR code for fixed $15 USDC payment
   */
  async generatePaymentQR(businessId, metadata = {}) {
    try {
      const Business = require('../models/Business');
      const business = await Business.findById(businessId);
      
      if (!business) {
        throw new Error('Business not found');
      }
      
      // Validate that business has linked wallet
      if (!business.businessWallet?.publicKey) {
        throw new Error('Business wallet not linked. Please connect your wallet in the dashboard settings.');
      }
      
      // Validate wallet address format
      try {
        new PublicKey(business.businessWallet.publicKey);
      } catch (error) {
        throw new Error('Invalid business wallet address format');
      }
      
      // Generate unique reference for this payment
      const reference = new PublicKey(
        `${businessId.slice(-8)}${Date.now().toString().slice(-8)}` + '0'.repeat(32 - 16)
      );
      
      // Create Solana Pay URL for USDC payment
      const solanaPayURL = encodeURL({
        recipient: new PublicKey(business.businessWallet?.publicKey),
        amount: this.fixedTransactionAmount,
        splToken: this.usdcMint,
        reference: [reference],
        label: business.businessName,
        message: `Pay $${this.fixedTransactionAmount} USDC to ${business.businessName}`,
        memo: `Fixed payment - Business: ${businessId}`
      });
      
      // Generate QR code image as base64
      const qrCodeImage = await QRCode.toDataURL(solanaPayURL.toString(), {
        type: 'image/png',
        width: 512,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
      
      this.logger.info('Payment QR generated', {
        businessId,
        amount: this.fixedTransactionAmount,
        reference: reference.toString(),
        businessName: business.businessName
      });
      
      return {
        qrCodeURL: solanaPayURL.toString(),
        qrCodeImage: qrCodeImage, // Base64 encoded PNG
        paymentReference: reference.toString(),
        amount: this.fixedTransactionAmount,
        recipient: business.businessWallet?.publicKey,
        businessName: business.businessName,
        tokenMint: this.usdcMint.toString()
      };
      
    } catch (error) {
      this.logger.error('Payment QR generation failed', {
        businessId,
        error: error.message
      });
      throw new Error('Failed to generate payment QR: ' + error.message);
    }
  }
  
  /**
   * Create Solana Pay URL for QR code
   */
  createSolanaPayURL(paymentRequest) {
    const baseURL = 'solana:';
    const params = new URLSearchParams({
      amount: paymentRequest.amount.toString(),
      'spl-token': paymentRequest.spl_token,
      reference: paymentRequest.reference,
      label: paymentRequest.label,
      message: paymentRequest.message,
      memo: paymentRequest.memo
    });
    
    return `${baseURL}${paymentRequest.recipient}?${params.toString()}`;
  }
  
  /**
   * Validate payment transaction on Solana
   */
  async validatePaymentTransaction(signature) {
    try {
      const transaction = await this.connection.getTransaction(signature, {
        commitment: 'confirmed'
      });
      
      if (!transaction) {
        return {
          valid: false,
          error: 'Transaction not found'
        };
      }
      
      if (transaction.meta.err) {
        return {
          valid: false,
          error: 'Transaction failed',
          details: transaction.meta.err
        };
      }
      
      return {
        valid: true,
        blockTime: transaction.blockTime,
        slot: transaction.slot,
        confirmations: await this.getConfirmations(signature)
      };
      
    } catch (error) {
      this.logger.error('Transaction validation failed', error);
      return {
        valid: false,
        error: error.message
      };
    }
  }
  
  /**
   * Get transaction confirmations
   */
  async getConfirmations(signature) {
    try {
      const latestSlot = await this.connection.getSlot();
      const transaction = await this.connection.getTransaction(signature);
      
      if (!transaction) return 0;
      
      return Math.max(0, latestSlot - transaction.slot);
      
    } catch (error) {
      this.logger.error('Failed to get confirmations', error);
      return 0;
    }
  }
}

module.exports = SolanaService; 