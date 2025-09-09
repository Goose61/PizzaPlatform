// Global test setup
const mongoose = require('mongoose');

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/pizza-platform-test';
process.env.SESSION_SECRET = 'test-session-secret';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.ADMIN_JWT_SECRET = 'test-admin-jwt-secret';
process.env.EMAIL_USER = 'test@example.com';
process.env.EMAIL_PASS = 'test-password';
process.env.GOOGLE_MAPS_API_KEY = 'test-maps-key';
process.env.SOLANA_RPC_ENDPOINT = 'https://api.devnet.solana.com';
process.env.WALLET_MASTER_KEY = 'test-wallet-master-key';
process.env.SPL_TOKEN_MINT = '11111111111111111111111111111112'; // Valid base58 PublicKey
process.env.PIZZA_TOKEN_MINT = '11111111111111111111111111111113'; // Valid base58 PublicKey
process.env.USDC_MINT = '11111111111111111111111111111114'; // Valid base58 PublicKey  
process.env.PLATFORM_VAULT_ADDRESS = '11111111111111111111111111111115'; // Valid base58 PublicKey
process.env.KYC_PROVIDER = 'synapse';
process.env.KYC_SANDBOX = 'true';
process.env.MAX_DAILY_AMOUNT_TIER1 = '1000';
process.env.MAX_DAILY_AMOUNT_TIER2 = '10000';

// Global test timeout
jest.setTimeout(30000);

// Mock console.log/warn/error to reduce noise during tests
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Global setup
beforeAll(async () => {
  // Ensure mongoose connection is closed before tests
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
});

// Global teardown
afterAll(async () => {
  // Close mongoose connection after all tests
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
});