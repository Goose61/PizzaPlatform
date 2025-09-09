#!/usr/bin/env node

/**
 * Test Business Creation Script - Pizza Platform
 * Creates test business accounts for end-to-end testing
 */

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');

// Load environment variables
const projectRoot = path.join(__dirname, '../../');
const configPaths = [
  path.join(projectRoot, 'config.env'),
  path.join(projectRoot, '.env')
];

const configPath = configPaths.find(configPath => fs.existsSync(configPath));
if (configPath) {
  require('dotenv').config({ path: configPath });
  console.log(`✅ Environment loaded from: ${path.basename(configPath)}`);
} else {
  console.error('❌ No environment configuration file found!');
  process.exit(1);
}

// Import models
const Business = require('../src/models/Business');
const User = require('../src/models/User');

async function createTestBusinesses() {
  try {
    // Connect to MongoDB
    console.log('📡 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected successfully');

    // Create CN Test Business and User
    console.log('\n🏢 Creating CN test business...');
    const existingCN = await Business.findOne({ 'contact.email': 'test@cnbusiness.com' });
    const existingUser = await User.findOne({ email: 'test@cnbusiness.com' });
    
    if (existingCN && existingUser) {
      console.log('⚠️  CN test business and user already exist');
    } else {
      // Create user first
      const testUser = existingUser || new User({
        email: 'test@cnbusiness.com',
        passwordHash: await bcrypt.hash('TestBusiness123!', 12),
        role: 'business',
        firstName: 'Test',
        lastName: 'CNBusinessOwner',
        isActive: true,
        isVerified: true,
        isEmailVerified: true,
        registrationIP: '127.0.0.1',
        registrationUserAgent: 'Test-Script/1.0',
        wallet: {
          address: 'DEVNETTestWallet123456789CNBIZ',
          encryptedPrivateKey: 'encrypted_cn_test_key_placeholder'
        }
      });
      
      if (!existingUser) {
        await testUser.save();
      }
      const cnBusiness = new Business({
        // Basic info
        businessName: 'Test CN Pizza Business',
        businessCategory: 'restaurant',
        businessType: 'CN',
        businessDescription: 'Test pizza business for end-to-end testing',
        
        // Legal info
        taxId: 'TEST-12-3456789',
        legalStructure: 'llc',
        
        // Contact info
        contact: {
          name: 'Test CN Business Owner',
          email: 'test@cnbusiness.com',
          phone: '+1-555-123-4567',
          title: 'Owner'
        },
        
        // Address
        address: {
          street: '123 Test Pizza Lane',
          city: 'Test City',
          state: 'CA',
          zipCode: '90210',
          country: 'US'
        },
        
        // Settlement (required for CN) - Use a valid devnet wallet address
        settlement: {
          method: 'usdc-retain',
          walletAddress: 'H1HsQ5AjWGAnW7f6ZAwohwa2JzDcXZsaa6NTqhyFjvLM' // Valid devnet wallet
        },
        
        // Registration info
        registrationIP: '127.0.0.1',
        registrationUserAgent: 'Test-Script/1.0',
        ownerId: testUser._id,
        
        // Account status
        isActive: true,
        kycStatus: 'verified',
        
        // Vault contribution
        vaultContribution: {
          totalContributed: 195.50,
          stakingEnabled: false,
          stakingConfig: {
            eligible: true
          }
        }
      });
      
      if (!existingCN) {
        await cnBusiness.save();
      }
      
      // Link business to user
      testUser.businessId = cnBusiness._id;
      await testUser.save();
      
      console.log('✅ CN test business and user created successfully');
      console.log('   📧 Email: test@cnbusiness.com');
      console.log('   🔑 Password: TestBusiness123!');
      console.log('   🏢 Type: CN (Crypto Native)');
      console.log('   💰 Vault contribution: $195.50');
    }

    console.log('\n🎉 Test business account ready for end-to-end testing!');
    console.log('🌐 Access the business dashboard at: http://localhost:3000/pages/business-login.html');
    console.log('\n📝 Test Credentials:');
    console.log('   CN Business: test@cnbusiness.com / TestBusiness123!');

  } catch (error) {
    console.error('❌ Error creating test businesses:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n📡 Disconnected from MongoDB');
  }
}

// Run the script
createTestBusinesses();