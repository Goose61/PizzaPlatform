/**
 * reCAPTCHA Enterprise Service
 * Centralized service for reCAPTCHA v3 Enterprise verification
 */

// Helper function for reCAPTCHA Enterprise v3 verification with scoring
async function verifyRecaptcha(token, expectedAction = 'LOGIN') {
  if (!process.env.RECAPTCHA_SITE_KEY || !process.env.RECAPTCHA_SECRET_KEY) {
    console.warn('⚠️ Warning: reCAPTCHA Enterprise not configured');
    return { success: true, score: 1.0, reason: 'development_mode' }; // Allow in development
  }

  try {
    const { RecaptchaEnterpriseServiceClient } = require('@google-cloud/recaptcha-enterprise');
    
    // Create the reCAPTCHA client
    const client = new RecaptchaEnterpriseServiceClient();
    const projectID = process.env.GOOGLE_CLOUD_PROJECT_ID || 'lively-ace-464510-g2';
    const projectPath = client.projectPath(projectID);

    // Build the assessment request
    const request = {
      assessment: {
        event: {
          token: token,
          siteKey: process.env.RECAPTCHA_SITE_KEY,
        },
      },
      parent: projectPath,
    };

    const [response] = await client.createAssessment(request);

    // Check if the token is valid
    if (!response.tokenProperties.valid) {
      console.warn(`❌ reCAPTCHA token invalid: ${response.tokenProperties.invalidReason}`);
      return { 
        success: false, 
        score: 0.0, 
        reason: response.tokenProperties.invalidReason 
      };
    }

    // Check if the expected action was executed
    if (response.tokenProperties.action !== expectedAction) {
      console.warn(`❌ reCAPTCHA action mismatch. Expected: ${expectedAction}, Got: ${response.tokenProperties.action}`);
      return { 
        success: false, 
        score: 0.0, 
        reason: 'action_mismatch' 
      };
    }

    // Get the risk score (0.0 = bot, 1.0 = human)
    const score = response.riskAnalysis.score;
    console.log(`🛡️ reCAPTCHA Enterprise score: ${score} for action: ${expectedAction}`);
    
    // Log reasons if any
    if (response.riskAnalysis.reasons && response.riskAnalysis.reasons.length > 0) {
      console.log('reCAPTCHA reasons:', response.riskAnalysis.reasons);
    }

    // Set threshold - scores above 0.5 are considered legitimate
    const threshold = 0.5;
    const success = score >= threshold;
    
    return { 
      success, 
      score, 
      reason: success ? 'passed_threshold' : 'below_threshold',
      threshold
    };
    
  } catch (error) {
    console.error('❌ reCAPTCHA Enterprise verification failed:', error.message);
    
    // If it's a missing service account key error, allow in development
    if (error.code === 'ENOENT' && error.message.includes('service-account-key.json')) {
      console.warn('⚠️ Service account key missing - allowing in development mode');
      return { 
        success: true, 
        score: 1.0, 
        reason: 'development_mode_no_key' 
      };
    }
    
    return { 
      success: false, 
      score: 0.0, 
      reason: 'verification_error' 
    };
  }
}

module.exports = {
  verifyRecaptcha
};


