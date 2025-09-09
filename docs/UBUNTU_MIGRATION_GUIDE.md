# Pizza Platform Ubuntu 22.04 LTS Migration Guide
## Complete Setup and Deployment Documentation

### 🐧 **Overview**

This guide provides step-by-step instructions for migrating your Pizza Platform from Windows to Ubuntu 22.04 LTS Desktop, including Solana development environment setup, platform deployment, and production configuration with Ubuntu Pro benefits.

---

## 📋 **Prerequisites**

- Fresh Ubuntu 22.04 LTS Desktop installation
- Ubuntu Pro account (activated)
- Internet connection with root/sudo privileges
- Basic familiarity with terminal commands
- Your existing Pizza Platform codebase (accessible via Git or file transfer)

---

## 🔧 **Phase 1: System Preparation and Security Hardening**

### **1.1 System Update and Ubuntu Pro Activation**

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Verify Ubuntu Pro status
ubuntu-advantage status

# If not activated, activate Ubuntu Pro
sudo ubuntu-advantage attach YOUR_TOKEN

# Install extended security maintenance packages
sudo apt install ubuntu-advantage-tools -y
```

### **1.2 Essential Development Tools Installation**

```bash
# Install build essentials and development tools
sudo apt install -y curl wget git vim build-essential software-properties-common \
    apt-transport-https ca-certificates gnupg lsb-release unzip

# Install system monitoring and security tools
sudo apt install -y htop neofetch ufw fail2ban unattended-upgrades

# Configure automatic security updates
sudo dpkg-reconfigure -plow unattended-upgrades
```

### **1.3 Firewall and Security Configuration**

```bash
# Configure UFW firewall
sudo ufw enable
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Allow SSH (if needed for remote access)
sudo ufw allow ssh

# Allow HTTP and HTTPS
sudo ufw allow 80
sudo ufw allow 443

# Allow development ports (can be disabled in production)
sudo ufw allow 3000  # Frontend development
sudo ufw allow 7000  # Backend development
sudo ufw allow 8080  # Alternative frontend server

# Configure Fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban

# Create custom jail for your application
sudo tee /etc/fail2ban/jail.d/pizza-platform.conf > /dev/null <<EOF
[pizza-platform]
enabled = true
port = 7000,3000
filter = pizza-platform
logpath = /opt/pizza-platform/logs/security/failed-logins.log
maxretry = 5
bantime = 1800
findtime = 600
EOF
```

---

## 🏗️ **Phase 2: Development Environment Setup**

### **2.1 Node.js and npm Installation**

```bash
# Install Node.js LTS via NodeSource repository
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version  # Should show v18.x or higher
npm --version

# Install global development tools
sudo npm install -g nodemon pm2 serve http-server yarn

# Configure npm for global packages without sudo
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

### **2.2 Rust and Solana CLI Installation**

```bash
# Install Rust (required for Solana development)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env

# Verify Rust installation
rustc --version
cargo --version

# Install Solana CLI toolkit
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"

# Add Solana to PATH
echo 'export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc

# Verify Solana installation
solana --version

# Configure Solana for development
solana config set --url devnet
solana-keygen new --outfile ~/.config/solana/devnet-keypair.json
```

### **2.3 Anchor Framework Installation (Optional but Recommended)**

```bash
# Install Anchor CLI for advanced Solana development
cargo install --git https://github.com/project-serum/anchor anchor-cli

# Verify Anchor installation
anchor --version
```

---

## 🗄️ **Phase 3: Database Setup**

### **3.1 MongoDB Installation**

```bash
# Install MongoDB (Community Edition)
wget -qO - https://www.mongodb.org/static/pgp/server-7.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list

sudo apt update
sudo apt install -y mongodb-org

# Enable and start MongoDB
sudo systemctl enable mongod
sudo systemctl start mongod

# Verify MongoDB installation
sudo systemctl status mongod
mongosh --version
```

### **3.2 MongoDB Security Configuration**

```bash
# Create MongoDB admin user
mongosh

# In MongoDB shell, run:
use admin
db.createUser({
  user: "pizzaAdmin",
  pwd: "CHANGE_THIS_PASSWORD",
  roles: [ { role: "userAdminAnyDatabase", db: "admin" }, "readWriteAnyDatabase" ]
})

# Exit MongoDB shell
exit

# Enable authentication
sudo nano /etc/mongod.conf

# Add these lines to enable authentication:
security:
  authorization: enabled

# Restart MongoDB
sudo systemctl restart mongod
```

---

## 📁 **Phase 4: Project Structure Setup**

### **4.1 Create Pizza Platform Directory Structure**

```bash
# Create project directory with proper permissions
sudo mkdir -p /opt/pizza-platform/{app,uploads,logs,ssl,backups,config}
sudo mkdir -p /opt/pizza-platform/uploads/{kyc-documents,business-documents,temp}
sudo mkdir -p /opt/pizza-platform/logs/{security,compliance,application}
sudo mkdir -p /opt/pizza-platform/config/{nginx,pm2,security}

# Set ownership to your user
sudo chown -R $USER:$USER /opt/pizza-platform

# Set proper permissions
chmod -R 755 /opt/pizza-platform
chmod -R 700 /opt/pizza-platform/uploads/kyc-documents
chmod -R 700 /opt/pizza-platform/logs/security
```

### **4.2 Clone and Setup Your Codebase**

```bash
# Navigate to the app directory
cd /opt/pizza-platform/app

# Clone your repository (replace with your actual repository URL)
git clone https://github.com/your-username/pizza-platform.git .

# Or if transferring from Windows, you can use SCP/rsync:
# rsync -av /path/to/windows/Pizza/ /opt/pizza-platform/app/

# Install dependencies
npm install

# Install backend-specific dependencies
cd backend && npm install && cd ..

# Make shell scripts executable (convert from Windows batch files)
chmod +x scripts/*.sh

# Copy environment configuration
cp config.env.example config.env

# Edit configuration for Ubuntu environment
nano config.env
```

---

## 🔧 **Phase 5: Environment Configuration**

### **5.1 Create Ubuntu-Specific Configuration Files**

Create `/opt/pizza-platform/app/config.env`:

```bash
# Authentication Secrets (Generate new ones for production)
SESSION_SECRET=your_super_secure_session_secret_here
JWT_SECRET=your_jwt_secret_here
ADMIN_JWT_SECRET=your_admin_jwt_secret_here

# Database Configuration
MONGODB_URI=mongodb://pizzaAdmin:YOUR_PASSWORD@localhost:27017/pizzaplatform?authSource=admin

# Email Configuration (Brevo/Sendinblue)
EMAIL_USER=your_brevo_smtp_user
EMAIL_PASS=your_brevo_smtp_password
EMAIL_FROM=noreply@pizzaplatform.com

# Solana Configuration
SOLANA_RPC_ENDPOINT=https://api.devnet.solana.com
WALLET_MASTER_KEY=your_wallet_master_key
SPL_TOKEN_MINT=your_spl_token_mint_address
PIZZA_TOKEN_MINT=your_pizza_token_mint_address

# External Services
GOOGLE_MAPS_API_KEY=your_google_maps_api_key
RECAPTCHA_SITE_KEY=your_recaptcha_site_key
RECAPTCHA_SECRET_KEY=your_recaptcha_secret_key

# Optional Services
KYC_CLIENT_ID=your_kyc_client_id
KYC_CLIENT_SECRET=your_kyc_client_secret
KYC_WEBHOOK_SECRET=your_kyc_webhook_secret
PLATFORM_VAULT_ADDRESS=your_platform_vault_address
KAMINO_PROGRAM_ID=your_kamino_program_id
PIZZA_INVESTMENT_TOKEN_MINT=your_investment_token_mint

# Development Settings
NODE_ENV=development
KYC_SANDBOX=true
PORT=7000
```

### **5.2 Create Ubuntu Service Scripts**

Create `/opt/pizza-platform/app/scripts/start-backend.sh`:

```bash
#!/bin/bash
# Ubuntu version of start-backend.bat

echo "🍕 Starting Pizza Platform Backend Server..."
echo "Environment: $(node --version)"
echo "Working Directory: $(pwd)"
echo

cd /opt/pizza-platform/app/backend

# Check if config file exists
if [ -f "../config.env" ]; then
    echo "✅ Configuration file found"
else
    echo "❌ Configuration file not found!"
    echo "Please create config.env in the project root"
    exit 1
fi

# Start the backend server
echo "🚀 Starting backend on port 7000..."
node src/backend.js
```

Create `/opt/pizza-platform/app/scripts/start-frontend.sh`:

```bash
#!/bin/bash
# Ubuntu version of start-frontend.bat

echo "🍕 Starting Pizza Platform Frontend Server..."
echo

cd /opt/pizza-platform/app/frontend

# Try different server options
if command -v serve &> /dev/null; then
    echo "🚀 Using 'serve' (port 3000)..."
    serve -s . -l 3000
elif command -v http-server &> /dev/null; then
    echo "🚀 Using 'http-server' (port 8080)..."
    http-server -p 8080
elif command -v python3 &> /dev/null; then
    echo "🚀 Using Python HTTP server (port 8000)..."
    python3 -m http.server 8000
else
    echo "❌ No suitable server found!"
    echo "Please install: npm install -g serve"
    exit 1
fi
```

Create `/opt/pizza-platform/app/scripts/setup-superuser.sh`:

```bash
#!/bin/bash
# Ubuntu version of setup-superuser.bat

echo "Creating superuser accounts for Pizza Platform..."
echo

cd /opt/pizza-platform/app/backend

node -e "
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

// Load environment configuration
require('dotenv').config({ path: '../config.env' });

// User model (simplified for setup)
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['customer', 'admin', 'super_admin'], default: 'customer' },
  isVerified: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  twoFactorEnabled: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

const User = mongoose.model('User', userSchema);

async function createSuperUser() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    // Create super admin
    const adminUser = new User({
      username: 'pizzaadmin',
      email: 'admin@pizzaplatform.com',
      password: 'PizzaAdmin2024!',
      role: 'super_admin',
      isVerified: true,
      isActive: true
    });
    
    await adminUser.save();
    console.log('✅ Super admin created successfully');
    console.log('📧 Email: admin@pizzaplatform.com');
    console.log('🔑 Password: PizzaAdmin2024!');
    console.log('👑 Role: super_admin');
    console.log('');
    
    // Create test customer
    const testUser = new User({
      username: 'testcustomer',
      email: 'test@customer.com',
      password: 'TestCustomer123!',
      role: 'customer',
      isVerified: true,
      isActive: true
    });
    
    await testUser.save();
    console.log('✅ Test customer created successfully');
    console.log('📧 Email: test@customer.com');
    console.log('🔑 Password: TestCustomer123!');
    console.log('👤 Role: customer');
    console.log('');
    
    console.log('🎉 Superuser setup complete!');
    console.log('You can now log in at: http://localhost:3000/pages/admin-login.html');
    
  } catch (error) {
    if (error.code === 11000) {
      console.log('⚠️  Users already exist in database');
    } else {
      console.error('❌ Error creating superuser:', error.message);
    }
  } finally {
    await mongoose.disconnect();
    console.log('📡 Disconnected from MongoDB');
  }
}

createSuperUser();
"

echo
echo "Superuser accounts created!"
echo "You can now log in at: http://localhost:3000/pages/admin-login.html"
echo
```

Make scripts executable:

```bash
chmod +x /opt/pizza-platform/app/scripts/*.sh
```

---

## 🚀 **Phase 6: Production Deployment Setup**

### **6.1 Nginx Reverse Proxy Installation**

```bash
# Install Nginx
sudo apt install -y nginx

# Create Pizza Platform Nginx configuration
sudo tee /etc/nginx/sites-available/pizza-platform > /dev/null <<EOF
server {
    listen 80;
    server_name localhost;
    
    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    
    # Rate limiting zones
    limit_req_zone \$binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone \$binary_remote_addr zone=login:10m rate=3r/m;
    
    # API routes
    location /api/login {
        limit_req zone=login burst=5 nodelay;
        proxy_pass http://localhost:7000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    
    location /api/ {
        limit_req zone=api burst=20 nodelay;
        proxy_pass http://localhost:7000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    
    # Frontend routes
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    
    # File upload size limit
    client_max_body_size 10M;
}
EOF

# Enable the site
sudo ln -s /etc/nginx/sites-available/pizza-platform /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default

# Test and restart Nginx
sudo nginx -t
sudo systemctl restart nginx
sudo systemctl enable nginx
```

### **6.2 PM2 Process Manager Configuration**

```bash
# Create PM2 ecosystem configuration
tee /opt/pizza-platform/config/pm2/ecosystem.config.js > /dev/null <<EOF
module.exports = {
  apps: [{
    name: 'pizza-backend',
    script: '/opt/pizza-platform/app/backend/src/backend.js',
    cwd: '/opt/pizza-platform/app',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'development',
      PORT: 7000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 7000
    },
    log_file: '/opt/pizza-platform/logs/application/combined.log',
    out_file: '/opt/pizza-platform/logs/application/out.log',
    error_file: '/opt/pizza-platform/logs/application/error.log',
    time: true,
    max_memory_restart: '1G',
    restart_delay: 4000,
    watch: false,
    ignore_watch: ['node_modules', 'uploads', 'logs']
  }]
};
EOF
```

### **6.3 SSL Certificate Setup (Let's Encrypt)**

```bash
# Install Certbot for Let's Encrypt
sudo apt install -y snapd
sudo snap install --classic certbot

# Create symbolic link
sudo ln -s /snap/bin/certbot /usr/bin/certbot

# Generate SSL certificate (replace with your domain)
# sudo certbot --nginx -d your-domain.com

# For local development, create self-signed certificate
sudo mkdir -p /opt/pizza-platform/ssl
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /opt/pizza-platform/ssl/privkey.pem \
    -out /opt/pizza-platform/ssl/fullchain.pem \
    -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"

sudo chown $USER:$USER /opt/pizza-platform/ssl/*
```

---

## 🔄 **Phase 7: Backup and Monitoring Setup**

### **7.1 Automated Backup System**

```bash
# Create backup script
tee /opt/pizza-platform/scripts/backup.sh > /dev/null <<'EOF'
#!/bin/bash

BACKUP_DIR="/opt/pizza-platform/backups"
DB_NAME="pizzaplatform"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/mongodb_backup_${DATE}.gz"

# Create backup directory if it doesn't exist
mkdir -p $BACKUP_DIR

# Create MongoDB dump
mongodump --authenticationDatabase admin --username pizzaAdmin --password YOUR_PASSWORD --db $DB_NAME --gzip --archive=$BACKUP_FILE

# Encrypt the backup (optional)
if command -v gpg &> /dev/null; then
    gpg --cipher-algo AES256 --compress-algo 1 --s2k-cipher-algo AES256 \
        --s2k-digest-algo SHA512 --s2k-mode 3 --s2k-count 65536 \
        --symmetric --output "${BACKUP_FILE}.gpg" $BACKUP_FILE
    rm $BACKUP_FILE
    BACKUP_FILE="${BACKUP_FILE}.gpg"
fi

# Keep only last 30 days of backups
find $BACKUP_DIR -name "mongodb_backup_*.gz*" -mtime +30 -delete

echo "Backup completed: $BACKUP_FILE"
EOF

chmod +x /opt/pizza-platform/scripts/backup.sh
```

### **7.2 Cron Jobs Setup**

```bash
# Add cron jobs for maintenance
crontab -e

# Add these lines to crontab:
# Daily backups at 2 AM
0 2 * * * /opt/pizza-platform/scripts/backup.sh >> /opt/pizza-platform/logs/backup.log 2>&1

# Clean up temporary files daily
0 3 * * * find /opt/pizza-platform/uploads/temp -type f -mtime +1 -delete

# Restart services weekly (Sunday at 4 AM)
0 4 * * 0 /usr/bin/pm2 restart all
```

---

## 🧪 **Phase 8: Testing and Validation**

### **8.1 System Testing**

```bash
# Test Node.js and npm
node --version
npm --version

# Test Solana CLI
solana --version
solana config get

# Test MongoDB connection
mongosh --eval "db.adminCommand('ismaster')"

# Test services
sudo systemctl status mongod
sudo systemctl status nginx

# Check firewall status
sudo ufw status

# Test application startup
cd /opt/pizza-platform/app

# Install dependencies if not already done
npm install

# Create test database setup
/opt/pizza-platform/app/scripts/setup-superuser.sh

# Start backend (in one terminal)
/opt/pizza-platform/app/scripts/start-backend.sh

# Start frontend (in another terminal)
/opt/pizza-platform/app/scripts/start-frontend.sh

# Test API endpoints
curl http://localhost:7000/api/health
curl http://localhost:3000
```

### **8.2 Production Deployment Test**

```bash
# Start with PM2 for production
cd /opt/pizza-platform/app
pm2 start /opt/pizza-platform/config/pm2/ecosystem.config.js --env production

# Check PM2 status
pm2 status
pm2 logs pizza-backend

# Test through Nginx
curl http://localhost/api/health

# Save PM2 configuration for auto-startup
pm2 save
pm2 startup

# Follow the instructions provided by pm2 startup command
```

---

## 🔐 **Phase 9: Security Hardening**

### **9.1 Additional Security Measures**

```bash
# Install and configure additional security tools
sudo apt install -y lynis rkhunter chkrootkit

# Run security audit
sudo lynis audit system

# Configure log rotation
sudo tee /etc/logrotate.d/pizza-platform > /dev/null <<EOF
/opt/pizza-platform/logs/*/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 644 $USER $USER
    postrotate
        /usr/bin/systemctl reload rsyslog > /dev/null 2>&1 || true
    endscript
}
EOF

# Set up intrusion detection
sudo apt install -y aide
sudo aide --init
sudo cp /var/lib/aide/aide.db.new /var/lib/aide/aide.db
```

### **9.2 File Permissions and Ownership**

```bash
# Secure file permissions
find /opt/pizza-platform -type f -name "*.js" -exec chmod 644 {} \;
find /opt/pizza-platform -type f -name "*.sh" -exec chmod 755 {} \;
find /opt/pizza-platform/uploads -type d -exec chmod 750 {} \;
find /opt/pizza-platform/logs -type d -exec chmod 755 {} \;

# Secure configuration files
chmod 600 /opt/pizza-platform/app/config.env
chmod -R 700 /opt/pizza-platform/ssl

# Set proper ownership
sudo chown -R $USER:www-data /opt/pizza-platform/app/frontend
sudo chown -R $USER:$USER /opt/pizza-platform/uploads
sudo chown -R $USER:$USER /opt/pizza-platform/logs
```

---

## 🚀 **Phase 10: Service Management Commands**

### **10.1 Ubuntu Service Management Scripts**

Create `/opt/pizza-platform/scripts/manage-services.sh`:

```bash
#!/bin/bash

case $1 in
    start)
        echo "🚀 Starting Pizza Platform services..."
        sudo systemctl start mongod
        sudo systemctl start nginx
        pm2 start /opt/pizza-platform/config/pm2/ecosystem.config.js --env production
        echo "✅ All services started"
        ;;
    stop)
        echo "🛑 Stopping Pizza Platform services..."
        pm2 stop all
        sudo systemctl stop nginx
        sudo systemctl stop mongod
        echo "✅ All services stopped"
        ;;
    restart)
        echo "🔄 Restarting Pizza Platform services..."
        pm2 restart all
        sudo systemctl restart nginx
        sudo systemctl restart mongod
        echo "✅ All services restarted"
        ;;
    status)
        echo "📊 Service Status:"
        echo "MongoDB:" $(sudo systemctl is-active mongod)
        echo "Nginx:" $(sudo systemctl is-active nginx)
        pm2 status
        ;;
    logs)
        echo "📋 Recent logs:"
        pm2 logs --lines 50
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|logs}"
        exit 1
        ;;
esac
```

Make it executable:

```bash
chmod +x /opt/pizza-platform/scripts/manage-services.sh
```

---

## 📚 **Phase 11: Development Workflow**

### **11.1 Daily Development Commands**

```bash
# Navigate to project
cd /opt/pizza-platform/app

# Development mode (start both services)
npm run dev &
/opt/pizza-platform/app/scripts/start-frontend.sh

# Run tests
npm test
npm run test:coverage

# Production deployment
/opt/pizza-platform/scripts/manage-services.sh start

# Check logs
/opt/pizza-platform/scripts/manage-services.sh logs

# Backup database
/opt/pizza-platform/scripts/backup.sh
```

### **11.2 Monitoring and Maintenance**

```bash
# System resource monitoring
htop
df -h
du -sh /opt/pizza-platform/*

# Application monitoring
pm2 monit

# Security monitoring
sudo fail2ban-client status
sudo ufw status
```

---

## 🔧 **Troubleshooting Guide**

### **Common Issues and Solutions**

1. **MongoDB Connection Issues**
   ```bash
   # Check MongoDB status
   sudo systemctl status mongod
   
   # Check MongoDB logs
   sudo journalctl -u mongod -f
   
   # Restart MongoDB
   sudo systemctl restart mongod
   ```

2. **Port Conflicts**
   ```bash
   # Check what's using a port
   sudo netstat -tulpn | grep :7000
   
   # Kill process using port
   sudo fuser -k 7000/tcp
   ```

3. **Permission Issues**
   ```bash
   # Fix ownership
   sudo chown -R $USER:$USER /opt/pizza-platform
   
   # Fix permissions
   chmod -R 755 /opt/pizza-platform
   ```

4. **Solana CLI Issues**
   ```bash
   # Reinstall Solana CLI
   sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
   source ~/.bashrc
   
   # Check configuration
   solana config get
   ```

---

## 🎯 **Migration Checklist**

- [ ] Ubuntu 22.04 LTS installed with Ubuntu Pro activated
- [ ] System updated and security configured
- [ ] Firewall and Fail2ban configured
- [ ] Node.js and npm installed
- [ ] Rust and Solana CLI installed
- [ ] MongoDB installed and secured
- [ ] Project directory structure created
- [ ] Codebase cloned and dependencies installed
- [ ] Environment configuration file created
- [ ] Shell scripts created and made executable
- [ ] Nginx reverse proxy configured
- [ ] PM2 process manager configured
- [ ] SSL certificates generated
- [ ] Backup system implemented
- [ ] Cron jobs configured
- [ ] Security hardening completed
- [ ] Services tested and validated
- [ ] Development workflow documented

---

## 💡 **Next Steps**

1. **Configure your domain and SSL certificates for production**
2. **Set up external service integrations (Brevo, Google Maps, etc.)**
3. **Implement monitoring and alerting**
4. **Configure automated deployments**
5. **Set up development/staging environments**

This comprehensive guide provides everything needed to migrate your Pizza Platform from Windows to Ubuntu 22.04 LTS with production-ready configuration. The setup leverages Ubuntu Pro's extended security support and provides a robust, secure foundation for your Solana-based platform.