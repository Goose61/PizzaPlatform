#!/usr/bin/env node

const readline = require('readline');
const crypto = require('crypto');
require('dotenv').config();

const AdminUser = require('../models/AdminUser');
const database = require('../config/database');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Function to ask questions
function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

// Function to ask for password (hidden input)
function askPassword(query) {
  return new Promise((resolve) => {
    process.stdout.write(query);
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    
    let password = '';
    stdin.on('data', function(ch) {
      ch = ch + '';
      
      switch(ch) {
        case '\n':
        case '\r':
        case '\u0004':
          stdin.setRawMode(false);
          stdin.pause();
          process.stdout.write('\n');
          resolve(password);
          break;
        case '\u0003':
          process.exit();
          break;
        case '\u007f': // Backspace
          if (password.length > 0) {
            password = password.slice(0, -1);
            process.stdout.write('\b \b');
          }
          break;
        default:
          password += ch;
          process.stdout.write('*');
          break;
      }
    });
  });
}

// Validate password strength
function validatePassword(password) {
  const errors = [];
  
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }
  
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }
  
  return errors;
}

// Generate secure random secrets
function generateSecrets() {
  return {
    jwtSecret: crypto.randomBytes(64).toString('hex'),
    adminJwtSecret: crypto.randomBytes(64).toString('hex')
  };
}

async function setupAdmin() {
  try {
    console.log('🔧 Pizza Platform Admin Setup');
    console.log('==============================\n');

    // Connect to database
    console.log('📡 Connecting to database...');
    await database.connect();
    console.log('✅ Database connected\n');

    // Check if admin already exists
    const existingAdmin = await AdminUser.findOne({ role: 'super_admin' });
    if (existingAdmin) {
      console.log('❌ Super admin already exists!');
      console.log(`   Username: ${existingAdmin.username}`);
      console.log(`   Email: ${existingAdmin.email}`);
      console.log('\nIf you need to reset the admin account, please manually delete it from the database first.');
      process.exit(1);
    }

    console.log('No admin user found. Let\'s create one!\n');

    // Collect admin information
    const username = await question('👤 Enter admin username: ');
    if (!username || username.length < 3) {
      console.log('❌ Username must be at least 3 characters long');
      process.exit(1);
    }

    const email = await question('📧 Enter admin email: ');
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.log('❌ Invalid email format');
      process.exit(1);
    }

    let password, confirmPassword;
    let passwordValid = false;

    while (!passwordValid) {
      password = await askPassword('🔒 Enter admin password: ');
      confirmPassword = await askPassword('🔒 Confirm password: ');

      if (password !== confirmPassword) {
        console.log('❌ Passwords do not match. Please try again.\n');
        continue;
      }

      const validationErrors = validatePassword(password);
      if (validationErrors.length > 0) {
        console.log('❌ Password requirements not met:');
        validationErrors.forEach(error => console.log(`   - ${error}`));
        console.log('');
        continue;
      }

      passwordValid = true;
    }

    console.log('\n📝 Creating admin user...');

    // Create super admin
    const admin = await AdminUser.createSuperAdmin({
      username,
      email,
      password,
      permissions: ['*'] // All permissions
    });

    console.log('✅ Super admin created successfully!');
    console.log(`   Username: ${admin.username}`);
    console.log(`   Email: ${admin.email}`);
    console.log(`   Role: ${admin.role}`);
    console.log(`   ID: ${admin._id}\n`);

    // Generate secrets if needed
    const hasJwtSecret = process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32;
    const hasAdminJwtSecret = process.env.ADMIN_JWT_SECRET && process.env.ADMIN_JWT_SECRET.length >= 32;

    if (!hasJwtSecret || !hasAdminJwtSecret) {
      console.log('🔐 Generating secure secrets...');
      const secrets = generateSecrets();

      console.log('\n📋 Add these secrets to your .env file:');
      console.log('=====================================');
      
      if (!hasJwtSecret) {
        console.log(`JWT_SECRET=${secrets.jwtSecret}`);
      }
      
      if (!hasAdminJwtSecret) {
        console.log(`ADMIN_JWT_SECRET=${secrets.adminJwtSecret}`);
      }
      
      console.log('=====================================\n');
      console.log('⚠️  IMPORTANT: Save these secrets securely and add them to your environment variables!');
    }

    console.log('\n🎉 Setup complete! You can now login to the admin panel.');

  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    process.exit(1);
  } finally {
    rl.close();
    process.exit(0);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled promise rejection:', err.message);
  process.exit(1);
});

// Run setup
setupAdmin(); 