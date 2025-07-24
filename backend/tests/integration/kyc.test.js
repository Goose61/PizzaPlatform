const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../src/backend');
const User = require('../../src/models/User');

describe('KYC API Integration Tests', () => {
  let testUser;
  let sessionCookie;

  beforeAll(async () => {
    // Connect to test database
    await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/pizza-platform-test');
  });

  afterAll(async () => {
    // Clean up and close database connection
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    // Create test user
    testUser = new User({
      email: 'kyc-test@example.com',
      passwordHash: await User.hashPassword('TestPassword123!'),
      isEmailVerified: true,
      isActive: true
    });
    await testUser.save();

    // Login and get session cookie
    const loginResponse = await request(app)
      .post('/api/login')
      .send({
        email: 'kyc-test@example.com',
        password: 'TestPassword123!'
      });

    sessionCookie = loginResponse.headers['set-cookie'];
  });

  afterEach(async () => {
    // Clean up test data
    await User.deleteMany({});
  });

  describe('POST /api/kyc/initiate', () => {
    test('should initiate KYC process successfully', async () => {
      const response = await request(app)
        .post('/api/kyc/initiate')
        .set('Cookie', sessionCookie)
        .send({
          tier: 'tier1',
          personalInfo: {
            fullName: 'John Doe',
            dateOfBirth: '1990-01-01',
            address: '123 Main Street, Anytown, ST 12345',
            phone: '+1-555-123-4567'
          }
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'KYC verification initiated successfully');
      expect(response.body).toHaveProperty('sessionId');
      expect(response.body.sessionId).toMatch(/^kyc_\d+_[a-z0-9]{9}$/);
      expect(response.body).toHaveProperty('requirements');
      expect(response.body).toHaveProperty('steps');
      expect(response.body).toHaveProperty('expiresAt');

      // Check user was updated
      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.kycVerificationId).toBe(response.body.sessionId);
      expect(updatedUser.kycStatus).toBe('pending');
    });

    test('should reject invalid tier', async () => {
      const response = await request(app)
        .post('/api/kyc/initiate')
        .set('Cookie', sessionCookie)
        .send({
          tier: 'invalid-tier',
          personalInfo: {
            fullName: 'John Doe',
            dateOfBirth: '1990-01-01',
            address: '123 Main Street',
            phone: '+1-555-123-4567'
          }
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Invalid tier. Must be tier1 or tier2');
    });

    test('should reject missing personal info', async () => {
      const response = await request(app)
        .post('/api/kyc/initiate')
        .set('Cookie', sessionCookie)
        .send({
          tier: 'tier1'
          // Missing personalInfo
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Tier and personal information are required');
    });

    test('should require authentication', async () => {
      const response = await request(app)
        .post('/api/kyc/initiate')
        .send({
          tier: 'tier1',
          personalInfo: {
            fullName: 'John Doe',
            dateOfBirth: '1990-01-01',
            address: '123 Main Street',
            phone: '+1-555-123-4567'
          }
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Authentication required');
    });
  });

  describe('GET /api/kyc/status', () => {
    test('should return KYC status for user', async () => {
      // Set up user with KYC data
      testUser.kycTier = 'tier1';
      testUser.kycStatus = 'verified';
      testUser.kycVerificationId = 'test-verification-id';
      testUser.kycDocuments = [{
        type: 'government_id',
        url: '/uploads/test-doc.jpg',
        status: 'approved',
        uploadedAt: new Date()
      }];
      await testUser.save();

      const response = await request(app)
        .get('/api/kyc/status')
        .set('Cookie', sessionCookie);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('kycTier', 'tier1');
      expect(response.body).toHaveProperty('kycStatus', 'verified');
      expect(response.body).toHaveProperty('verificationId', 'test-verification-id');
      expect(response.body).toHaveProperty('documents');
      expect(response.body.documents).toHaveLength(1);
      expect(response.body).toHaveProperty('compliance');
      expect(response.body.compliance).toHaveProperty('status');
      expect(response.body.compliance).toHaveProperty('tier');
      expect(response.body.compliance).toHaveProperty('dailyLimit');
    });

    test('should return default status for unverified user', async () => {
      const response = await request(app)
        .get('/api/kyc/status')
        .set('Cookie', sessionCookie);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('kycTier', 'unverified');
      expect(response.body).toHaveProperty('kycStatus', 'unverified');
      expect(response.body).toHaveProperty('verificationId', null);
      expect(response.body).toHaveProperty('documents', []);
    });

    test('should require authentication', async () => {
      const response = await request(app)
        .get('/api/kyc/status');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Authentication required');
    });
  });

  describe('PUT /api/kyc/tier-upgrade', () => {
    test('should initiate tier upgrade successfully', async () => {
      // Start with tier1 user
      testUser.kycTier = 'tier1';
      testUser.kycStatus = 'verified';
      await testUser.save();

      const response = await request(app)
        .put('/api/kyc/tier-upgrade')
        .set('Cookie', sessionCookie)
        .send({
          targetTier: 'tier2',
          personalInfo: {
            fullName: 'John Doe',
            dateOfBirth: '1990-01-01',
            address: '123 Main Street, Anytown, ST 12345',
            phone: '+1-555-123-4567'
          }
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Tier upgrade initiated successfully');
      expect(response.body).toHaveProperty('sessionId');
      expect(response.body).toHaveProperty('currentTier', 'tier1');
      expect(response.body).toHaveProperty('targetTier', 'tier2');
      expect(response.body).toHaveProperty('requirements');
      expect(response.body).toHaveProperty('steps');

      // Check user status was updated
      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.kycStatus).toBe('pending');
      expect(updatedUser.kycNotes).toBe('Tier upgrade to tier2 requested');
    });

    test('should reject downgrade attempt', async () => {
      // Start with tier2 user
      testUser.kycTier = 'tier2';
      testUser.kycStatus = 'verified';
      await testUser.save();

      const response = await request(app)
        .put('/api/kyc/tier-upgrade')
        .set('Cookie', sessionCookie)
        .send({
          targetTier: 'tier1'
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Cannot downgrade or upgrade to same tier');
    });

    test('should reject upgrade when verification is pending', async () => {
      testUser.kycStatus = 'pending';
      await testUser.save();

      const response = await request(app)
        .put('/api/kyc/tier-upgrade')
        .set('Cookie', sessionCookie)
        .send({
          targetTier: 'tier1'
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'KYC verification already in progress');
    });

    test('should require authentication', async () => {
      const response = await request(app)
        .put('/api/kyc/tier-upgrade')
        .send({
          targetTier: 'tier2'
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Authentication required');
    });
  });

  describe('GET /api/kyc/requirements/:tier', () => {
    test('should return tier1 requirements', async () => {
      const response = await request(app)
        .get('/api/kyc/requirements/tier1')
        .set('Cookie', sessionCookie);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('tier', 'tier1');
      expect(response.body).toHaveProperty('requirements');
      expect(response.body.requirements).toHaveProperty('email', true);
      expect(response.body.requirements).toHaveProperty('phone', true);
      expect(response.body.requirements).toHaveProperty('personalInfo');
      expect(response.body.requirements).toHaveProperty('documents', []);
      expect(response.body.requirements).toHaveProperty('liveness', false);
      expect(response.body.requirements).toHaveProperty('maxDailyAmount', 1000);
      expect(response.body).toHaveProperty('description');
    });

    test('should return tier2 requirements', async () => {
      const response = await request(app)
        .get('/api/kyc/requirements/tier2')
        .set('Cookie', sessionCookie);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('tier', 'tier2');
      expect(response.body).toHaveProperty('requirements');
      expect(response.body.requirements).toHaveProperty('documents');
      expect(response.body.requirements.documents).toContain('government_id');
      expect(response.body.requirements.documents).toContain('proof_of_address');
      expect(response.body.requirements).toHaveProperty('liveness', true);
      expect(response.body.requirements).toHaveProperty('maxDailyAmount', 10000);
    });

    test('should reject invalid tier', async () => {
      const response = await request(app)
        .get('/api/kyc/requirements/invalid-tier')
        .set('Cookie', sessionCookie);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Invalid tier');
    });

    test('should require authentication', async () => {
      const response = await request(app)
        .get('/api/kyc/requirements/tier1');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Authentication required');
    });
  });

  describe('POST /api/kyc/simulate-verification', () => {
    test('should simulate verification successfully in test environment', async () => {
      // Set up user with pending KYC
      const sessionId = 'test-session-id';
      testUser.kycVerificationId = sessionId;
      testUser.kycStatus = 'pending';
      await testUser.save();

      const response = await request(app)
        .post('/api/kyc/simulate-verification')
        .set('Cookie', sessionCookie)
        .send({
          sessionId,
          userData: {
            fullName: 'John Doe',
            dateOfBirth: '1990-01-01',
            address: '123 Main Street, Anytown, ST 12345',
            phone: '+1-555-123-4567',
            targetTier: 'tier1'
          }
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Verification simulation completed');
      expect(response.body).toHaveProperty('result');
      expect(response.body.result).toHaveProperty('sessionId', sessionId);
      expect(response.body.result).toHaveProperty('status');
      expect(['approved', 'rejected']).toContain(response.body.result.status);

      // Check user was updated
      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.kycStatus).toBe(response.body.result.status);
      expect(updatedUser.kycNotes).toContain('Simulation:');
    });

    test('should reject invalid session', async () => {
      const response = await request(app)
        .post('/api/kyc/simulate-verification')
        .set('Cookie', sessionCookie)
        .send({
          sessionId: 'invalid-session',
          userData: {
            fullName: 'John Doe',
            dateOfBirth: '1990-01-01',
            address: '123 Main Street',
            phone: '+1-555-123-4567'
          }
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Invalid session');
    });

    test('should require authentication', async () => {
      const response = await request(app)
        .post('/api/kyc/simulate-verification')
        .send({
          sessionId: 'test-session',
          userData: {}
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Authentication required');
    });
  });

  describe('POST /api/kyc/webhook/:sessionId', () => {
    test('should process webhook successfully', async () => {
      const sessionId = 'test-session-id';
      testUser.kycVerificationId = sessionId;
      testUser.kycStatus = 'pending';
      await testUser.save();

      const webhookData = {
        status: 'approved',
        tier: 'tier1',
        reasons: [],
        score: 85,
        documents: [{
          type: 'government_id',
          status: 'approved'
        }]
      };

      const response = await request(app)
        .post(`/api/kyc/webhook/${sessionId}`)
        .send(webhookData);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Webhook processed successfully');

      // Check user was updated
      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.kycStatus).toBe('approved');
      expect(updatedUser.kycTier).toBe('tier1');
    });

    test('should handle webhook for unknown session', async () => {
      const response = await request(app)
        .post('/api/kyc/webhook/unknown-session')
        .send({
          status: 'approved',
          tier: 'tier1'
        });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Session not found');
    });
  });
});

// Test environment setup
process.env.NODE_ENV = 'test';
process.env.KYC_SANDBOX = 'true';