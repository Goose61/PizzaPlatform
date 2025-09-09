#!/usr/bin/env node

/**
 * Set Admin Password Script - Pizza Platform
 * Sets password for the existing admin user to a known value
 */

const fs = require('fs');
const path = require('path');
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

// Import AdminUser model
const AdminUser = require('../src/models/AdminUser');

async function setAdminPassword() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('📊 Connected to MongoDB\n');

    // Find the admin user
    const admin = await AdminUser.findOne({ 
      $or: [
        { username: 'pizzaadmin' },
        { email: 'admin@pizzaplatform.com' }
      ]
    });
    
    if (!admin) {
      console.log('❌ Admin user not found in database');
      return;
    }

    console.log(`🔧 Found admin user: ${admin.username} (${admin.email})`);
    
    // Set password to a known value (matches CLAUDE.md documentation)
    const newPassword = 'PizzaAdmin2024!';
    
    console.log('🔑 Setting password to: PizzaAdmin2024!');

    // Update the password (will be hashed by pre-save middleware)
    admin.password = newPassword;
    admin.loginAttempts = 0; // Reset failed attempts
    admin.lockUntil = undefined; // Clear any lock
    admin.isActive = true; // Ensure active

    await admin.save();
    
    console.log('\n✅ Admin password updated successfully!');
    console.log(`   Username: ${admin.username}`);
    console.log(`   Email: ${admin.email}`);
    console.log('   Password: PizzaAdmin2024!');
    console.log('   Failed attempts reset to 0');
    console.log('   Account is now active and unlocked');

  } catch (error) {
    console.error('❌ Error setting admin password:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n📊 Disconnected from MongoDB');
  }
}

// Run the script
if (require.main === module) {
  setAdminPassword();
}

module.exports = { setAdminPassword };