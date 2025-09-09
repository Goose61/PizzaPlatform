@echo off
setlocal enabledelayedexpansion

REM Pizza Platform Backend Startup Script
REM Starts the secure Node.js backend with comprehensive monitoring

echo ============================================
echo         Pizza Platform Backend
echo    Starting Secure Production Server
echo ============================================
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)

REM Display Node.js version
echo Node.js Version:
node --version
echo.

REM Check if we're in the correct directory
if not exist "backend\src\backend.js" (
    echo ERROR: backend.js not found
    echo Make sure you're running this script from the Pizza project root directory
    pause
    exit /b 1
)

REM Check for required environment configuration
if not exist "config.env" (
    if not exist ".env" (
        echo WARNING: No environment configuration found
        echo Please create config.env or .env file with required variables
        echo See CLAUDE.md for required environment variables
        echo.
        echo Required variables:
        echo - SESSION_SECRET
        echo - JWT_SECRET  
        echo - ADMIN_JWT_SECRET
        echo - MONGODB_URI
        echo - EMAIL_USER
        echo - EMAIL_PASS
        echo - SOLANA_RPC_ENDPOINT
        echo - WALLET_MASTER_KEY
        echo - SPL_TOKEN_MINT
        echo - PIZZA_TOKEN_MINT
        echo - GOOGLE_MAPS_API_KEY
        echo.
        pause
    )
)

REM Install dependencies if node_modules doesn't exist
if not exist "node_modules" (
    echo Installing dependencies...
    npm install
    if errorlevel 1 (
        echo ERROR: Failed to install dependencies
        pause
        exit /b 1
    )
    echo.
)

REM Create logs directory if it doesn't exist
if not exist "logs" (
    mkdir logs
    echo Created logs directory
)

REM Display security status
echo ============================================
echo        Security Features Active
echo ============================================
echo [✓] Admin privilege escalation protection
echo [✓] Payment race condition prevention
echo [✓] User enumeration attack mitigation
echo [✓] JWT algorithm confusion protection
echo [✓] KYC bypass vulnerability patches
echo [✓] NoSQL injection prevention
echo [✓] Comprehensive input sanitization
echo [✓] Rate limiting and security monitoring
echo.

REM Display system configuration
echo ============================================
echo         System Configuration
echo ============================================
echo [✓] Unified Platform Vault System
echo [✓] Fixed $15 USDC payments
echo [✓] 0.3 PIZZA SPL rewards per transaction
echo [✓] Jupiter DEX atomic swaps
echo [✓] KYC-gated investment token conversion
echo [✓] Gift card NFT system (30-day expiry)
echo [✓] NCN/CN business classification
echo [✓] Kamino staking integration (CN only)
echo.

REM Check if PORT is set, default to 7000 (from config.env)
if not defined PORT (
    set PORT=7000
)

echo Starting backend server on port %PORT%...
echo.
echo Backend will be available at:
echo http://localhost:%PORT%
echo.
echo API Documentation:
echo - Blockchain endpoints: /api/blockchain/*
echo - Business management: /api/business/*  
echo - KYC verification: /api/kyc/*
echo - Admin dashboard: /api/admin/*
echo.
echo Press Ctrl+C to stop the server
echo ============================================
echo.

REM Start the backend with production settings
cd backend
node src/backend.js

REM If we get here, the server has stopped
echo.
echo ============================================
echo Backend server has stopped
echo Check logs/ directory for error details
echo ============================================
pause