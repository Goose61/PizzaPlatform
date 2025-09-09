/**
 * Solana Pay Service - Official Solana Pay Implementation
 * 
 * Based on Solana Pay specification: https://docs.solanapay.com/spec
 * Core API: https://docs.solanapay.com/api/core
 * Transaction Request: https://docs.solanapay.com/core/transaction-request/overview
 * Merchant Integration: https://docs.solanapay.com/core/transaction-request/merchant-integration
 */

const { 
  Connection, 
  PublicKey, 
  Transaction, 
  SystemProgram,
  LAMPORTS_PER_SOL 
} = require('@solana/web3.js');
const { 
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createTransferInstruction,
  getMint
} = require('@solana/spl-token');
const { 
  encodeURL, 
  parseURL,
  validateTransfer,
  findReference
} = require('@solana/pay');
const BigNumber = require('bignumber.js');
const crypto = require('crypto');

class SolanaPayService {
  constructor() {
    this.connection = new Connection(
      process.env.SOLANA_RPC_ENDPOINT || 'https://api.devnet.solana.com',
      'confirmed'
    );
    
    // Check if we're on devnet or mainnet
    const isDevnet = this.connection.rpcEndpoint.includes('devnet');
    
    // USDC mint addresses (official)
    this.usdcMint = new PublicKey(isDevnet ? 
      '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU' : // USDC devnet
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'   // USDC mainnet
    );
    
    // Platform configuration
    this.platformFeeRate = 0.01; // 1% platform fee
    this.vaultFeeRate = 0.013;   // 1.3% vault contribution
    this.fixedAmount = 15;       // $15 USDC fixed payment
    
    // Merchant wallet (business receives payments here)
    this.merchantWallet = process.env.MERCHANT_WALLET_ADDRESS ? 
      new PublicKey(process.env.MERCHANT_WALLET_ADDRESS) : null;
    
    // Platform fee wallet
    this.platformWallet = process.env.PLATFORM_FEE_WALLET ? 
      new PublicKey(process.env.PLATFORM_FEE_WALLET) : null;
    
    // Vault wallet
    this.vaultWallet = process.env.PLATFORM_VAULT_ADDRESS ? 
      new PublicKey(process.env.PLATFORM_VAULT_ADDRESS) : null;
  }

  /**
   * Create a Solana Pay payment request URL
   * Following Solana Pay Transfer Request specification
   * @param {Object} params - Payment parameters
   * @returns {Object} - Payment URL and QR code data
   */
  async createPaymentRequest({
    recipient,
    amount,
    splToken = null,
    reference,
    label = 'Pizza Platform Payment',
    message = 'Pizza payment via Solana Pay',
    memo
  }) {
    try {
      // Validate recipient address
      const recipientPublicKey = new PublicKey(recipient);
      
      // Create reference if not provided
      const paymentReference = reference || crypto.randomBytes(32);
      const referencePublicKey = new PublicKey(paymentReference);
      
      // Create payment URL params
      const urlParams = {
        recipient: recipientPublicKey,
        amount: new BigNumber(amount),
        reference: referencePublicKey,
        label,
        message
      };
      
      // Add SPL token if specified (for USDC payments)
      if (splToken) {
        urlParams.splToken = new PublicKey(splToken);
      }
      
      // Add memo if provided
      if (memo) {
        urlParams.memo = memo;
      }
      
      // Encode URL according to Solana Pay spec
      const paymentURL = encodeURL(urlParams);
      
      // Return just the URL - QR generation will be done on frontend
      return {
        success: true,
        paymentURL: paymentURL.toString(),
        reference: paymentReference.toString('hex'),
        referencePublicKey: referencePublicKey.toString(),
        amount,
        recipient: recipient,
        splToken: splToken,
        label,
        message,
        memo
      };
      
    } catch (error) {
      console.error('Error creating payment request:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create a Pizza Platform payment QR code
   * Fixed $15 USDC with automatic fee distribution
   * @param {Object} params - Business payment parameters
   * @returns {Object} - Payment QR data
   */
  async createPizzaPaymentQR({
    businessWallet,
    businessName = 'Pizza Business',
    memo = null,
    reference = null
  }) {
    try {
      // Generate unique reference for this payment
      const paymentReference = reference || crypto.randomBytes(32);
      
      // Calculate amounts
      const totalAmount = this.fixedAmount; // $15 USDC
      const platformFee = totalAmount * this.platformFeeRate; // $0.15
      const vaultFee = totalAmount * this.vaultFeeRate; // $0.195
      const businessAmount = totalAmount - platformFee - vaultFee; // $14.655
      
      // Create payment request (returns URL only)
      const paymentRequest = await this.createPaymentRequest({
        recipient: businessWallet,
        amount: totalAmount,
        splToken: this.usdcMint.toString(),
        reference: paymentReference,
        label: `${businessName} - Pizza Payment`,
        message: `Pay $${totalAmount} USDC for pizza at ${businessName}`,
        memo: memo || `Pizza payment - ${businessName}`
      });
      
      if (!paymentRequest.success) {
        throw new Error(paymentRequest.error || 'Failed to create payment request');
      }
      
      return {
        success: true,
        paymentUrl: paymentRequest.paymentURL,
        reference: paymentRequest.reference,
        amounts: {
          total: totalAmount,
          business: businessAmount,
          platformFee: platformFee,
          vaultFee: vaultFee
        },
        memo: paymentRequest.memo,
        businessWallet,
        businessName
      };
      
    } catch (error) {
      console.error('Error creating Pizza payment QR:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Validate and process a completed payment transaction
   * @param {string} signature - Transaction signature
   * @param {string} reference - Payment reference
   * @returns {Object} - Validation result
   */
  async validatePayment(signature, reference) {
    try {
      const referencePublicKey = new PublicKey(reference);
      
      // Find transaction by reference
      const found = await findReference(this.connection, referencePublicKey, {
        finality: 'confirmed'
      });
      
      if (!found.signature) {
        return {
          success: false,
          error: 'Payment transaction not found'
        };
      }
      
      // Validate the transfer
      const validation = await validateTransfer(
        this.connection,
        found.signature,
        {
          recipient: this.merchantWallet,
          amount: new BigNumber(this.fixedAmount),
          splToken: this.usdcMint,
          reference: referencePublicKey
        }
      );
      
      return {
        success: true,
        signature: found.signature,
        validated: true,
        blockTime: found.blockTime,
        slot: found.slot
      };
      
    } catch (error) {
      console.error('Error validating payment:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create a transaction request endpoint response
   * Following Solana Pay Transaction Request specification
   * @param {Object} params - Transaction parameters
   * @returns {Object} - Transaction response
   */
  async createTransactionRequest({
    account,
    reference,
    businessWallet,
    amount = 15
  }) {
    try {
      const accountPublicKey = new PublicKey(account);
      const referencePublicKey = new PublicKey(reference);
      const businessPublicKey = new PublicKey(businessWallet);
      
      // Create transaction
      const transaction = new Transaction();
      
      // Get associated token accounts
      const senderTokenAccount = await getAssociatedTokenAddress(
        this.usdcMint,
        accountPublicKey
      );
      
      const recipientTokenAccount = await getAssociatedTokenAddress(
        this.usdcMint,
        businessPublicKey
      );
      
      // Convert amount to token units (USDC has 6 decimals)
      const tokenAmount = Math.floor(amount * Math.pow(10, 6));
      
      // Add transfer instruction
      transaction.add(
        createTransferInstruction(
          senderTokenAccount,
          recipientTokenAccount,
          accountPublicKey,
          tokenAmount,
          [],
          TOKEN_PROGRAM_ID
        )
      );
      
      // Add reference as a read-only account
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: referencePublicKey,
          toPubkey: referencePublicKey,
          lamports: 0
        })
      );
      
      // Set recent blockhash and fee payer
      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = accountPublicKey;
      
      // Serialize transaction
      const serializedTransaction = transaction.serialize({
        requireAllSignatures: false
      });
      
      return {
        success: true,
        transaction: serializedTransaction.toString('base64'),
        message: `Transfer $${amount} USDC to ${businessWallet}`
      };
      
    } catch (error) {
      console.error('Error creating transaction request:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get payment status by reference
   * @param {string} reference - Payment reference
   * @returns {Object} - Payment status
   */
  async getPaymentStatus(reference) {
    try {
      const referencePublicKey = new PublicKey(reference);
      
      // Find transaction by reference
      const found = await findReference(this.connection, referencePublicKey, {
        finality: 'confirmed'
      });
      
      if (found.signature) {
        return {
          success: true,
          status: 'completed',
          signature: found.signature,
          blockTime: found.blockTime,
          slot: found.slot
        };
      } else {
        return {
          success: true,
          status: 'pending'
        };
      }
      
    } catch (error) {
      console.error('Error checking payment status:', error);
      return {
        success: false,
        error: error.message,
        status: 'error'
      };
    }
  }

  /**
   * Parse a Solana Pay URL
   * @param {string} url - Solana Pay URL
   * @returns {Object} - Parsed URL data
   */
  parsePaymentURL(url) {
    try {
      const parsed = parseURL(url);
      return {
        success: true,
        data: {
          recipient: parsed.recipient?.toString(),
          amount: parsed.amount?.toString(),
          splToken: parsed.splToken?.toString(),
          reference: parsed.reference?.toString(),
          label: parsed.label,
          message: parsed.message,
          memo: parsed.memo
        }
      };
    } catch (error) {
      console.error('Error parsing payment URL:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = SolanaPayService;