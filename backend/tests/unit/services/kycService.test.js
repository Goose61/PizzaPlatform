const KYCService = require('../../../src/services/kycService');

describe('KYCService', () => {
  let kycService;

  beforeEach(() => {
    kycService = new KYCService();
  });

  describe('getRequirementsForTier', () => {
    test('should return tier1 requirements', () => {
      const requirements = kycService.getRequirementsForTier('tier1');
      
      expect(requirements).toHaveProperty('email', true);
      expect(requirements).toHaveProperty('phone', true);
      expect(requirements).toHaveProperty('personalInfo');
      expect(requirements.personalInfo).toHaveProperty('fullName', true);
      expect(requirements.personalInfo).toHaveProperty('dateOfBirth', true);
      expect(requirements.personalInfo).toHaveProperty('address', true);
      expect(requirements).toHaveProperty('documents', []);
      expect(requirements).toHaveProperty('liveness', false);
      expect(requirements).toHaveProperty('maxDailyAmount', 1000);
    });

    test('should return tier2 requirements', () => {
      const requirements = kycService.getRequirementsForTier('tier2');
      
      expect(requirements).toHaveProperty('email', true);
      expect(requirements).toHaveProperty('phone', true);
      expect(requirements).toHaveProperty('personalInfo');
      expect(requirements.personalInfo).toHaveProperty('fullName', true);
      expect(requirements.personalInfo).toHaveProperty('dateOfBirth', true);
      expect(requirements.personalInfo).toHaveProperty('address', true);
      expect(requirements.personalInfo).toHaveProperty('ssn', true);
      expect(requirements).toHaveProperty('documents');
      expect(requirements.documents).toContain('government_id');
      expect(requirements.documents).toContain('proof_of_address');
      expect(requirements).toHaveProperty('liveness', true);
      expect(requirements).toHaveProperty('maxDailyAmount', 10000);
    });

    test('should return tier1 requirements for invalid tier', () => {
      const requirements = kycService.getRequirementsForTier('invalid');
      
      expect(requirements).toHaveProperty('maxDailyAmount', 1000);
    });
  });

  describe('createMockKYCSession', () => {
    test('should create valid mock KYC session', () => {
      const userId = 'test-user-id';
      const tier = 'tier2';
      const requirements = kycService.getRequirementsForTier(tier);
      
      const session = kycService.createMockKYCSession(userId, tier, requirements);
      
      expect(session).toHaveProperty('sessionId');
      expect(session.sessionId).toMatch(/^kyc_\d+_[a-z0-9]{9}$/);
      expect(session).toHaveProperty('tier', tier);
      expect(session).toHaveProperty('requirements', requirements);
      expect(session).toHaveProperty('status', 'initiated');
      expect(session).toHaveProperty('steps');
      expect(Array.isArray(session.steps)).toBe(true);
      expect(session.steps).toHaveLength(4);
      expect(session).toHaveProperty('expiresAt');
      expect(session.expiresAt).toBeInstanceOf(Date);
      expect(session).toHaveProperty('webhook');
      expect(session.webhook).toContain(session.sessionId);
    });

    test('should create session with correct steps for tier1', () => {
      const userId = 'test-user-id';
      const tier = 'tier1';
      const requirements = kycService.getRequirementsForTier(tier);
      
      const session = kycService.createMockKYCSession(userId, tier, requirements);
      
      const documentStep = session.steps.find(step => step.step === 'document_upload');
      const livenessStep = session.steps.find(step => step.step === 'liveness_check');
      
      expect(documentStep.required).toBe(false); // No documents required for tier1
      expect(livenessStep.required).toBe(false); // No liveness check for tier1
    });

    test('should create session with correct steps for tier2', () => {
      const userId = 'test-user-id';
      const tier = 'tier2';
      const requirements = kycService.getRequirementsForTier(tier);
      
      const session = kycService.createMockKYCSession(userId, tier, requirements);
      
      const documentStep = session.steps.find(step => step.step === 'document_upload');
      const livenessStep = session.steps.find(step => step.step === 'liveness_check');
      
      expect(documentStep.required).toBe(true); // Documents required for tier2
      expect(livenessStep.required).toBe(true); // Liveness check required for tier2
    });
  });

  describe('validateMockUserData', () => {
    test('should validate complete user data', () => {
      const userData = {
        fullName: 'John Doe',
        dateOfBirth: '1990-01-01',
        address: '123 Main Street, Anytown, ST 12345',
        phone: '+1-555-123-4567'
      };
      
      const isValid = kycService.validateMockUserData(userData);
      expect(isValid).toBe(true);
    });

    test('should reject incomplete user data', () => {
      const userData = {
        fullName: 'Jo', // Too short
        dateOfBirth: '2010-01-01', // Too young
        address: '123 Main', // Too short
        phone: '555' // Invalid format
      };
      
      const isValid = kycService.validateMockUserData(userData);
      expect(isValid).toBe(false);
    });

    test('should reject missing required fields', () => {
      const userData = {
        fullName: 'John Doe'
        // Missing other required fields
      };
      
      const isValid = kycService.validateMockUserData(userData);
      expect(isValid).toBe(false);
    });
  });

  describe('calculateAge', () => {
    test('should calculate correct age', () => {
      const birthDate = '1990-01-01';
      const age = kycService.calculateAge(birthDate);
      
      const expectedAge = new Date().getFullYear() - 1990;
      expect(age).toBe(expectedAge);
    });

    test('should handle birthday not yet occurred this year', () => {
      const currentDate = new Date();
      const nextYear = currentDate.getFullYear() + 1;
      const futureBirthDate = `${nextYear}-12-31`;
      
      const age = kycService.calculateAge(futureBirthDate);
      expect(age).toBeLessThan(0);
    });
  });

  describe('checkTransactionLimits', () => {
    test('should allow transaction within limits', () => {
      const result = kycService.checkTransactionLimits('tier1', 500, 0);
      
      expect(result.allowed).toBe(true);
      expect(result.tier).toBe('tier1');
      expect(result.dailyLimit).toBe(1000);
      expect(result.remaining).toBe(1000);
      expect(result.exceedsBy).toBe(0);
      expect(result.requiresUpgrade).toBe(false);
    });

    test('should reject transaction exceeding limits', () => {
      const result = kycService.checkTransactionLimits('tier1', 1500, 0);
      
      expect(result.allowed).toBe(false);
      expect(result.tier).toBe('tier1');
      expect(result.dailyLimit).toBe(1000);
      expect(result.remaining).toBe(1000);
      expect(result.exceedsBy).toBe(500);
      expect(result.requiresUpgrade).toBe(true);
    });

    test('should handle cumulative daily spending', () => {
      const result = kycService.checkTransactionLimits('tier1', 300, 800);
      
      expect(result.allowed).toBe(false);
      expect(result.dailySpent).toBe(800);
      expect(result.remaining).toBe(200);
      expect(result.exceedsBy).toBe(100);
    });

    test('should not suggest upgrade for tier2', () => {
      const result = kycService.checkTransactionLimits('tier2', 15000, 0);
      
      expect(result.allowed).toBe(false);
      expect(result.requiresUpgrade).toBe(false); // Already highest tier
    });

    test('should handle unverified users', () => {
      const result = kycService.checkTransactionLimits(null, 50, 0);
      
      expect(result.tier).toBe('unverified');
      expect(result.dailyLimit).toBe(100);
      expect(result.allowed).toBe(true);
    });
  });

  describe('getComplianceStatus', () => {
    test('should return good status for low utilization', () => {
      const status = kycService.getComplianceStatus('tier1', 100);
      
      expect(status.status).toBe('good');
      expect(status.message).toBe('Account in good standing');
      expect(status.tier).toBe('tier1');
      expect(status.dailyLimit).toBe(1000);
      expect(status.utilization).toBe(10);
      expect(status.canUpgrade).toBe(true);
      expect(status.nextTierLimit).toBe(10000);
    });

    test('should return warning status for high utilization', () => {
      const status = kycService.getComplianceStatus('tier1', 950);
      
      expect(status.status).toBe('warning');
      expect(status.message).toBe('Approaching daily limit');
      expect(status.utilization).toBe(95);
    });

    test('should return exceeded status for over limit', () => {
      const status = kycService.getComplianceStatus('tier1', 1100);
      
      expect(status.status).toBe('exceeded');
      expect(status.message).toBe('Daily limit exceeded');
      expect(status.utilization).toBe(110);
    });

    test('should not allow upgrade for tier2', () => {
      const status = kycService.getComplianceStatus('tier2', 5000);
      
      expect(status.canUpgrade).toBe(false);
      expect(status.nextTierLimit).toBeNull();
    });
  });

  describe('generateComplianceReport', () => {
    test('should generate basic compliance report', () => {
      const userId = 'test-user-id';
      const transactionHistory = [
        { amount: 100, type: 'payment' },
        { amount: 200, type: 'payment' },
        { amount: 15000, type: 'payment' }
      ];
      
      const report = kycService.generateComplianceReport(userId, transactionHistory);
      
      expect(report).toHaveProperty('userId', userId);
      expect(report).toHaveProperty('generatedAt');
      expect(report.generatedAt).toBeInstanceOf(Date);
      expect(report).toHaveProperty('period');
      expect(report.period).toHaveProperty('start');
      expect(report.period).toHaveProperty('end');
      expect(report).toHaveProperty('metrics');
      expect(report.metrics).toHaveProperty('totalTransactions', 3);
      expect(report.metrics).toHaveProperty('totalVolume', 15300);
      expect(report.metrics).toHaveProperty('averageTransaction', 5100);
      expect(report.metrics).toHaveProperty('maxTransaction', 15000);
      expect(report).toHaveProperty('riskScore');
      expect(report).toHaveProperty('recommendations');
    });

    test('should calculate risk score correctly', () => {
      const userId = 'test-user-id';
      const highRiskTransactions = Array(10).fill({ amount: 15000, type: 'payment' });
      
      const report = kycService.generateComplianceReport(userId, highRiskTransactions);
      
      expect(report.riskScore).toBeGreaterThan(50);
      expect(report.recommendations.length).toBeGreaterThan(0);
    });

    test('should handle empty transaction history', () => {
      const userId = 'test-user-id';
      const transactionHistory = [];
      
      const report = kycService.generateComplianceReport(userId, transactionHistory);
      
      expect(report.metrics.totalTransactions).toBe(0);
      expect(report.metrics.totalVolume).toBe(0);
      expect(report.metrics.averageTransaction).toBe(0);
      expect(report.metrics.maxTransaction).toBe(0);
      expect(report.riskScore).toBe(0);
    });
  });
});

// Mock setup for Jest
beforeAll(() => {
  // Mock environment variables
  process.env.KYC_PROVIDER = 'synapse';
  process.env.KYC_SANDBOX = 'true';
  process.env.MAX_DAILY_AMOUNT_TIER1 = '1000';
  process.env.MAX_DAILY_AMOUNT_TIER2 = '10000';
});