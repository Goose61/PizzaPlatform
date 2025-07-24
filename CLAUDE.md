# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

The Pizza Platform is a sophisticated Solana-based payment and loyalty ecosystem with enterprise-grade security features. It functions as both a crypto payment processor and a comprehensive business management platform with KYC/AML compliance, rewards systems, and analytics.

## Development Commands

```bash
# Development
npm run dev                    # Start development server with nodemon
npm start                     # Start production server

# Testing
npm test                      # Run all tests with Jest
npm run test:watch           # Run tests in watch mode
npm run test:coverage        # Generate test coverage report

# Single test execution
npm test -- --testPathPattern=kycService.test.js
npm test -- --testNamePattern="should validate complete user data"
```

## Architecture Overview

### Core Application Structure

**Backend (`backend/src/`)**: Express.js server with sophisticated security middleware
- Entry point: `backend.js` - handles authentication, session management, and security
- Environment validation enforces 11 required variables (no fallbacks for security)
- Comprehensive rate limiting, 2FA, account lockouts, and audit logging

**Models**: Mongoose schemas with advanced features
- `User.js`: Full KYC workflow, tiered verification, security event tracking
- `Business.js`: Complete business registration with loyalty vault configuration  
- `Transaction.js`: Blockchain transaction management and status tracking
- `Wallet.js`: Encrypted wallet storage and key management

**Services Architecture**: Business logic separation
- `solanaService.js`: Solana blockchain integration with Jupiter DEX for atomic swaps
- `walletService.js`: Secure wallet creation, encryption, and transaction signing
- `kycService.js`: Tiered KYC verification with document processing
- `rewardsService.js`: Token reward calculation and staking system
- `analyticsService.js`: Business metrics and customer insights
- `complianceService.js`: AML monitoring and SAR generation

**API Routes**: RESTful endpoints with validation
- `/api/blockchain/*`: Solana operations, QR payments, token swaps
- `/api/kyc/*`: Document upload, verification status, tier upgrades
- `/api/business/*`: Business registration, analytics, withdrawal requests
- `/api/admin/*`: User management, system administration

### Frontend Structure

**Multi-Dashboard System**:
- `frontend/public/index.html`: Main landing page with Google Maps integration
- `frontend/src/pages/user-dashboard.html`: Complete wallet interface with trading
- `frontend/src/pages/admin-dashboard.html`: Business management and analytics

### Key Architectural Patterns

**Security-First Design**: All endpoints require authentication, most require 2FA
- Session-based auth with MongoDB store
- JWT tokens for API access
- Comprehensive input validation and sanitization
- Rate limiting per endpoint type (auth: 5/15min, blockchain: 50/15min)

**Blockchain Integration**: Solana-native with enterprise patterns
- Custodial wallet management with encrypted key storage
- Atomic SPL token to USDC swaps via Jupiter aggregator
- QR-based payment system for point-of-sale integration
- Real-time transaction status tracking

**Compliance Framework**: Built-in AML/KYC monitoring
- Tiered verification system (unverified/tier1/tier2)
- Transaction limit enforcement based on KYC status
- Automated suspicious activity detection and reporting
- Document processing pipeline with OCR capabilities

## Environment Configuration

Required environment variables (application will exit if missing):
- Authentication: `SESSION_SECRET`, `JWT_SECRET`, `ADMIN_JWT_SECRET`
- Database: `MONGODB_URI`
- Email: `EMAIL_USER`, `EMAIL_PASS` 
- Blockchain: `SOLANA_RPC_ENDPOINT`, `WALLET_MASTER_KEY`, `SPL_TOKEN_MINT`, `PIZZA_TOKEN_MINT`
- External APIs: `GOOGLE_MAPS_API_KEY`

Configuration files checked in order: `config.env`, `.env`

## Testing Strategy

**Test Structure**: Jest with Supertest for API testing
- Unit tests: `backend/tests/unit/services/`
- Integration tests: `backend/tests/integration/`
- Test environment setup: `backend/tests/setup.js`
- Coverage target: `backend/src/**/*.js` (excluding main server file)

**Test Database**: Separate MongoDB instance required
- Environment: `MONGODB_TEST_URI` 
- Automatic cleanup between tests
- Mocked external services (KYC providers, email)

## Security Considerations

**Self-Hosted Design**: Built for Ubuntu 22.04 server deployment
- No external dependencies for core functionality
- Local file storage with encryption for documents
- Comprehensive audit logging for compliance

**Production Security**: Enterprise-grade implementations
- bcrypt with configurable rounds (default: 12)
- Account lockouts after 5 failed attempts (30min duration)
- Security event tracking with correlation IDs
- Password blacklist validation against common passwords

## Business Logic Flow

**Payment Processing**: 
1. User scans QR code → Backend validates → Solana transaction
2. Automatic SPL to USDC conversion via Jupiter DEX
3. USDC credited to business wallet (volatility protection)
4. Reward tokens distributed to customer

**KYC Workflow**:
1. User initiates tier upgrade → Document upload → OCR processing
2. Manual/automated verification → Status webhook handling
3. Transaction limits updated based on tier completion

**Business Operations**:
1. Business registration → KYC verification → Loyalty vault setup
2. Analytics dashboard → USDC withdrawal requests → Bank integration

## Integration Points

**Blockchain**: Solana mainnet/devnet with fallback RPC endpoints
**Email Service**: Brevo (Sendinblue) SMTP integration
**Maps**: Google Maps API for business location features
**File Processing**: Multer with local storage, planned OCR integration

## Development Notes

- Winston logging with file rotation for production monitoring
- PM2 process management configuration included
- Nginx reverse proxy setup for production deployment  
- Comprehensive error handling with user-friendly messages
- All database operations use Mongoose with proper indexing