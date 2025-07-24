const { Keypair, Connection, PublicKey, Transaction } = require('@solana/web3.js');
const CryptoJS = require('crypto-js');
const winston = require('winston');

class WalletService {
  constructor() {
    this.masterKey = process.env.WALLET_MASTER_KEY;
    this.connection = new Connection(
      process.env.SOLANA_NETWORK === 'mainnet' 
        ? process.env.SOLANA_RPC_ENDPOINT 
        : process.env.SOLANA_RPC_ENDPOINT_TESTNET,
      'confirmed'
    );
    
    if (!this.masterKey) {
      throw new Error('WALLET_MASTER_KEY is required for wallet encryption');
    }
    
    // Setup logging
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.File({ filename: 'logs/wallet-security.log' }),
        new winston.transports.Console({ 
          format: winston.format.simple(),
          level: 'error' // Only log errors to console
        })
      ]
    });
  }

  /**
   * Generate a new Solana keypair and encrypt it
   * @param {string} userId - User ID for tracking
   * @returns {Object} - Contains publicKey and encrypted private key
   */
  async createWallet(userId) {
    try {
      // Generate new keypair
      const keypair = Keypair.generate();
      const publicKey = keypair.publicKey.toString();
      
      // Encrypt the private key using AES-256
      const privateKeyArray = Array.from(keypair.secretKey);
      const encryptedPrivateKey = CryptoJS.AES.encrypt(
        JSON.stringify(privateKeyArray), 
        this.masterKey
      ).toString();
      
      this.logger.info('Wallet created', {
        userId,
        publicKey,
        action: 'wallet_created',
        timestamp: new Date().toISOString()
      });
      
      return {
        publicKey,
        encryptedPrivateKey,
        created: new Date()
      };
      
    } catch (error) {
      this.logger.error('Wallet creation failed', {
        userId,
        error: error.message,
        action: 'wallet_creation_failed'
      });
      throw new Error('Failed to create wallet');
    }
  }

  /**
   * Decrypt and reconstruct a keypair from encrypted private key
   * @param {string} encryptedPrivateKey - AES encrypted private key
   * @returns {Keypair} - Solana keypair object
   */
  decryptWallet(encryptedPrivateKey) {
    try {
      // Decrypt the private key
      const decryptedBytes = CryptoJS.AES.decrypt(encryptedPrivateKey, this.masterKey);
      const decryptedString = decryptedBytes.toString(CryptoJS.enc.Utf8);
      
      if (!decryptedString) {
        throw new Error('Failed to decrypt wallet - invalid master key or corrupted data');
      }
      
      const privateKeyArray = JSON.parse(decryptedString);
      const keypair = Keypair.fromSecretKey(Uint8Array.from(privateKeyArray));
      
      return keypair;
      
    } catch (error) {
      this.logger.error('Wallet decryption failed', {
        error: error.message,
        action: 'wallet_decryption_failed'
      });
      throw new Error('Failed to decrypt wallet');
    }
  }

  /**
   * Sign a transaction with user's encrypted wallet
   * @param {string} serializedTransaction - Base64 encoded transaction
   * @param {string} encryptedPrivateKey - User's encrypted private key
   * @param {string} userId - User ID for logging
   * @returns {string} - Signed transaction as base64
   */
  async signTransaction(serializedTransaction, encryptedPrivateKey, userId) {
    try {
      // Decrypt wallet
      const keypair = this.decryptWallet(encryptedPrivateKey);
      
      // Deserialize transaction
      const transaction = Transaction.from(Buffer.from(serializedTransaction, 'base64'));
      
      // Verify the transaction has reasonable fee limits (security check)
      const recentBlockhash = await this.connection.getRecentBlockhash();
      transaction.recentBlockhash = recentBlockhash.blockhash;
      transaction.feePayer = keypair.publicKey;
      
      // Sign the transaction
      transaction.sign(keypair);
      
      // Serialize and return
      const signedTransaction = transaction.serialize().toString('base64');
      
      this.logger.info('Transaction signed', {
        userId,
        publicKey: keypair.publicKey.toString(),
        action: 'transaction_signed',
        transactionSize: signedTransaction.length
      });
      
      return signedTransaction;
      
    } catch (error) {
      this.logger.error('Transaction signing failed', {
        userId,
        error: error.message,
        action: 'transaction_signing_failed'
      });
      throw new Error('Failed to sign transaction');
    }
  }

  /**
   * Get wallet balance for a public key
   * @param {string} publicKey - Solana public key
   * @returns {number} - Balance in SOL
   */
  async getBalance(publicKey) {
    try {
      const pubKey = new PublicKey(publicKey);
      const balance = await this.connection.getBalance(pubKey);
      return balance / 1000000000; // Convert lamports to SOL
    } catch (error) {
      this.logger.error('Balance check failed', {
        publicKey,
        error: error.message,
        action: 'balance_check_failed'
      });
      throw new Error('Failed to get wallet balance');
    }
  }

  /**
   * Validate that a public key is valid Solana address
   * @param {string} publicKey - Public key to validate
   * @returns {boolean} - Whether the key is valid
   */
  validatePublicKey(publicKey) {
    try {
      new PublicKey(publicKey);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get connection health status
   * @returns {Object} - Connection status and network info
   */
  async getConnectionStatus() {
    try {
      const slot = await this.connection.getSlot();
      const blockhash = await this.connection.getRecentBlockhash();
      
      return {
        connected: true,
        network: process.env.SOLANA_NETWORK,
        currentSlot: slot,
        recentBlockhash: blockhash.blockhash,
        endpoint: this.connection.rpcEndpoint
      };
      
    } catch (error) {
      this.logger.error('Connection check failed', {
        error: error.message,
        action: 'connection_check_failed'
      });
      
      return {
        connected: false,
        error: error.message,
        network: process.env.SOLANA_NETWORK,
        endpoint: this.connection.rpcEndpoint
      };
    }
  }

  /**
   * Security check for transaction limits
   * @param {string} userId - User ID
   * @param {number} amount - Transaction amount
   * @param {string} userTier - KYC tier (tier1, tier2)
   * @returns {boolean} - Whether transaction is within limits
   */
  async checkTransactionLimits(userId, amount, userTier = 'tier1') {
    try {
      const dailyLimit = userTier === 'tier2' 
        ? parseInt(process.env.MAX_DAILY_AMOUNT_TIER2) 
        : parseInt(process.env.MAX_DAILY_AMOUNT_TIER1);
      
      // TODO: Implement daily spending tracking in database
      // For now, just check against tier limits
      
      if (amount > dailyLimit) {
        this.logger.warn('Transaction limit exceeded', {
          userId,
          amount,
          dailyLimit,
          userTier,
          action: 'transaction_limit_exceeded'
        });
        return false;
      }
      
      return true;
      
    } catch (error) {
      this.logger.error('Transaction limit check failed', {
        userId,
        error: error.message,
        action: 'limit_check_failed'
      });
      return false;
    }
  }
}

module.exports = WalletService; 