#!/usr/bin/env node

/**
 * Reset Admin Password Script - Pizza Platform
 * Resets password for an existing admin user
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const readline = require('readline');

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

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

async function resetAdminPassword() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('📊 Connected to MongoDB\n');

    // Find all admin users first
    const allAdmins = await AdminUser.find({});
    console.log(`📋 Found ${allAdmins.length} admin users in database:`);
    
    allAdmins.forEach((admin, index) => {
      console.log(`   ${index + 1}. ${admin.username} (${admin.email}) - ${admin.role}`);
    });

    // Find the specific admin user
    const admin = await AdminUser.findOne({ 
      $or: [
        { username: 'pizzaladmin' },
        { username: 'pizzaadmin' },
        { email: 'admin@pizzaplatform.com' }
      ]
    });
    
    if (!admin) {
      console.log('❌ Admin user not found in database');
      console.log('   Searched for: pizzaladmin, pizzaadmin, admin@pizzaplatform.com');
      return;
    }

    console.log(`🔧 Found admin user: ${admin.username} (${admin.email})`);
    console.log('🔑 Enter new password for this admin user');
    console.log('    (Password should be at least 8 characters)');
    
    const newPassword = await askQuestion('\nNew password: ');
    
    if (!newPassword || newPassword.length < 8) {
      console.log('❌ Password must be at least 8 characters long');
      return;
    }

    // Update the password (will be hashed by pre-save middleware)
    admin.password = newPassword;
    admin.loginAttempts = 0; // Reset failed attempts
    admin.lockUntil = undefined; // Clear any lock
    admin.isActive = true; // Ensure active

    await admin.save();
    
    console.log('\n✅ Admin password updated successfully!');
    console.log(`   Username: ${admin.username}`);
    console.log(`   Email: ${admin.email}`);
    console.log('   Failed attempts reset to 0');
    console.log('   Account is now active and unlocked');

  } catch (error) {
    console.error('❌ Error resetting admin password:', error);
  } finally {
    rl.close();
    await mongoose.disconnect();
    console.log('\n📊 Disconnected from MongoDB');
  }
}

// Run the script
if (require.main === module) {
  resetAdminPassword();
}

module.exports = { resetAdminPassword };