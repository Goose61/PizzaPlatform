# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

The Pizza Platform is a unified Solana-based payment system optimized for exactly 10 business partners. The system operates on a shared platform vault model with fixed $15 USDC transactions, distinguishing between NCN (Non-Crypto Native) and CN (Crypto Native) businesses with different fee structures and settlement preferences.

## Development Commands

```bash
# Backend Development
npm run dev                    # Start development server with nodemon
npm start                     # Start production server

# Testing
npm test                      # Run all tests with Jest
npm run test:watch           # Run tests in watch mode
npm run test:coverage        # Generate test coverage report

# Single test execution
npm test -- --testPathPattern=kycService.test.js
npm test -- --testNamePattern="should validate complete user data"

# Frontend Development
start-frontend.bat           # Launch frontend server (tries npx serve, http-server, Python, Node.js)
start-backend.bat           # Start Express.js backend server

# Service Orchestration (Windows)
start-all-services.bat       # Start backend, frontend, and Cloudflare tunnel in separate windows
stop-services.bat            # Stop all Pizza Platform services (Node.js, Cloudflare tunnel)
start-services-advanced.bat  # Advanced service startup with additional monitoring

# Database & Testing Setup
setup-superuser.bat          # Create admin and test accounts in MongoDB Atlas
create-test-business.bat     # Create test CN/NCN business accounts for development

# Production Deployment
NODE_ENV=production npm start  # Production mode with security hardening
```

## Unified Platform Vault System

**Core Economics**: All transactions contribute 1.3% ($0.195 per $15 payment) to unified platform vault
- **Target Revenue**: $72,653.20/year ($7,117.50 per business × 10 partners)
- **Net Profit**: $19,361.35 after $53,291.85 operational costs
- **Surplus**: $23,200.60 annually after reward and gift card distributions

**Business Classifications**:
- **NCN (Non-Crypto Native)**: 2.75% total fees, daily fiat settlement via Ramp
- **CN (Crypto Native)**: 2.30% total fees, USDC retention, optional Kamino staking (4% APY)

## Architecture Overview

### Core Application Structure

**Backend (`backend/src/`)**: Express.js server with unified vault logic
- Entry point: `backend.js` - authentication, session management, security middleware
- Environment validation: 11 required variables (no fallbacks for security)
- Rate limiting: auth (5/15min), blockchain (50/15min), standard (100/15min)

**Models**: Mongoose schemas for unified vault system
- `User.js`: Binary KYC status, investment token holdings, gift card NFTs
- `Business.js`: NCN/CN classification, vault contribution tracking, settlement preferences  
- `Transaction.js`: Fixed $15 USDC structure, Jupiter swap details, unified fee breakdown

**Services Architecture**: Optimized for 10-business ecosystem
- `rampService.js`: Primary KYC provider ($0.50/customer) with MoonPay backup
- `investmentTokenService.js`: Fixed conversion (10 $PIZZA SPL + $0.10 USDC → 1 token)
- `giftCardService.js`: NFT minting (100 cards/month/business, 5 $PIZZA SPL value)
- `businessTypeService.js`: NCN/CN fee calculation and settlement management
- `solanaService.js`: Jupiter DEX integration (0.75% customer-absorbed loss)
- `kycService.js`: Binary verification for investment tokens only (no payment limits)
- `rewardsService.js`: Fixed 0.3 $PIZZA SPL distribution from platform vault
- `vaultService.js`: Kamino protocol integration for CN business staking
- `complianceService.js`: AML monitoring and regulatory reporting

**API Routes**: Fixed payment system endpoints
- `/api/blockchain/*`: $15 USDC payments, Jupiter swaps, investment token conversion
- `/api/kyc/*`: Binary KYC for investment tokens (not required for payments)
- `/api/business/*`: NCN/CN registration, vault analytics, settlement requests
- `/api/admin/*`: Platform vault management, system maintenance

### Frontend Structure

**Multi-Page Dashboard System**:
- `frontend/pages/customer-login.html`: Customer authentication entry point
- `frontend/pages/customer-register.html`: Customer registration with KYC verification
- `frontend/pages/business-login.html`: Business authentication with NCN/CN type selection
- `frontend/pages/platform-admin-dashboard.html` + `.js`: Unified vault analytics and system administration
- `frontend/pages/admin-login.html`: Super admin authentication with 2FA support
- `frontend/pages/transaction-history.html`: Comprehensive transaction viewing with analytics
- `frontend/index.html`: Main landing page with Google Maps business locator

**Dashboard JavaScript Architecture**: Class-based modular design
- `PlatformAdminDashboard`: System-wide analytics, user/business management, vault oversight
- Each dashboard class handles: API integration, authentication, real-time updates, Chart.js visualization

**Frontend Serving**: Multiple deployment options via `start-frontend.bat`
- Attempts npx serve, http-server, Python HTTP server, or Node.js fallback
- Default ports: 3000 (serve), 8080 (http-server), 8000 (Python)

**Windows Service Management**: Batch scripts for complete environment control
- `start-all-services.bat`: Orchestrates backend (port 7000), frontend (port 3000), and Cloudflare tunnel
- `stop-services.bat`: Gracefully terminates all Pizza Platform processes
- Production URLs: app.pizzabit.io (frontend), api.pizzabit.io (backend)

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

**Unified Vault Integration**: GENIUS Act compliant shared vault system
- All businesses contribute 1.3% to unified platform vault (no individual vaults)
- No reliance on stablecoin issuer yields for sustainability
- Optional Kamino staking for CN businesses with transparent yield sharing (50/50 split)
- Platform-funded rewards eliminate business reward funding requirements

## Environment Configuration

**Database Setup**: MongoDB Atlas cloud database
- Update `MONGODB_URI` in `config.env` with your Atlas connection string
- Format: `mongodb+srv://username:password@cluster.mongodb.net/pizzaplatform?retryWrites=true&w=majority`
- Run `setup-superuser.bat` to create admin and test accounts

Required environment variables (application will exit if missing):
- Authentication: `SESSION_SECRET`, `JWT_SECRET`, `ADMIN_JWT_SECRET`
- Database: `MONGODB_URI` (MongoDB Atlas connection string)
- Email: `EMAIL_USER`, `EMAIL_PASS` (Brevo SMTP credentials)
- Blockchain: `SOLANA_RPC_ENDPOINT`, `WALLET_MASTER_KEY`, `SPL_TOKEN_MINT`, `PIZZA_TOKEN_MINT`
- External APIs: `GOOGLE_MAPS_API_KEY`, `RECAPTCHA_SITE_KEY`, `RECAPTCHA_SECRET_KEY`

Optional environment variables for extended services:
- KYC Integration: `KYC_CLIENT_ID`, `KYC_CLIENT_SECRET`, `KYC_WEBHOOK_SECRET`
- Platform Configuration: `PLATFORM_VAULT_ADDRESS`, `KAMINO_PROGRAM_ID`, `PIZZA_INVESTMENT_TOKEN_MINT`
- Service Configuration: `KYC_SANDBOX=true`, development settings

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

**Fixed Payment System** (No KYC Required):
1. All transactions are exactly $15 USDC (no variable amounts)
2. Jupiter DEX atomic swap option ($PIZZA SPL → USDC, 0.75% customer loss)
3. Automatic 0.3 $PIZZA SPL reward distribution from unified vault
4. Fee split: NCN (1.45% platform + 1.3% vault), CN (1% platform + 1.3% vault)

**Investment Token System** (Binary KYC Required):
1. One-time KYC verification via Ramp ($0.50 cost per customer)
2. Fixed conversion: 10 $PIZZA SPL + $0.10 USDC → 1 investment token
3. Governance voting rights (1 token = 1 vote, 1M cap across all users)
4. 10% customer conversion rate projected for financial modeling

**Business Settlement Models**:
- **NCN**: Daily fiat conversion ($1,500 gross → $1,479 net via Ramp fees)
- **CN**: USDC retention with optional Kamino staking (4% APY, 50/50 yield split)
- **Gift Cards**: 100 NFT cards/month/business (5 $PIZZA SPL value, 30-day expiry)

**Platform Economics** (10 Business Partners):
- **Annual Vault Contributions**: $71,175 ($7,117.50 × 10 businesses)
- **Reward Distribution Cost**: $47,974.40 (0.3 $PIZZA SPL × volume)
- **Gift Card Budget**: $6,000 ($600 × 10 businesses)
- **Net Platform Surplus**: $23,200.60 after all distributions

## Integration Points

**Blockchain**: Solana mainnet/devnet with Jupiter DEX and Kamino protocol integration
**Fiat Services**: Ramp (primary) and MoonPay (backup) for KYC verification only
**Email Service**: Brevo (Sendinblue) SMTP for transactional notifications
**Maps**: Google Maps API for business location display on landing page

## Key System Components

**Payment Flow**: `routes/blockchain.js` → `SolanaService` → Jupiter DEX (if needed) → rewards distribution
**Admin Operations**: `routes/admin.js` → `VaultService` → unified platform vault analytics and maintenance
**Business Management**: `routes/business.js` → `BusinessTypeService` → NCN/CN classification → vault contribution setup
**Customer Management**: `routes/customer.js` → User authentication, wallet connection, transaction history
**Email Verification**: `routes/emailVerification.js` → `EmailVerificationService` → Brevo SMTP integration

**Critical Business Rules**:
- All transactions are exactly $15 USDC (no exceptions)
- 1.3% vault contribution is automatic and non-negotiable 
- KYC only required for investment token conversion, not payments
- NCN businesses get automatic daily fiat settlement, CN businesses retain USDC
- Gift cards expire after 30 days, unused value reverts to platform vault

## Superuser Test Accounts

After running `setup-superuser.bat`, use these credentials for testing:
- **Super Admin**: admin@pizzaplatform.com / PizzaAdmin2024! (username: pizzaadmin)
- **Test Customer**: test@customer.com / TestCustomer123!

After running `create-test-business.bat`, additional test accounts are available:
- **NCN Business**: test@ncnbusiness.com / TestBusiness123! (Non-Crypto Native)
- **CN Business**: test@cnbusiness.com / TestBusiness123! (Crypto Native)

## Testing Notes

Jest configuration excludes main `backend.js` server file from coverage. Tests focus on service layer business logic with mocked external integrations. Test database cleanup is automatic via `setup.js`. Security middleware and CORS are configured for development with file:// origin support.