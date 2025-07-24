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

class SolanaService {
  constructor() {
    this.connection = new Connection(
      process.env.SOLANA_NETWORK === 'mainnet' 
        ? process.env.SOLANA_RPC_ENDPOINT 
        : process.env.SOLANA_RPC_ENDPOINT_TESTNET,
      'confirmed'
    );
    
    // Token addresses from environment
    this.splTokenMint = new PublicKey(process.env.SPL_TOKEN_MINT);
    this.pizzaTokenMint = new PublicKey(process.env.PIZZA_TOKEN_MINT);
    
    // Jupiter configuration
    this.jupiterQuoteAPI = process.env.JUPITER_QUOTE_API;
    this.jupiterSwapAPI = process.env.JUPITER_SWAP_API;
    
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
   * Get Jupiter swap quote (PLACEHOLDER - Jupiter package not installed)
   * @param {string} inputMint - Input token mint
   * @param {string} outputMint - Output token mint
   * @param {number} amount - Input amount
   * @returns {Object} - Swap quote information
   */
  async getSwapQuote(inputMint, outputMint, amount) {
    // TODO: Implement Jupiter integration
    throw new Error('Jupiter swap functionality not yet implemented');
    
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
   * Create Jupiter swap transaction (PLACEHOLDER - Jupiter package not installed)
   * @param {Object} quote - Quote from getSwapQuote
   * @param {string} userPublicKey - User's wallet address
   * @returns {Transaction} - Unsigned swap transaction
   */
  async createSwapTransaction(quote, userPublicKey) {
    // TODO: Implement Jupiter integration
    throw new Error('Jupiter swap functionality not yet implemented');
    
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

  /**
   * Create QR payment transaction
   * @param {string} merchantWallet - Merchant's wallet address
   * @param {string} customerWallet - Customer's wallet address
   * @param {number} amount - Payment amount in SPL tokens
   * @param {string} reference - Unique payment reference
   * @returns {Transaction} - Unsigned payment transaction
   */
  async createQRPayment(merchantWallet, customerWallet, amount, reference) {
    try {
      // Create token transfer to merchant
      const transaction = await this.createTokenTransfer(
        customerWallet,
        merchantWallet,
        amount
      );
      
      // Add memo instruction with payment reference
      const memoInstruction = new TransactionInstruction({
        keys: [],
        programId: new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
        data: Buffer.from(reference, 'utf8')
      });
      transaction.add(memoInstruction);
      
      this.logger.info('QR payment transaction created', {
        merchantWallet,
        customerWallet,
        amount,
        reference
      });
      
      return transaction;
      
    } catch (error) {
      this.logger.error('QR payment creation failed', {
        merchantWallet,
        customerWallet,
        amount,
        reference,
        error: error.message
      });
      throw new Error('Failed to create QR payment');
    }
  }

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
}

module.exports = SolanaService; 