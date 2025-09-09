const KYCService = require('../../../src/services/kycService');
const User = require('../../../src/models/User');

jest.mock('../../../src/models/User');
jest.mock('../../../src/services/rampService');

describe('KYCService', () => {
  let kycService;
  let mockRampService;

  beforeEach(() => {
    kycService = new KYCService();
    mockRampService = {
      initiateKYC: jest.fn(),
      initiateKYCMoonPayBackup: jest.fn(),
      handleKYCWebhook: jest.fn()
    };
    kycService.rampService = mockRampService;
    jest.clearAllMocks();
  });

  describe('initiateKYCForInvestmentToken', () => {
    test('should initiate KYC for investment token conversion', async () => {
      const userData = {
        userId: 'test-user-id',
        email: 'test@example.com',
        walletAddress: 'test-wallet-address'
      };

      User.findById.mockResolvedValue({
        kyc: { status: 'unverified' }
      });

      mockRampService.initiateKYC.mockResolvedValue({
        sessionId: 'test-session-id',
        verificationURL: 'https://test-verification-url.com'
      });

      jest.spyOn(kycService, 'updateUserKYCRecord').mockResolvedValue();

      const result = await kycService.initiateKYCForInvestmentToken(userData);
      
      expect(result).toHaveProperty('provider', 'ramp');
      expect(result).toHaveProperty('sessionId', 'test-session-id');
      expect(mockRampService.initiateKYC).toHaveBeenCalledWith(userData);
    });

    test('should return early if user already verified', async () => {
      const userData = {
        userId: 'test-user-id',
        email: 'test@example.com',
        walletAddress: 'test-wallet-address'
      };

      User.findById.mockResolvedValue({
        kyc: { 
          status: 'verified',
          provider: 'ramp',
          rampCustomerId: 'existing-customer-id'
        }
      });

      const result = await kycService.initiateKYCForInvestmentToken(userData);
      
      expect(result.alreadyVerified).toBe(true);
      expect(result.status).toBe('verified');
    });

    test('should fallback to MoonPay if Ramp fails', async () => {
      const userData = {
        userId: 'test-user-id',
        email: 'test@example.com',
        walletAddress: 'test-wallet-address'
      };

      User.findById.mockResolvedValue({
        kyc: { status: 'unverified' }
      });

      mockRampService.initiateKYC.mockRejectedValue(new Error('Ramp unavailable'));
      mockRampService.initiateKYCMoonPayBackup.mockResolvedValue({
        sessionId: 'moonpay-session-id',
        verificationURL: 'https://moonpay-verification.com'
      });

      jest.spyOn(kycService, 'updateUserKYCRecord').mockResolvedValue();

      const result = await kycService.initiateKYCForInvestmentToken(userData);
      
      expect(result).toHaveProperty('provider', 'moonpay');
      expect(result).toHaveProperty('sessionId', 'moonpay-session-id');
    });
  });

  describe('handleVerificationWebhook', () => {
    test('should process Ramp webhook correctly', async () => {
      const webhookData = {
        sessionId: 'test-session-id',
        status: 'completed',
        userId: 'test-user-id'
      };

      mockRampService.handleKYCWebhook.mockResolvedValue({
        sessionId: 'test-session-id',
        status: 'verified',
        cost: 0.50,
        completedAt: new Date()
      });

      User.findOneAndUpdate.mockResolvedValue();

      const result = await kycService.handleVerificationWebhook(webhookData, 'ramp');
      
      expect(result.success).toBe(true);
      expect(result.status).toBe('verified');
      expect(result.provider).toBe('ramp');
    });

    test('should process MoonPay webhook correctly', async () => {
      const webhookData = {
        sessionId: 'moonpay-session-id',
        status: 'completed',
        userId: 'test-user-id'
      };

      User.findOneAndUpdate.mockResolvedValue();

      const result = await kycService.handleVerificationWebhook(webhookData, 'moonpay');
      
      expect(result.success).toBe(true);
      expect(result.status).toBe('verified');
      expect(result.provider).toBe('moonpay');
    });
  });

  describe('checkInvestmentTokenEligibility', () => {
    test('should return eligible for verified users', async () => {
      User.findById.mockResolvedValue({
        kyc: {
          status: 'verified',
          provider: 'ramp',
          verifiedAt: new Date()
        }
      });

      const result = await kycService.checkInvestmentTokenEligibility('test-user-id');
      
      expect(result.eligible).toBe(true);
      expect(result.kycStatus).toBe('verified');
    });

    test('should return not eligible for unverified users', async () => {
      User.findById.mockResolvedValue({
        kyc: {
          status: 'unverified'
        }
      });

      const result = await kycService.checkInvestmentTokenEligibility('test-user-id');
      
      expect(result.eligible).toBe(false);
      expect(result.reason).toBe('KYC verification required for investment token conversion');
      expect(result.kycRequired).toBe(true);
    });

    test('should handle user not found', async () => {
      User.findById.mockResolvedValue(null);

      const result = await kycService.checkInvestmentTokenEligibility('invalid-user-id');
      
      expect(result.eligible).toBe(false);
      expect(result.reason).toBe('User not found');
    });
  });

  describe('getKYCStatistics', () => {
    test('should return KYC statistics', async () => {
      const mockStats = [{
        statsByStatus: [
          { status: 'verified', count: 10, totalCost: 5.00 },
          { status: 'unverified', count: 15, totalCost: 0 }
        ],
        totalVerified: 10,
        totalCost: 5.00
      }];

      User.aggregate.mockResolvedValue(mockStats);

      const result = await kycService.getKYCStatistics();
      
      expect(result.totalVerified).toBe(10);
      expect(result.totalCost).toBe(5.00);
      expect(result.costPerVerification).toBe(0.50);
      expect(result.estimatedAnnualCost).toBe(273.75);
      expect(result.providers.primary).toBe('ramp');
      expect(result.providers.backup).toBe('moonpay');
    });

    test('should handle empty statistics', async () => {
      User.aggregate.mockResolvedValue([]);

      const result = await kycService.getKYCStatistics();
      
      expect(result.totalVerified).toBe(0);
      expect(result.totalCost).toBe(0);
      expect(result.statsByStatus).toEqual([]);
    });
  });

  describe('updateUserKYCRecord', () => {
    test('should update user KYC record', async () => {
      const kycData = {
        status: 'verified',
        provider: 'ramp',
        verificationCost: 0.50
      };

      User.findByIdAndUpdate.mockResolvedValue();

      await kycService.updateUserKYCRecord('test-user-id', kycData);
      
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
        'test-user-id',
        {
          'kyc.status': 'verified',
          'kyc.provider': 'ramp',
          'kyc.verificationCost': 0.50
        }
      );
    });

    test('should handle update errors', async () => {
      const kycData = { status: 'verified' };

      User.findByIdAndUpdate.mockRejectedValue(new Error('Database error'));

      await expect(kycService.updateUserKYCRecord('test-user-id', kycData))
        .rejects.toThrow('Database error');
    });
  });
});

// Mock setup for Jest
beforeAll(() => {
  // Mock environment variables for binary KYC system
  process.env.RAMP_WEBHOOK_SECRET = 'test-ramp-webhook-secret';
  process.env.MOONPAY_WEBHOOK_SECRET = 'test-moonpay-webhook-secret';
});