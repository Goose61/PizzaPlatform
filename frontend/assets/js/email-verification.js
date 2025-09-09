/**
 * Email Verification Utility
 * Real-time email validation using Verifalia integration
 */

class EmailVerification {
  constructor(options = {}) {
    // Use dynamic API configuration if available
    this.apiBase = options.apiBase || window.API_BASE || 'http://localhost:7000';
    if (!this.apiBase.includes('/api')) {
      this.apiBase += '/api';
    }
    this.recaptchaSiteKey = null;
    this.isVerifying = false;
    this.cache = new Map(); // Cache verification results
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
    
    // Load reCAPTCHA configuration
    this.loadRecaptchaConfig();
  }

  /**
   * Load reCAPTCHA site key from backend
   */
  async loadRecaptchaConfig() {
    try {
      const response = await fetch(`${this.apiBase}/config/recaptcha`);
      if (response.ok) {
        const config = await response.json();
        this.recaptchaSiteKey = config.siteKey;
        console.log('✅ reCAPTCHA configuration loaded for email verification');
      } else {
        console.warn('⚠️ Could not load reCAPTCHA configuration');
      }
    } catch (error) {
      console.error('❌ Error loading reCAPTCHA config:', error);
    }
  }

  /**
   * Verify email address in real-time
   * @param {string} email - Email address to verify
   * @param {Object} options - Verification options
   * @returns {Promise<Object>} Verification result
   */
  async verifyEmail(email, options = {}) {
    if (!email || !this.isValidEmailFormat(email)) {
      return {
        success: false,
        isValid: false,
        error: 'Invalid email format',
        timestamp: new Date()
      };
    }

    // Check cache first
    const cacheKey = email.toLowerCase();
    const cached = this.getFromCache(cacheKey);
    if (cached && !options.forceRefresh) {
      console.log('📧 Using cached email verification result');
      return cached;
    }

    if (this.isVerifying) {
      return {
        success: false,
        isValid: true, // Don't block user
        status: 'rate_limited',
        message: 'Please wait, verification in progress...',
        timestamp: new Date()
      };
    }

    this.isVerifying = true;

    try {
      // Generate reCAPTCHA token
      let recaptchaToken = null;
      if (this.recaptchaSiteKey && typeof grecaptcha !== 'undefined') {
        try {
          recaptchaToken = await grecaptcha.enterprise.execute(this.recaptchaSiteKey, {
            action: 'EMAIL_VERIFY'
          });
        } catch (recaptchaError) {
          console.warn('⚠️ reCAPTCHA failed for email verification:', recaptchaError);
          // Continue without reCAPTCHA
        }
      }

      // Call verification API
      const response = await fetch(`${this.apiBase}/email/verify-address`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: email,
          recaptchaToken: recaptchaToken
        })
      });

      const result = await response.json();

      if (response.ok) {
        // Cache successful result
        this.setCache(cacheKey, result);
        
        console.log(`📧 Email verification result: ${email} - ${result.classification || 'unknown'}`);
        return result;
      } else {
        console.warn('❌ Email verification API error:', result.error);
        return {
          success: false,
          isValid: true, // Don't block user on API error
          error: result.error,
          timestamp: new Date()
        };
      }

    } catch (error) {
      console.error('❌ Email verification error:', error);
      return {
        success: false,
        isValid: true, // Don't block user on network error
        error: 'Verification service unavailable',
        timestamp: new Date()
      };
    } finally {
      this.isVerifying = false;
    }
  }

  /**
   * Validate email format using regex
   * @param {string} email - Email address
   * @returns {boolean} Is valid format
   */
  isValidEmailFormat(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Get verification result from cache
   * @param {string} key - Cache key
   * @returns {Object|null} Cached result or null
   */
  getFromCache(key) {
    const cached = this.cache.get(key);
    if (!cached) return null;

    // Check if cache entry has expired
    if (Date.now() - cached.timestamp > this.cacheExpiry) {
      this.cache.delete(key);
      return null;
    }

    return cached.result;
  }

  /**
   * Set verification result in cache
   * @param {string} key - Cache key
   * @param {Object} result - Verification result
   */
  setCache(key, result) {
    this.cache.set(key, {
      result: result,
      timestamp: Date.now()
    });
  }

  /**
   * Clear verification cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Send email verification link
   * @param {string} email - Email address
   * @param {string} userId - User ID (optional)
   * @returns {Promise<Object>} Send result
   */
  async sendVerificationEmail(email, userId = null) {
    try {
      const response = await fetch(`${this.apiBase}/email/send-verification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: email,
          userId: userId
        })
      });

      const result = await response.json();

      if (response.ok) {
        console.log('📧 Verification email sent successfully');
        return result;
      } else {
        console.warn('❌ Failed to send verification email:', result.error);
        return {
          success: false,
          error: result.error
        };
      }

    } catch (error) {
      console.error('❌ Send verification email error:', error);
      return {
        success: false,
        error: 'Failed to send verification email'
      };
    }
  }

  /**
   * Check email verification status
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Verification status
   */
  async checkVerificationStatus(userId) {
    try {
      const response = await fetch(`${this.apiBase}/email/verification-status/${userId}`);
      const result = await response.json();

      if (response.ok) {
        return result;
      } else {
        console.warn('❌ Failed to check verification status:', result.error);
        return {
          success: false,
          error: result.error
        };
      }

    } catch (error) {
      console.error('❌ Check verification status error:', error);
      return {
        success: false,
        error: 'Failed to check verification status'
      };
    }
  }
}

/**
 * Email Input Validator
 * UI component for real-time email validation
 */
class EmailInputValidator {
  constructor(inputElement, options = {}) {
    this.input = inputElement;
    this.options = {
      showSuggestions: true,
      validateOnBlur: true,
      validateOnType: false,
      debounceDelay: 500,
      ...options
    };
    
    this.emailVerification = new EmailVerification();
    this.debounceTimer = null;
    this.validationContainer = null;
    
    this.init();
  }

  /**
   * Initialize validator
   */
  init() {
    if (!this.input) {
      console.error('❌ Email input element not found');
      return;
    }

    // Create validation container
    this.createValidationContainer();

    // Add event listeners
    if (this.options.validateOnBlur) {
      this.input.addEventListener('blur', () => this.validateEmail());
    }

    if (this.options.validateOnType) {
      this.input.addEventListener('input', () => this.debouncedValidate());
    }

    // Add custom validation method to input
    this.input.validateEmail = () => this.validateEmail();
    this.input.getValidationResult = () => this.lastValidationResult;
  }

  /**
   * Create validation feedback container
   */
  createValidationContainer() {
    // Check if container already exists
    let container = this.input.parentNode.querySelector('.email-validation-feedback');
    
    if (!container) {
      container = document.createElement('div');
      container.className = 'email-validation-feedback';
      container.style.marginTop = '5px';
      container.style.fontSize = '14px';
      
      // Insert after input
      this.input.parentNode.insertBefore(container, this.input.nextSibling);
    }
    
    this.validationContainer = container;
  }

  /**
   * Debounced validation for typing
   */
  debouncedValidate() {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.validateEmail();
    }, this.options.debounceDelay);
  }

  /**
   * Validate email address
   * @returns {Promise<Object>} Validation result
   */
  async validateEmail() {
    const email = this.input.value.trim();
    
    if (!email) {
      this.clearValidation();
      return { success: true, isValid: true };
    }

    // Show loading state
    this.showLoading();

    try {
      const result = await this.emailVerification.verifyEmail(email);
      this.lastValidationResult = result;
      
      // Update UI based on result
      this.updateValidationUI(result);
      
      return result;
    } catch (error) {
      console.error('❌ Email validation error:', error);
      this.showError('Validation service unavailable');
      return { success: false, isValid: true, error: error.message };
    }
  }

  /**
   * Update validation UI
   * @param {Object} result - Validation result
   */
  updateValidationUI(result) {
    if (!this.validationContainer) return;

    // Clear previous state
    this.clearValidation();

    if (result.success && result.isValid) {
      if (result.isRisky) {
        this.showWarning('Email appears risky - please double-check', result.suggestions);
      } else {
        this.showSuccess('Email verified ✓');
      }
    } else if (result.success && !result.isValid) {
      this.showError('Email appears invalid', result.suggestions);
    } else if (!result.success && result.error) {
      this.showWarning(`Verification failed: ${result.error}`);
    }
  }

  /**
   * Show loading state
   */
  showLoading() {
    if (!this.validationContainer) return;
    
    this.validationContainer.innerHTML = `
      <div style="color: #6c757d;">
        <i class="fas fa-spinner fa-spin"></i> Verifying email...
      </div>
    `;
  }

  /**
   * Show success message
   * @param {string} message - Success message
   */
  showSuccess(message) {
    if (!this.validationContainer) return;
    
    this.validationContainer.innerHTML = `
      <div style="color: #28a745;">
        <i class="fas fa-check-circle"></i> ${message}
      </div>
    `;
  }

  /**
   * Show warning message
   * @param {string} message - Warning message
   * @param {Array} suggestions - Email suggestions
   */
  showWarning(message, suggestions = []) {
    if (!this.validationContainer) return;
    
    let html = `
      <div style="color: #ffc107;">
        <i class="fas fa-exclamation-triangle"></i> ${message}
      </div>
    `;
    
    if (suggestions && suggestions.length > 0 && this.options.showSuggestions) {
      html += `
        <div style="margin-top: 5px; font-size: 12px;">
          <strong>Suggestions:</strong> ${suggestions.join(', ')}
        </div>
      `;
    }
    
    this.validationContainer.innerHTML = html;
  }

  /**
   * Show error message
   * @param {string} message - Error message
   * @param {Array} suggestions - Email suggestions
   */
  showError(message, suggestions = []) {
    if (!this.validationContainer) return;
    
    let html = `
      <div style="color: #dc3545;">
        <i class="fas fa-times-circle"></i> ${message}
      </div>
    `;
    
    if (suggestions && suggestions.length > 0 && this.options.showSuggestions) {
      html += `
        <div style="margin-top: 5px; font-size: 12px;">
          <strong>Did you mean:</strong> ${suggestions.join(', ')}
        </div>
      `;
    }
    
    this.validationContainer.innerHTML = html;
  }

  /**
   * Clear validation state
   */
  clearValidation() {
    if (this.validationContainer) {
      this.validationContainer.innerHTML = '';
    }
  }

  /**
   * Destroy validator
   */
  destroy() {
    clearTimeout(this.debounceTimer);
    if (this.validationContainer) {
      this.validationContainer.remove();
    }
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { EmailVerification, EmailInputValidator };
} else {
  // Browser environment
  window.EmailVerification = EmailVerification;
  window.EmailInputValidator = EmailInputValidator;
}


