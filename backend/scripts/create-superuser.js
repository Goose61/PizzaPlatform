#!/usr/bin/env node

/**
 * Superuser Creation Script - Pizza Platform
 * Creates a super admin account for system management and testing
 */

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const crypto = require('crypto');

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
const User = require('../src/models/User');
const Business = require('../src/models/Business');
const AdminUser = require('../src/models/AdminUser');

// Configuration from environment (avoid hardcoding credentials)
const SUPERUSER_CONFIG = {
  admin: {
    username: process.env.SUPER_ADMIN_USERNAME,
    email: process.env.SUPER_ADMIN_EMAIL,
    password: process.env.SUPER_ADMIN_PASSWORD,
    role: 'super_admin',
    permissions: ['*']
  },
  createTestAccounts: process.env.CREATE_TEST_ACCOUNTS === 'true',
  customer: {
    email: process.env.TEST_CUSTOMER_EMAIL,
    password: process.env.TEST_CUSTOMER_PASSWORD,
    role: 'customer'
  },
  cnBusiness: {
    email: process.env.TEST_CN_EMAIL,
    password: process.env.TEST_CN_PASSWORD,
    businessName: process.env.TEST_CN_NAME || 'Test CN Crypto Pizza',
    businessType: 'CN',
    role: 'business'
  }
};

async function createSuperuser() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('📊 Connected to MongoDB');

    console.log('\n🔧 Creating Pizza Platform Accounts...\n');

    // Create Admin User (AdminUser collection)
    await createAdminUser();

    if (SUPERUSER_CONFIG.createTestAccounts) {
      console.log('\n🧪 CREATE_TEST_ACCOUNTS enabled');
      console.log('👤 Skipping customer accounts - customers pay via QR without accounts');
      await createTestBusiness('cnBusiness');
    } else {
      console.log('\n🧪 Skipping test accounts (set CREATE_TEST_ACCOUNTS=true to enable)');
    }

    console.log('\n✅ All test accounts created successfully!\n');
    console.log('📋 ACCOUNTS CREATED. Credentials are sourced from environment variables and not printed for security.');
    
  } catch (error) {
    console.error('❌ Error creating superuser accounts:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n📊 Disconnected from MongoDB');
    process.exit(0);
  }
}

async function createAdminUser() {
  const config = SUPERUSER_CONFIG.admin;
  if (!config.username || !config.email || !config.password) {
    throw new Error('SUPER_ADMIN_USERNAME, SUPER_ADMIN_EMAIL, and SUPER_ADMIN_PASSWORD must be set');
  }

  // Check if admin already exists in AdminUser collection
  let admin = await AdminUser.findOne({ $or: [{ username: config.username }, { email: config.email }] });
  if (admin) {
    console.log('👑 Super admin already exists - ensuring active and updating password...');
    admin.isActive = true;
    admin.password = config.password; // will be hashed by pre-save
  } else {
    console.log('👑 Creating super admin account...');
    admin = new AdminUser({
      username: config.username,
      email: config.email,
      password: config.password,
      role: 'super_admin',
      permissions: ['*'],
      twoFactorEnabled: false
    });
  }
  await admin.save();
  console.log(`   ✓ Admin created/updated: ${config.email}`);
}

async function createTestCustomer() {
  const config = SUPERUSER_CONFIG.customer;
  if (!config.email || !config.password) {
    console.log('👤 Skipping test customer - credentials not configured');
    return;
  }
  
  // Check if customer already exists
  let customer = await User.findOne({ email: config.email });
  
  if (customer) {
    console.log('👤 Test customer already exists - updating password...');
  } else {
    console.log('👤 Creating test customer account...');
    customer = new User();
  }

  // Hash password
  const saltRounds = 12;
  const hashedPassword = await bcrypt.hash(config.password, saltRounds);

  // Set customer properties
  customer.email = config.email;
  customer.passwordHash = hashedPassword;
  customer.role = config.role;
  customer.isEmailVerified = true;
  customer.kycStatus = 'unverified'; // Customer starts unverified
  customer.createdAt = new Date();
  customer.loginAttempts = 0;
  customer.accountLocked = false;

  // Initialize customer wallet (required for redesigned system)
  customer.wallet = {
    address: `${crypto.randomBytes(16).toString('hex')}`, // Placeholder Phantom/Solflare address
    pizzaSPLBalance: 0,
    usdcBalance: 0,
    walletType: 'phantom'
  };

  // Initialize investment tokens
  customer.investmentTokens = {
    balance: 0,
    governanceVotes: 0,
    acquisitionHistory: []
  };

  // Initialize gift cards
  customer.giftCards = [];

  await customer.save();
  console.log(`   ✓ Customer created: ${config.email}`);
}

async function createTestBusiness(businessKey) {
  const config = SUPERUSER_CONFIG[businessKey];
  if (!config.email || !config.password) {
    console.log(`🏢 Skipping test ${config.businessType} business - credentials not configured`);
    return;
  }
  
  // Check if business user already exists
  let businessUser = await User.findOne({ email: config.email });
  
  if (businessUser) {
    console.log(`🏢 Test ${config.businessType} business user already exists - updating...`);
  } else {
    console.log(`🏢 Creating test ${config.businessType} business user...`);
    businessUser = new User();
  }

  // Hash password
  const saltRounds = 12;
  const hashedPassword = await bcrypt.hash(config.password, saltRounds);

  // Set business user properties
  businessUser.email = config.email;
  businessUser.passwordHash = hashedPassword;
  businessUser.role = config.role;
  businessUser.isEmailVerified = true;
  businessUser.kycStatus = 'verified';
  businessUser.createdAt = new Date();
  businessUser.loginAttempts = 0;
  businessUser.accountLocked = false;

  // Initialize business user wallet (required for redesigned system)
  businessUser.wallet = {
    address: `${crypto.randomBytes(16).toString('hex')}`, // Placeholder Phantom/Solflare address
    pizzaSPLBalance: 0,
    usdcBalance: 0,
    walletType: 'phantom'
  };

  await businessUser.save();

  // Check if business profile already exists
  let business = await Business.findOne({ ownerId: businessUser._id });
  
  if (business) {
    console.log(`   ✓ Business profile already exists: ${config.businessName}`);
  } else {
    console.log(`   ✓ Creating business profile: ${config.businessName}`);
    
    business = new Business({
      businessName: config.businessName,
      businessCategory: 'restaurant',
      businessType: config.businessType,
      businessDescription: `Test ${config.businessType} business for development`,
      website: 'https://example.com',
      taxId: `TIN_${crypto.randomBytes(6).toString('hex')}`,
      legalStructure: 'sole_proprietorship',
      
      // Required address
      address: {
        street: '123 Test Street',
        city: 'Test City',
        state: 'TS',
        zipCode: '12345',
        country: 'US'
      },
      
      // Required contact info
      contact: {
        name: config.businessName,
        email: config.email,
        phone: '+1234567890'
      },
      
      // Status and verification
      isActive: true,
      kycStatus: 'verified',
      
      // Business wallet (placeholder)
      businessWallet: {
        publicKey: `PK_${crypto.randomBytes(16).toString('hex')}`,
        encryptedPrivateKey: `ENC_${crypto.randomBytes(32).toString('hex')}`
      },
      
      // Unified fee structure for all CN businesses
      feeStructure: {
        platformFeePercent: 0.01, // 1% platform fee
        vaultContributionPercent: 0.013, // 1.3% vault contribution
        totalFeePercent: 0.023 // 2.3% total
      },
      
      // Settlement preferences (CN businesses only)
      settlement: {
        method: 'usdc-retain',
        walletAddress: `${crypto.randomBytes(16).toString('hex')}` // Placeholder - would be actual Phantom/Solflare address
      },
      
      // Link to user account
      ownerId: businessUser._id
    });

    await business.save();
  }
  
  console.log(`   ✓ Business created: ${config.businessName} (${config.businessType})`);
}

// Run the script
if (require.main === module) {
  createSuperuser();
}

module.exports = { createSuperuser, SUPERUSER_CONFIG };