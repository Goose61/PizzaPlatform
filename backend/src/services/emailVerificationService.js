const { VerifaliaRestClient } = require('verifalia');
const crypto = require('crypto');

/**
 * Email Verification Service using Verifalia
 * Handles real-time email validation and verification workflows
 */
class EmailVerificationService {
  constructor() {
    this.client = null;
    this.isConfigured = false;
    this.initialize();
  }

  /**
   * Initialize Verifalia client with credentials
   */
  initialize() {
    try {
      const username = process.env.VERIFALIA_SUB_ACCOUNT_SID; // Using your username from config
      const password = process.env.VERIFALIA_AUTH_TOKEN; // Using your password from config

      if (!username || !password) {
        console.warn('⚠️ Verifalia credentials not configured - email verification disabled');
        return;
      }

      if (username === 'your-sub-account-sid-here' || password === 'your-auth-token-here') {
        console.warn('⚠️ Verifalia credentials are placeholder values - please update config.env');
        return;
      }

      // Use HTTP Basic Authentication with username/password
      this.client = new VerifaliaRestClient({
        username: username,
        password: password
      });

      this.isConfigured = true;
      console.log('✅ Verifalia email verification service initialized with user account');
    } catch (error) {
      console.error('❌ Failed to initialize Verifalia client:', error);
      this.isConfigured = false;
    }
  }

  /**
   * Verify a single email address in real-time
   * @param {string} email - Email address to verify
   * @param {Object} options - Verification options
   * @returns {Promise<Object>} Verification result
   */
  async verifyEmail(email, options = {}) {
    if (!this.isConfigured) {
      console.warn('📧 Email verification skipped - Verifalia not configured');
      // Return valid result to allow registration to continue
      return {
        email,
        isValid: true, // Allow in development
        isRisky: false,
        status: 'skipped',
        classification: 'Deliverable',
        subClassification: 'MailboxExists',
        reason: 'service_not_configured',
        suggestions: [],
        timestamp: new Date()
      };
    }

    try {
      console.log(`📧 Verifying email with Verifalia: ${email}`);

      // Submit email for verification
      const validation = await this.client.emailValidations.submit({
        entries: [
          {
            inputData: email
          }
        ],
        // Optional: Add completion callback for async processing
        ...(options.callbackUrl && {
          callback: {
            url: options.callbackUrl
          }
        })
      });

      // Wait for completion (Verifalia handles this automatically)
      const result = validation.entries[0];

      // Parse Verifalia result
      const verificationResult = {
        email: result.inputData,
        isValid: this.isEmailValid(result.classification),
        isRisky: this.isEmailRisky(result.classification),
        status: result.status,
        classification: result.classification,
        subClassification: result.subClassification,
        suggestions: result.suggestions || [],
        timestamp: new Date(),
        verifaliaJobId: validation.id,
        processingTime: validation.submittedOn ? 
          new Date() - new Date(validation.submittedOn) : null
      };

      console.log(`✅ Email verification completed: ${email} - ${result.classification}`);
      return verificationResult;

    } catch (error) {
      console.error('❌ Verifalia email verification failed:', error);
      
      // Return error result but don't block registration
      return {
        email,
        isValid: true, // Allow registration to continue
        status: 'error',
        reason: error.message,
        classification: 'unknown',
        timestamp: new Date(),
        error: true
      };
    }
  }

  /**
   * Verify multiple email addresses in batch
   * @param {Array<string>} emails - Array of email addresses
   * @param {Object} options - Verification options
   * @returns {Promise<Array<Object>>} Array of verification results
   */
  async verifyEmailsBatch(emails, options = {}) {
    if (!this.isConfigured) {
      console.warn('📧 Batch email verification skipped - Verifalia not configured');
      return emails.map(email => ({
        email,
        isValid: true,
        status: 'skipped',
        reason: 'service_not_configured',
        timestamp: new Date()
      }));
    }

    try {
      console.log(`📧 Verifying ${emails.length} emails in batch with Verifalia`);

      const entries = emails.map(email => ({ inputData: email }));
      
      const validation = await this.client.emailValidations.submit({
        entries,
        ...(options.callbackUrl && {
          callback: {
            url: options.callbackUrl
          }
        })
      });

      // Process results
      const results = validation.entries.map(result => ({
        email: result.inputData,
        isValid: this.isEmailValid(result.classification),
        isRisky: this.isEmailRisky(result.classification),
        status: result.status,
        classification: result.classification,
        subClassification: result.subClassification,
        suggestions: result.suggestions || [],
        timestamp: new Date(),
        verifaliaJobId: validation.id
      }));

      console.log(`✅ Batch email verification completed: ${results.length} emails processed`);
      return results;

    } catch (error) {
      console.error('❌ Verifalia batch verification failed:', error);
      
      // Return error results but don't block processing
      return emails.map(email => ({
        email,
        isValid: true,
        status: 'error',
        reason: error.message,
        timestamp: new Date(),
        error: true
      }));
    }
  }

  /**
   * Generate secure email verification token for user registration
   * @param {string} email - Email address
   * @param {string} userId - User ID
   * @returns {Object} Verification token data
   */
  generateVerificationToken(email, userId) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    
    return {
      token,
      email,
      userId,
      expiresAt,
      createdAt: new Date(),
      isUsed: false
    };
  }

  /**
   * Validate email verification token
   * @param {string} token - Verification token
   * @param {Object} storedTokenData - Stored token data from database
   * @returns {Object} Validation result
   */
  validateVerificationToken(token, storedTokenData) {
    if (!storedTokenData) {
      return {
        isValid: false,
        reason: 'token_not_found'
      };
    }

    if (storedTokenData.isUsed) {
      return {
        isValid: false,
        reason: 'token_already_used'
      };
    }

    if (new Date() > new Date(storedTokenData.expiresAt)) {
      return {
        isValid: false,
        reason: 'token_expired'
      };
    }

    if (storedTokenData.token !== token) {
      return {
        isValid: false,
        reason: 'token_mismatch'
      };
    }

    return {
      isValid: true,
      email: storedTokenData.email,
      userId: storedTokenData.userId
    };
  }

  /**
   * Check if email classification indicates valid email
   * @param {string} classification - Verifalia classification
   * @returns {boolean} Is email valid
   */
  isEmailValid(classification) {
    const validClassifications = [
      'Deliverable',
      'Risky'
    ];
    return validClassifications.includes(classification);
  }

  /**
   * Check if email classification indicates risky email
   * @param {string} classification - Verifalia classification
   * @returns {boolean} Is email risky
   */
  isEmailRisky(classification) {
    const riskyClassifications = [
      'Risky'
    ];
    return riskyClassifications.includes(classification);
  }

  /**
   * Get email verification statistics and credits
   * @returns {Promise<Object>} Usage statistics
   */
  async getVerificationStats() {
    if (!this.isConfigured) {
      return {
        isConfigured: false,
        credits: null,
        usage: null
      };
    }

    try {
      const balance = await this.client.credits.getBalance();
      
      return {
        isConfigured: true,
        credits: {
          creditPacks: balance.creditPacks,
          freeCredits: balance.freeCredits,
          freeCreditsResetIn: balance.freeCreditsResetIn
        },
        rateLimit: {
          requestsPerSecond: 18,
          burstLimit: 45
        }
      };
    } catch (error) {
      console.error('❌ Failed to get Verifalia stats:', error);
      return {
        isConfigured: true,
        credits: null,
        usage: null,
        error: error.message
      };
    }
  }

  /**
   * Sanitize email for logging (privacy-conscious)
   * @param {string} email - Email address
   * @returns {string} Sanitized email for logs
   */
  sanitizeEmailForLogging(email) {
    if (!email || !email.includes('@')) return 'invalid-email';
    
    const [local, domain] = email.split('@');
    const sanitizedLocal = local.length > 2 ? 
      local.substring(0, 2) + '*'.repeat(local.length - 2) : 
      local;
    
    return `${sanitizedLocal}@${domain}`;
  }

  /**
   * Health check for the service
   * @returns {Object} Health status
   */
  healthCheck() {
    return {
      service: 'EmailVerificationService',
      status: this.isConfigured ? 'healthy' : 'misconfigured',
      provider: 'Verifalia',
      timestamp: new Date(),
      features: {
        realTimeVerification: this.isConfigured,
        batchVerification: this.isConfigured,
        tokenGeneration: true,
        statsRetrieval: this.isConfigured
      }
    };
  }
}

module.exports = EmailVerificationService;
