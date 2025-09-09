const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');

// Load environment variables
const configPaths = [
  path.join(__dirname, '../../config.env'),
  path.join(__dirname, '../../.env')
];

const configPath = configPaths.find(configPath => fs.existsSync(configPath));
if (configPath) {
  require('dotenv').config({ path: configPath });
  console.log('✅ Environment loaded from:', path.basename(configPath));
} else {
  console.error('❌ No environment configuration file found!');
  process.exit(1);
}

// Import AdminUser model
const AdminUser = require('../src/models/AdminUser');

async function createAdminUser() {
    try {
        console.log('🔌 Connecting to MongoDB Atlas...');
        
        if (!process.env.MONGODB_URI) {
            throw new Error('MONGODB_URI not found in environment variables');
        }
        
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB Atlas');
        console.log('');

        // Create Super Admin in AdminUser collection
        console.log('👑 Creating Super Admin in AdminUser collection...');
        
        // Check if admin already exists
        let admin = await AdminUser.findOne({ 
            $or: [
                { username: 'pizzaadmin' },
                { email: 'admin@pizzaplatform.com' }
            ]
        });
        
        if (admin) {
            console.log('   ℹ️  Admin already exists - updating...');
        } else {
            admin = new AdminUser();
            console.log('   ℹ️  Creating new admin user...');
        }

        // Set admin properties
        admin.username = 'pizzaadmin';
        admin.email = 'admin@pizzaplatform.com';
        admin.password = 'PizzaAdmin2024!'; // Don't hash here - let pre-save middleware handle it
        admin.role = 'super_admin';
        admin.permissions = ['*']; // Super admin permission
        admin.isActive = true;
        admin.emailVerified = true;
        admin.twoFactorEnabled = false;
        admin.failedLoginAttempts = 0;
        admin.lastPasswordChange = new Date();

        await admin.save();
        console.log('   ✅ Super Admin created in AdminUser collection');

        console.log('');
        console.log('🎉 Admin user created successfully!');
        console.log('');
        console.log('=======================================');
        console.log('ADMIN LOGIN CREDENTIALS:');
        console.log('=======================================');
        console.log('👑 SUPER ADMIN:');
        console.log('   Username: pizzaadmin');
        console.log('   Email:    admin@pizzaplatform.com');
        console.log('   Password: PizzaAdmin2024!');
        console.log('=======================================');

    } catch (error) {
        console.error('❌ Error creating admin user:', error.message);
        console.error('Stack trace:', error.stack);
    } finally {
        await mongoose.disconnect();
        console.log('');
        console.log('📊 Disconnected from MongoDB');
        process.exit(0);
    }
}

createAdminUser();