const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const User = require('../models/User');
const KYCService = require('../services/kycService');
const { requireAuth, require2FA } = require('../middleware/adminAuth');

const router = express.Router();
const kycService = new KYCService();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../../uploads/kyc-documents');
    await fs.mkdir(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const fileExtension = path.extname(file.originalname);
    cb(null, `kyc-${req.session.userId}-${uniqueSuffix}${fileExtension}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 5 // Maximum 5 files per request
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, and PDF files are allowed'));
    }
  }
});

/**
 * @route POST /api/kyc/initiate
 * @desc Start KYC verification process
 * @access Private
 */
router.post('/initiate', requireAuth, async (req, res) => {
  const correlationId = crypto.randomBytes(16).toString('hex');
  
  try {
    const { tier, personalInfo } = req.body;
    
    if (!tier || !personalInfo) {
      return res.status(400).json({
        error: 'Tier and personal information are required'
      });
    }
    
    // Validate tier
    if (!['tier1', 'tier2'].includes(tier)) {
      return res.status(400).json({
        error: 'Invalid tier. Must be tier1 or tier2'
      });
    }
    
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Check if user already has this tier or higher
    if (user.kycTier === tier || 
        (user.kycTier === 'tier2' && tier === 'tier1')) {
      return res.status(400).json({
        error: 'User already has this KYC tier or higher'
      });
    }
    
    // Initiate KYC process
    const kycSession = await kycService.initiateKYC(
      user._id.toString(),
      tier,
      personalInfo
    );
    
    // Update user with KYC session info
    user.kycVerificationId = kycSession.sessionId;
    user.kycStatus = 'pending';
    user.kycTier = 'unverified'; // Will be updated after verification
    await user.save();
    
    console.log(`🔍 KYC initiated for ${user.email} (${tier}) [${correlationId}]`);
    
    res.json({
      message: 'KYC verification initiated successfully',
      sessionId: kycSession.sessionId,
      requirements: kycSession.requirements,
      steps: kycSession.steps,
      expiresAt: kycSession.expiresAt
    });
    
  } catch (error) {
    console.error(`❌ KYC initiation error [${correlationId}]:`, error);
    res.status(500).json({
      error: 'KYC initiation failed',
      correlationId
    });
  }
});

/**
 * @route POST /api/kyc/upload-document
 * @desc Upload KYC verification documents
 * @access Private
 */
router.post('/upload-document', requireAuth, upload.array('documents', 5), async (req, res) => {
  const correlationId = crypto.randomBytes(16).toString('hex');
  
  try {
    const { documentType, sessionId } = req.body;
    
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        error: 'No documents uploaded'
      });
    }
    
    if (!documentType || !sessionId) {
      return res.status(400).json({
        error: 'Document type and session ID are required'
      });
    }
    
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Validate session ID
    if (user.kycVerificationId !== sessionId) {
      return res.status(400).json({
        error: 'Invalid session ID'
      });
    }
    
    // Validate document type
    const validDocTypes = ['government_id', 'passport', 'license', 'utility_bill', 'proof_of_address'];
    if (!validDocTypes.includes(documentType)) {
      return res.status(400).json({
        error: 'Invalid document type'
      });
    }
    
    // Process uploaded files
    const uploadedDocuments = [];
    for (const file of req.files) {
      const document = {
        type: documentType,
        originalName: file.originalname,
        filename: file.filename,
        url: `/uploads/kyc-documents/${file.filename}`,
        size: file.size,
        uploadedAt: new Date(),
        status: 'pending'
      };
      
      uploadedDocuments.push(document);
      
      // Add to user's KYC documents
      if (!user.kycDocuments) {
        user.kycDocuments = [];
      }
      user.kycDocuments.push(document);
    }
    
    await user.save();
    
    console.log(`📄 Documents uploaded for ${user.email}: ${documentType} [${correlationId}]`);
    
    res.json({
      message: 'Documents uploaded successfully',
      documents: uploadedDocuments,
      sessionId
    });
    
  } catch (error) {
    console.error(`❌ Document upload error [${correlationId}]:`, error);
    
    // Clean up uploaded files on error
    if (req.files) {
      for (const file of req.files) {
        try {
          await fs.unlink(file.path);
        } catch (unlinkError) {
          console.error('Failed to cleanup uploaded file:', unlinkError);
        }
      }
    }
    
    res.status(500).json({
      error: 'Document upload failed',
      correlationId
    });
  }
});

/**
 * @route GET /api/kyc/status
 * @desc Get KYC verification status
 * @access Private
 */
router.get('/status', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const complianceStatus = kycService.getComplianceStatus(
      user.kycTier,
      user.dailyTransactionAmount || 0
    );
    
    res.json({
      kycTier: user.kycTier || 'unverified',
      kycStatus: user.kycStatus || 'unverified',
      verificationId: user.kycVerificationId,
      documents: user.kycDocuments || [],
      compliance: complianceStatus,
      notes: user.kycNotes,
      lastUpdate: user.updatedAt
    });
    
  } catch (error) {
    console.error('❌ KYC status error:', error);
    res.status(500).json({
      error: 'Failed to fetch KYC status'
    });
  }
});

/**
 * @route POST /api/kyc/webhook/:sessionId
 * @desc Handle KYC provider webhook notifications
 * @access Public (webhook)
 */
router.post('/webhook/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const correlationId = crypto.randomBytes(16).toString('hex');
  
  try {
    const webhookData = req.body;
    
    // Validate webhook signature (implement based on your KYC provider)
    // const isValidSignature = validateWebhookSignature(req);
    // if (!isValidSignature) {
    //   return res.status(401).json({ error: 'Invalid webhook signature' });
    // }
    
    const user = await User.findOne({ kycVerificationId: sessionId });
    if (!user) {
      console.warn(`🔍 Webhook for unknown session: ${sessionId} [${correlationId}]`);
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Process webhook data
    const { status, tier, reasons, score, documents } = webhookData;
    
    // Update user KYC status
    user.kycStatus = status; // 'approved', 'rejected', 'pending'
    if (status === 'approved' && tier) {
      user.kycTier = tier;
    }
    
    // Update document statuses
    if (documents && user.kycDocuments) {
      documents.forEach(doc => {
        const userDoc = user.kycDocuments.find(ud => 
          ud.type === doc.type || ud.filename === doc.filename
        );
        if (userDoc) {
          userDoc.status = doc.status;
          userDoc.verifiedAt = doc.status === 'approved' ? new Date() : undefined;
        }
      });
    }
    
    // Add notes if verification failed
    if (status === 'rejected' && reasons) {
      user.kycNotes = `Verification rejected: ${reasons.join(', ')}`;
    }
    
    await user.save();
    
    console.log(`🔍 KYC webhook processed for ${user.email}: ${status} [${correlationId}]`);
    
    // Send email notification to user
    // await sendKYCStatusEmail(user, status, tier);
    
    res.json({ message: 'Webhook processed successfully' });
    
  } catch (error) {
    console.error(`❌ KYC webhook error [${correlationId}]:`, error);
    res.status(500).json({
      error: 'Webhook processing failed',
      correlationId
    });
  }
});

/**
 * @route PUT /api/kyc/tier-upgrade
 * @desc Request KYC tier upgrade
 * @access Private
 */
router.put('/tier-upgrade', requireAuth, async (req, res) => {
  const correlationId = crypto.randomBytes(16).toString('hex');
  
  try {
    const { targetTier, personalInfo } = req.body;
    
    if (!targetTier) {
      return res.status(400).json({
        error: 'Target tier is required'
      });
    }
    
    if (!['tier1', 'tier2'].includes(targetTier)) {
      return res.status(400).json({
        error: 'Invalid target tier'
      });
    }
    
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Check if upgrade is valid
    const currentTier = user.kycTier || 'unverified';
    const tierHierarchy = { 'unverified': 0, 'tier1': 1, 'tier2': 2 };
    
    if (tierHierarchy[currentTier] >= tierHierarchy[targetTier]) {
      return res.status(400).json({
        error: 'Cannot downgrade or upgrade to same tier'
      });
    }
    
    // Check if user has pending verification
    if (user.kycStatus === 'pending') {
      return res.status(400).json({
        error: 'KYC verification already in progress'
      });
    }
    
    // Initiate upgrade process
    const kycSession = await kycService.initiateKYC(
      user._id.toString(),
      targetTier,
      personalInfo || {}
    );
    
    // Update user status
    user.kycVerificationId = kycSession.sessionId;
    user.kycStatus = 'pending';
    user.kycNotes = `Tier upgrade to ${targetTier} requested`;
    await user.save();
    
    console.log(`⬆️ KYC tier upgrade requested: ${user.email} → ${targetTier} [${correlationId}]`);
    
    res.json({
      message: 'Tier upgrade initiated successfully',
      sessionId: kycSession.sessionId,
      currentTier,
      targetTier,
      requirements: kycSession.requirements,
      steps: kycSession.steps
    });
    
  } catch (error) {
    console.error(`❌ KYC tier upgrade error [${correlationId}]:`, error);
    res.status(500).json({
      error: 'Tier upgrade failed',
      correlationId
    });
  }
});

/**
 * @route GET /api/kyc/requirements/:tier
 * @desc Get KYC requirements for specific tier
 * @access Private
 */
router.get('/requirements/:tier', requireAuth, async (req, res) => {
  try {
    const { tier } = req.params;
    
    if (!['tier1', 'tier2'].includes(tier)) {
      return res.status(400).json({
        error: 'Invalid tier'
      });
    }
    
    const requirements = kycService.getRequirementsForTier(tier);
    
    res.json({
      tier,
      requirements,
      description: tier === 'tier1' 
        ? 'Basic verification for increased transaction limits'
        : 'Enhanced verification for maximum transaction limits'
    });
    
  } catch (error) {
    console.error('❌ KYC requirements error:', error);
    res.status(500).json({
      error: 'Failed to fetch requirements'
    });
  }
});

/**
 * @route POST /api/kyc/simulate-verification
 * @desc Simulate KYC verification (testing only)
 * @access Private
 */
router.post('/simulate-verification', requireAuth, async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      error: 'Simulation not available in production'
    });
  }
  
  const correlationId = crypto.randomBytes(16).toString('hex');
  
  try {
    const { sessionId, userData } = req.body;
    
    if (!sessionId || !userData) {
      return res.status(400).json({
        error: 'Session ID and user data are required'
      });
    }
    
    const user = await User.findById(req.session.userId);
    if (!user || user.kycVerificationId !== sessionId) {
      return res.status(400).json({
        error: 'Invalid session'
      });
    }
    
    // Simulate verification
    const result = await kycService.simulateVerification(sessionId, userData);
    
    // Update user based on simulation result
    user.kycStatus = result.status;
    if (result.status === 'approved') {
      user.kycTier = result.tier;
    }
    user.kycNotes = result.reasons.length > 0 
      ? `Simulation: ${result.reasons.join(', ')}`
      : 'Simulation: Verification successful';
    
    await user.save();
    
    console.log(`🎭 KYC simulation completed: ${user.email} → ${result.status} [${correlationId}]`);
    
    res.json({
      message: 'Verification simulation completed',
      result
    });
    
  } catch (error) {
    console.error(`❌ KYC simulation error [${correlationId}]:`, error);
    res.status(500).json({
      error: 'Simulation failed',
      correlationId
    });
  }
});

module.exports = router;