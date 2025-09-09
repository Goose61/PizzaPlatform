@echo off
echo Creating test business account for Pizza Platform...
echo.

node -e "
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

// Load environment configuration
require('dotenv').config({ path: './config.env' });

// Business model (simplified)
const businessSchema = new mongoose.Schema({
  businessName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  businessType: { type: String, enum: ['CN', 'NCN'], default: 'CN' },
  isVerified: { type: Boolean, default: true },
  isActive: { type: Boolean, default: true },
  wallet: {
    address: String,
    encryptedPrivateKey: String
  },
  totalVaultContributions: { type: Number, default: 0 },
  stakingEnabled: { type: Boolean, default: false },
  stakingEnabledDate: Date,
  createdAt: { type: Date, default: Date.now }
});

businessSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

const Business = mongoose.model('Business', businessSchema);

async function createTestBusiness() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    // Check if business already exists
    const existingBusiness = await Business.findOne({ email: 'test@cnbusiness.com' });
    if (existingBusiness) {
      console.log('⚠️  Test business already exists');
      await mongoose.disconnect();
      return;
    }
    
    // Create test business
    const testBusiness = new Business({
      businessName: 'Test CN Pizza Business',
      email: 'test@cnbusiness.com',
      password: 'TestBusiness123!',
      businessType: 'CN',
      isVerified: true,
      isActive: true,
      wallet: {
        address: 'DEVNETTestWallet123456789',
        encryptedPrivateKey: 'encrypted_test_key_placeholder'
      },
      totalVaultContributions: 195.50, // Some test contribution amount
      stakingEnabled: false
    });
    
    await testBusiness.save();
    console.log('✅ Test CN business created successfully');
    console.log('📧 Email: test@cnbusiness.com');
    console.log('🔑 Password: TestBusiness123!');
    console.log('🏢 Type: CN (Crypto Native)');
    console.log('💰 Test vault contribution: $195.50');
    console.log('');
    
    // Also create NCN business for comparison
    const existingNCN = await Business.findOne({ email: 'test@ncnbusiness.com' });
    if (!existingNCN) {
      const testNCNBusiness = new Business({
        businessName: 'Test NCN Pizza Business',
        email: 'test@ncnbusiness.com',
        password: 'TestBusiness123!',
        businessType: 'NCN',
        isVerified: true,
        isActive: true,
        wallet: {
          address: 'DEVNETTestWalletNCN987654321',
          encryptedPrivateKey: 'encrypted_ncn_test_key_placeholder'
        },
        totalVaultContributions: 87.25,
        stakingEnabled: false
      });
      
      await testNCNBusiness.save();
      console.log('✅ Test NCN business created successfully');
      console.log('📧 Email: test@ncnbusiness.com');
      console.log('🔑 Password: TestBusiness123!');
      console.log('🏢 Type: NCN (Non-Crypto Native)');
      console.log('💰 Test vault contribution: $87.25');
    }
    
    console.log('');
    console.log('🎉 Test businesses ready for end-to-end testing!');
    
  } catch (error) {
    console.error('❌ Error creating test business:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('📡 Disconnected from MongoDB');
  }
}

createTestBusiness();
"

echo.
echo Test business accounts created!
echo You can now log in at: http://localhost:3000/pages/business-login.html
echo.
pause