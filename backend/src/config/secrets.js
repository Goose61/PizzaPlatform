const crypto = require('crypto');

class SecretManager {
  constructor() {
    this.secrets = null;
    this.requiredSecrets = [
      'MONGODB_URI', // Fixed: Align with backend.js
      'EMAIL_PASS', 
      'JWT_SECRET',
      'ADMIN_JWT_SECRET'
    ];
    
    this.optionalSecrets = [
      'RECAPTCHA_SECRET_KEY',
      'RECAPTCHA_SITE_KEY',
      'KYC_WEBHOOK_SECRET' // Added for webhook signature verification
    ];
  }

  async initialize() {
    if (this.secrets) return this.secrets;
    
    if (process.env.NODE_ENV === 'production') {
      this.secrets = await this.loadFromCloud();
    } else {
      this.secrets = this.loadFromEnv();
    }
    
    this.validateSecrets();
    return this.secrets;
  }

  loadFromEnv() {
    console.log('Loading secrets from environment variables...');
    
    // Check for missing required secrets
    const missing = this.requiredSecrets.filter(key => !process.env[key]);
    if (missing.length > 0) {
      console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
      console.error('Please check your .env file and ensure all required variables are set.');
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    return {
      mongoUri: process.env.MONGODB_URI,
      emailPass: process.env.EMAIL_PASS,
      recaptchaSecret: process.env.RECAPTCHA_SECRET_KEY || null,
      recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY || null,
      jwtSecret: process.env.JWT_SECRET,
      adminJwtSecret: process.env.ADMIN_JWT_SECRET,
      kycWebhookSecret: process.env.KYC_WEBHOOK_SECRET || null,
      port: process.env.PORT || 3001,
      nodeEnv: process.env.NODE_ENV || 'development'
    };
  }

  async loadFromCloud() {
    // AWS Secrets Manager implementation
    try {
      const AWS = require('aws-sdk');
      const client = new AWS.SecretsManager({
        region: process.env.AWS_REGION || 'us-east-1'
      });
      
      const result = await client.getSecretValue({
        SecretId: process.env.SECRET_NAME || 'pizza-platform-secrets'
      }).promise();
      
      console.log('✅ Secrets loaded from AWS Secrets Manager');
      return JSON.parse(result.SecretString);
    } catch (error) {
      console.error('❌ Failed to load secrets from cloud:', error.message);
      
      // Fallback to environment variables in production
      console.log('Falling back to environment variables...');
      return this.loadFromEnv();
    }
  }

  validateSecrets() {
    if (!this.secrets) {
      throw new Error('Secrets not loaded');
    }

    // Validate JWT secrets are sufficiently random
    if (this.secrets.jwtSecret.length < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters long');
    }
    
    if (this.secrets.adminJwtSecret.length < 32) {
      throw new Error('ADMIN_JWT_SECRET must be at least 32 characters long');
    }

    // Validate MongoDB URI format
    if (!this.secrets.mongoUri.startsWith('mongodb')) {
      throw new Error('Invalid MongoDB URI format');
    }

    console.log('✅ All secrets validated successfully');
  }

  // Generate cryptographically secure secrets for development
  generateSecureSecret(length = 64) {
    return crypto.randomBytes(length).toString('hex');
  }

  // Get individual secret with error handling
  get(key) {
    if (!this.secrets) {
      throw new Error('Secrets not initialized. Call initialize() first.');
    }
    
    if (!(key in this.secrets)) {
      throw new Error(`Secret '${key}' not found`);
    }
    
    return this.secrets[key];
  }

  // Check if running in production
  isProduction() {
    return process.env.NODE_ENV === 'production';
  }

  // Rotate secrets (for production use)
  async rotateSecret(secretName, newValue) {
    if (!this.isProduction()) {
      throw new Error('Secret rotation only available in production');
    }
    
    // Implementation would depend on your cloud provider
    console.log(`Rotating secret: ${secretName}`);
    // AWS Secrets Manager rotation logic here
  }
}

// Export singleton instance
module.exports = new SecretManager(); 