@echo off
echo ====================================
echo Pizza Platform - Superuser Setup
echo ====================================
echo.
echo BEFORE RUNNING THIS SCRIPT:
echo 1. Make sure you have updated your MongoDB Atlas connection string in config.env
echo 2. Replace YOUR_USERNAME, YOUR_PASSWORD, and YOUR_CLUSTER with your actual values
echo 3. Make sure your backend server is NOT running
echo.

echo This script will:
echo - Connect to your MongoDB Atlas database
echo - Create superuser accounts for testing
echo - Display the login credentials
echo.

echo Press any key to continue or Ctrl+C to cancel...
pause >nul

echo.
echo Loading environment configuration...

cd /d "%~dp0"

node -e "
// Load environment variables
const fs = require('fs');
const path = require('path');

// Look for config files
const configPaths = [
  path.join(__dirname, 'config.env'),
  path.join(__dirname, '.env')
];

const configPath = configPaths.find(configPath => fs.existsSync(configPath));
if (configPath) {
  require('dotenv').config({ path: configPath });
  console.log('✅ Environment loaded from:', path.basename(configPath));
} else {
  console.error('❌ No environment configuration file found!');
  process.exit(1);
}

const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

// Import User model
const User = require('./backend/src/models/User');

async function createSuperuser() {
    try {
        console.log('🔌 Connecting to MongoDB Atlas...');
        
        if (!process.env.MONGODB_URI) {
            throw new Error('MONGODB_URI not found in environment variables');
        }
        
        if (process.env.MONGODB_URI.includes('YOUR_USERNAME')) {
            throw new Error('Please update your MONGODB_URI in config.env with your actual Atlas credentials');
        }
        
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB Atlas');
        console.log('');

        // Admin User
        console.log('👑 Creating Super Admin...');
        let admin = await User.findOne({ email: 'admin@pizzaplatform.com' });
        if (admin) {
            console.log('   ℹ️  Admin already exists - updating password...');
        } else {
            admin = new User();
        }

        admin.email = 'admin@pizzaplatform.com';
        admin.passwordHash = await bcrypt.hash('PizzaAdmin2024!', 12);
        admin.role = 'admin';
        admin.isEmailVerified = true;
        admin.kycStatus = 'verified';
        admin.createdAt = new Date();
        admin.loginAttempts = 0;
        admin.accountLocked = false;
        
        admin.adminData = {
            username: 'pizzaadmin',
            permissions: ['*'],
            isSuperAdmin: true,
            createdBy: 'system'
        };

        await admin.save();
        console.log('   ✅ Super Admin created');

        // Test Customer
        console.log('👤 Creating Test Customer...');
        let customer = await User.findOne({ email: 'test@customer.com' });
        if (customer) {
            console.log('   ℹ️  Customer already exists - updating password...');
        } else {
            customer = new User();
        }

        customer.email = 'test@customer.com';
        customer.passwordHash = await bcrypt.hash('TestCustomer123!', 12);
        customer.role = 'customer';
        customer.isEmailVerified = true;
        customer.kycStatus = 'unverified';
        customer.createdAt = new Date();
        customer.loginAttempts = 0;
        customer.accountLocked = false;

        customer.walletData = {
            solanaAddress: null,
            pizzaSPLBalance: 0,
            usdcBalance: 0,
            investmentTokens: 0
        };

        await customer.save();
        console.log('   ✅ Test Customer created');

        // Test NCN Business
        console.log('🏢 Creating Test NCN Business...');
        let ncnBusiness = await User.findOne({ email: 'test@ncnbusiness.com' });
        if (ncnBusiness) {
            console.log('   ℹ️  NCN Business already exists - updating password...');
        } else {
            ncnBusiness = new User();
        }

        ncnBusiness.email = 'test@ncnbusiness.com';
        ncnBusiness.passwordHash = await bcrypt.hash('TestBusiness123!', 12);
        ncnBusiness.role = 'business';
        ncnBusiness.isEmailVerified = true;
        ncnBusiness.kycStatus = 'verified';
        ncnBusiness.createdAt = new Date();
        ncnBusiness.loginAttempts = 0;
        ncnBusiness.accountLocked = false;

        await ncnBusiness.save();
        console.log('   ✅ Test NCN Business created');

        // Test CN Business
        console.log('🪙 Creating Test CN Business...');
        let cnBusiness = await User.findOne({ email: 'test@cnbusiness.com' });
        if (cnBusiness) {
            console.log('   ℹ️  CN Business already exists - updating password...');
        } else {
            cnBusiness = new User();
        }

        cnBusiness.email = 'test@cnbusiness.com';
        cnBusiness.passwordHash = await bcrypt.hash('TestBusiness123!', 12);
        cnBusiness.role = 'business';
        cnBusiness.isEmailVerified = true;
        cnBusiness.kycStatus = 'verified';
        cnBusiness.createdAt = new Date();
        cnBusiness.loginAttempts = 0;
        cnBusiness.accountLocked = false;

        await cnBusiness.save();
        console.log('   ✅ Test CN Business created');

        console.log('');
        console.log('🎉 All superuser accounts created successfully!');
        console.log('');
        console.log('=======================================');
        console.log('LOGIN CREDENTIALS:');
        console.log('=======================================');
        console.log('👑 SUPER ADMIN:');
        console.log('   Username: pizzaadmin');
        console.log('   Email:    admin@pizzaplatform.com');
        console.log('   Password: PizzaAdmin2024!');
        console.log('');
        console.log('👤 TEST CUSTOMER:');
        console.log('   Email:    test@customer.com');
        console.log('   Password: TestCustomer123!');
        console.log('');
        console.log('🏢 TEST NCN BUSINESS:');
        console.log('   Email:    test@ncnbusiness.com');
        console.log('   Password: TestBusiness123!');
        console.log('');
        console.log('🪙 TEST CN BUSINESS:');
        console.log('   Email:    test@cnbusiness.com');
        console.log('   Password: TestBusiness123!');
        console.log('=======================================');

    } catch (error) {
        console.error('❌ Error creating accounts:', error.message);
    } finally {
        await mongoose.disconnect();
        console.log('');
        console.log('📊 Disconnected from MongoDB');
        process.exit(0);
    }
}

createSuperuser();
"

echo.
echo ====================================
echo Setup Complete!
echo ====================================
echo.
echo You can now use these accounts to login to your platform.
echo Make sure to start your backend server before testing.
echo.
echo Press any key to close...
pause >nul