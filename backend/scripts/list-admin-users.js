#!/usr/bin/env node

/**
 * List Admin Users Script - Pizza Platform
 * Shows existing admin users in the database
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

async function listAdminUsers() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('📊 Connected to MongoDB\n');

    // Find all admin users
    const adminUsers = await AdminUser.find({}).select('+password +twoFactorSecret');
    
    console.log(`📋 Found ${adminUsers.length} admin user(s):\n`);
    
    adminUsers.forEach((admin, index) => {
      console.log(`${index + 1}. Admin User:`);
      console.log(`   Username: ${admin.username}`);
      console.log(`   Email: ${admin.email}`);
      console.log(`   Role: ${admin.role}`);
      console.log(`   Active: ${admin.isActive}`);
      console.log(`   2FA Enabled: ${admin.twoFactorEnabled || false}`);
      console.log(`   Permissions: ${admin.permissions ? admin.permissions.join(', ') : 'none'}`);
      console.log(`   Created: ${admin.createdAt}`);
      console.log(`   Last Login: ${admin.lastLogin || 'Never'}`);
      console.log(`   Failed Attempts: ${admin.loginAttempts || 0}`);
      console.log(`   Locked: ${admin.isLocked}`);
      console.log();
    });

    if (adminUsers.length === 0) {
      console.log('   No admin users found in database.');
      console.log('   Use the create-superuser.js script to create one.');
    }

  } catch (error) {
    console.error('❌ Error listing admin users:', error);
  } finally {
    await mongoose.disconnect();
    console.log('📊 Disconnected from MongoDB');
  }
}

// Run the script
if (require.main === module) {
  listAdminUsers();
}

module.exports = { listAdminUsers };