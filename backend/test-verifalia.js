// Test Verifalia Email Verification Integration
// Based on Verifalia API v2.7 documentation

const fs = require('fs');
const path = require('path');
const https = require('https');

// Load environment variables
const projectRoot = path.join(__dirname, '../');
const configPath = path.join(projectRoot, 'config.env');

if (fs.existsSync(configPath)) {
  require('dotenv').config({ path: configPath });
  console.log('✅ Environment loaded from config.env');
} else {
  console.log('❌ config.env not found');
  process.exit(1);
}

// Check Verifalia credentials
console.log('🔍 Checking Verifalia credentials...');
const username = process.env.VERIFALIA_SUB_ACCOUNT_SID;
const password = process.env.VERIFALIA_AUTH_TOKEN;

console.log('Username (VERIFALIA_SUB_ACCOUNT_SID):', username ? `✅ Set (${username})` : '❌ Missing');
console.log('Password (VERIFALIA_AUTH_TOKEN):', password ? '✅ Set (****)' : '❌ Missing');

if (!username || !password) {
  console.log('\n❌ Missing credentials. Please check config.env file.');
  process.exit(1);
}

// Test 1: Direct API call using Verifalia REST API v2.7
async function testDirectAPICall(email) {
  console.log('\n🧪 Test 1: Direct Verifalia API v2.7 call...');
  
  const payload = JSON.stringify({
    entries: [
      { inputData: email }
    ],
    quality: 'Standard', // or 'High' for more thorough verification
    waitTime: '00:00:30' // Wait up to 30 seconds for completion
  });

  const auth = Buffer.from(`${username}:${password}`).toString('base64');
  
  const options = {
    hostname: 'api.verifalia.com',
    port: 443,
    path: '/v2.7/email-validations',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': payload.length,
      'Authorization': `Basic ${auth}`,
      'User-Agent': 'Pizza-Platform/1.0'
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      
      console.log(`📡 API Response Status: ${res.statusCode}`);
      console.log(`📡 Response Headers:`, res.headers);
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          if (res.statusCode === 200 || res.statusCode === 202) {
            const result = JSON.parse(data);
            console.log('✅ Direct API call successful!');
            console.log('📊 Validation Job ID:', result.overview?.id);
            console.log('📊 Job Status:', result.overview?.status);
            
            if (result.entries && result.entries.length > 0) {
              const entry = result.entries[0];
              console.log('📧 Email Result:', {
                email: entry.inputData,
                status: entry.status,
                classification: entry.classification,
                suggestion: entry.suggestion || 'none'
              });
            }
            
            resolve(result);
          } else {
            console.log('❌ API Error Response:', data);
            reject(new Error(`API returned ${res.statusCode}: ${data}`));
          }
        } catch (error) {
          console.log('❌ Failed to parse API response:', data);
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      console.log('❌ Request failed:', error.message);
      reject(error);
    });

    req.write(payload);
    req.end();
  });
}

// Test 2: SDK-based call
async function testSDKCall(email) {
  console.log('\n🧪 Test 2: Verifalia SDK call...');
  
  try {
    const { VerifaliaRestClient } = require('verifalia');
    
    const client = new VerifaliaRestClient({
      username: username,
      password: password
    });

    console.log('📧 Submitting email validation...');
    
    const validation = await client.emailValidations.submit({
      entries: [{ inputData: email }],
      quality: 'Standard'
    });

    console.log('✅ SDK call successful!');
    console.log('📊 Validation Job ID:', validation.overview.id);
    console.log('📊 Job Status:', validation.overview.status);

    // Wait for completion and get results
    console.log('⏳ Waiting for validation completion...');
    const result = await client.emailValidations.get(validation.overview.id);
    
    if (result.entries && result.entries.length > 0) {
      const entry = result.entries[0];
      console.log('📧 Email Result:', {
        email: entry.inputData,
        status: entry.status?.toString(),
        classification: entry.classification?.toString(),
        suggestion: entry.suggestion || 'none',
        quality: entry.quality
      });
    }

    return result;
  } catch (error) {
    console.log('❌ SDK call failed:', error.message);
    if (error.response) {
      console.log('📡 Error Response Status:', error.response.status);
      console.log('📡 Error Response Body:', error.response.statusText);
    }
    throw error;
  }
}

// Test 3: Service integration test
async function testServiceIntegration(email) {
  console.log('\n🧪 Test 3: EmailVerificationService integration...');
  
  try {
    const EmailVerificationService = require('./src/services/emailVerificationService');
    const service = new EmailVerificationService();
    
    console.log('Service configured:', service.isConfigured ? '✅ YES' : '❌ NO');
    
    if (!service.isConfigured) {
      throw new Error('Service not configured');
    }

    const result = await service.verifyEmail(email);
    
    if (result.success) {
      console.log('✅ Service integration successful!');
      console.log('📧 Result:', result.result);
    } else {
      console.log('❌ Service integration failed:', result.error);
    }
    
    return result;
  } catch (error) {
    console.log('❌ Service integration error:', error.message);
    throw error;
  }
}

// Test 4: Credits and account info
async function testAccountInfo() {
  console.log('\n🧪 Test 4: Account information...');
  
  try {
    const { VerifaliaRestClient } = require('verifalia');
    
    const client = new VerifaliaRestClient({
      username: username,
      password: password
    });

    console.log('💳 Checking account credits...');
    const balance = await client.credits.getBalance();
    
    console.log('✅ Account info retrieved!');
    console.log('💰 Credit Packs:', balance.creditPacks || 'None');
    console.log('🆓 Free Credits:', balance.freeCredits || 0);
    console.log('⏰ Free Credits Reset:', balance.freeCreditsResetIn || 'N/A');
    
    return balance;
  } catch (error) {
    console.log('❌ Account info failed:', error.message);
    throw error;
  }
}

// Run all tests
async function runAllTests() {
  const testEmail = 'test@gmail.com';
  
  console.log('🚀 Starting Verifalia Integration Tests...');
  console.log('📧 Test Email:', testEmail);
  console.log('=' .repeat(60));

  try {
    // Test 1: Direct API call
    await testDirectAPICall(testEmail);
    
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test 2: SDK call
    await testSDKCall(testEmail);
    
    // Test 3: Service integration
    await testServiceIntegration(testEmail);
    
    // Test 4: Account info
    await testAccountInfo();
    
    console.log('\n🎉 All tests completed successfully!');
    console.log('✅ Your Verifalia integration is working correctly.');
    
  } catch (error) {
    console.log('\n❌ Test suite failed:', error.message);
    console.log('\n🔧 Troubleshooting tips:');
    console.log('1. Check that your username/password are correct');
    console.log('2. Verify permissions in Verifalia dashboard:');
    console.log('   - emailValidations:submit');
    console.log('   - emailValidations:get');
    console.log('   - credits:get');
    console.log('3. Wait 10 minutes after changing permissions');
    console.log('4. Ensure you have available credits');
  }
}

// Start tests
runAllTests().catch(console.error);
