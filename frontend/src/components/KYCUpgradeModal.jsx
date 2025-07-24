import React, { useState, useEffect } from 'react';
import DocumentUpload from './DocumentUpload';
import VerificationStatus from './VerificationStatus';
import TierBenefits from './TierBenefits';

const KYCUpgradeModal = ({ isOpen, onClose, currentTier, onUpgradeComplete }) => {
  const [activeStep, setActiveStep] = useState(1);
  const [selectedTier, setSelectedTier] = useState('tier1');
  const [personalInfo, setPersonalInfo] = useState({
    fullName: '',
    dateOfBirth: '',
    address: '',
    phone: '',
    ssn: ''
  });
  const [sessionId, setSessionId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [requirements, setRequirements] = useState(null);

  useEffect(() => {
    if (isOpen && currentTier === 'unverified') {
      setSelectedTier('tier1');
    } else if (isOpen && currentTier === 'tier1') {
      setSelectedTier('tier2');
    }
  }, [isOpen, currentTier]);

  const steps = [
    { id: 1, title: 'Select Tier', description: 'Choose your verification level' },
    { id: 2, title: 'Personal Info', description: 'Provide your details' },
    { id: 3, title: 'Documents', description: 'Upload required documents' },
    { id: 4, title: 'Verification', description: 'Track your progress' }
  ];

  const handleTierSelection = (tier) => {
    setSelectedTier(tier);
    setActiveStep(2);
  };

  const handlePersonalInfoSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/kyc/initiate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          tier: selectedTier,
          personalInfo
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to initiate KYC process');
      }

      setSessionId(data.sessionId);
      setRequirements(data.requirements);
      setActiveStep(3);

    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDocumentUploadComplete = () => {
    setActiveStep(4);
  };

  const handleClose = () => {
    setActiveStep(1);
    setSessionId(null);
    setError(null);
    setPersonalInfo({
      fullName: '',
      dateOfBirth: '',
      address: '',
      phone: '',
      ssn: ''
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="kyc-modal-overlay">
      <div className="kyc-modal">
        <div className="kyc-modal-header">
          <h2>KYC Tier Upgrade</h2>
          <button className="close-button" onClick={handleClose}>
            <span>&times;</span>
          </button>
        </div>

        {/* Progress Steps */}
        <div className="kyc-steps">
          {steps.map((step) => (
            <div
              key={step.id}
              className={`kyc-step ${activeStep >= step.id ? 'active' : ''} ${
                activeStep > step.id ? 'completed' : ''
              }`}
            >
              <div className="step-number">{step.id}</div>
              <div className="step-content">
                <div className="step-title">{step.title}</div>
                <div className="step-description">{step.description}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="kyc-modal-body">
          {error && (
            <div className="error-message">
              <span className="error-icon">⚠️</span>
              {error}
            </div>
          )}

          {/* Step 1: Tier Selection */}
          {activeStep === 1 && (
            <div className="tier-selection">
              <h3>Choose Your Verification Level</h3>
              <div className="tier-options">
                {currentTier === 'unverified' && (
                  <div
                    className={`tier-option ${selectedTier === 'tier1' ? 'selected' : ''}`}
                    onClick={() => handleTierSelection('tier1')}
                  >
                    <div className="tier-header">
                      <h4>Tier 1 Verification</h4>
                      <span className="tier-badge tier1">Basic</span>
                    </div>
                    <TierBenefits tier="tier1" />
                  </div>
                )}
                
                <div
                  className={`tier-option ${selectedTier === 'tier2' ? 'selected' : ''}`}
                  onClick={() => handleTierSelection('tier2')}
                >
                  <div className="tier-header">
                    <h4>Tier 2 Verification</h4>
                    <span className="tier-badge tier2">Enhanced</span>
                  </div>
                  <TierBenefits tier="tier2" />
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Personal Information */}
          {activeStep === 2 && (
            <div className="personal-info-form">
              <h3>Personal Information</h3>
              <p>Please provide accurate information as it appears on your official documents.</p>
              
              <form onSubmit={handlePersonalInfoSubmit}>
                <div className="form-group">
                  <label htmlFor="fullName">Full Legal Name *</label>
                  <input
                    type="text"
                    id="fullName"
                    value={personalInfo.fullName}
                    onChange={(e) => setPersonalInfo({
                      ...personalInfo,
                      fullName: e.target.value
                    })}
                    required
                    placeholder="Enter your full legal name"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="dateOfBirth">Date of Birth *</label>
                  <input
                    type="date"
                    id="dateOfBirth"
                    value={personalInfo.dateOfBirth}
                    onChange={(e) => setPersonalInfo({
                      ...personalInfo,
                      dateOfBirth: e.target.value
                    })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="address">Full Address *</label>
                  <textarea
                    id="address"
                    value={personalInfo.address}
                    onChange={(e) => setPersonalInfo({
                      ...personalInfo,
                      address: e.target.value
                    })}
                    required
                    placeholder="Enter your full residential address"
                    rows="3"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="phone">Phone Number *</label>
                  <input
                    type="tel"
                    id="phone"
                    value={personalInfo.phone}
                    onChange={(e) => setPersonalInfo({
                      ...personalInfo,
                      phone: e.target.value
                    })}
                    required
                    placeholder="+1 (555) 123-4567"
                  />
                </div>

                {selectedTier === 'tier2' && (
                  <div className="form-group">
                    <label htmlFor="ssn">Social Security Number *</label>
                    <input
                      type="password"
                      id="ssn"
                      value={personalInfo.ssn}
                      onChange={(e) => setPersonalInfo({
                        ...personalInfo,
                        ssn: e.target.value
                      })}
                      required
                      placeholder="XXX-XX-XXXX"
                      maxLength="11"
                    />
                    <small>Required for Tier 2 verification. This information is encrypted and secure.</small>
                  </div>
                )}

                <div className="form-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setActiveStep(1)}
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <span className="spinner"></span>
                        Processing...
                      </>
                    ) : (
                      'Continue'
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Step 3: Document Upload */}
          {activeStep === 3 && (
            <div className="document-upload-step">
              <h3>Upload Required Documents</h3>
              <p>Please upload clear, high-quality images of the required documents.</p>
              
              <DocumentUpload
                sessionId={sessionId}
                requirements={requirements}
                onUploadComplete={handleDocumentUploadComplete}
                tier={selectedTier}
              />
            </div>
          )}

          {/* Step 4: Verification Status */}
          {activeStep === 4 && (
            <div className="verification-step">
              <VerificationStatus
                sessionId={sessionId}
                tier={selectedTier}
                onVerificationComplete={onUpgradeComplete}
              />
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .kyc-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .kyc-modal {
          background: white;
          border-radius: 12px;
          width: 90%;
          max-width: 800px;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
        }

        .kyc-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 24px;
          border-bottom: 1px solid #e5e7eb;
        }

        .kyc-modal-header h2 {
          margin: 0;
          color: #1f2937;
          font-size: 24px;
          font-weight: 600;
        }

        .close-button {
          background: none;
          border: none;
          font-size: 24px;
          cursor: pointer;
          padding: 4px;
          color: #6b7280;
          transition: color 0.2s;
        }

        .close-button:hover {
          color: #374151;
        }

        .kyc-steps {
          display: flex;
          padding: 24px;
          border-bottom: 1px solid #e5e7eb;
          overflow-x: auto;
        }

        .kyc-step {
          display: flex;
          align-items: center;
          margin-right: 32px;
          opacity: 0.5;
          transition: opacity 0.3s;
        }

        .kyc-step.active,
        .kyc-step.completed {
          opacity: 1;
        }

        .step-number {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: #e5e7eb;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          margin-right: 12px;
        }

        .kyc-step.active .step-number {
          background: #3b82f6;
          color: white;
        }

        .kyc-step.completed .step-number {
          background: #10b981;
          color: white;
        }

        .step-title {
          font-weight: 600;
          color: #1f2937;
          margin-bottom: 2px;
        }

        .step-description {
          font-size: 14px;
          color: #6b7280;
        }

        .kyc-modal-body {
          padding: 24px;
        }

        .error-message {
          background: #fef2f2;
          border: 1px solid #fecaca;
          color: #dc2626;
          padding: 12px;
          border-radius: 8px;
          margin-bottom: 24px;
          display: flex;
          align-items: center;
        }

        .error-icon {
          margin-right: 8px;
        }

        .tier-options {
          display: flex;
          flex-direction: column;
          gap: 16px;
          margin-top: 24px;
        }

        .tier-option {
          border: 2px solid #e5e7eb;
          border-radius: 12px;
          padding: 24px;
          cursor: pointer;
          transition: all 0.3s;
        }

        .tier-option:hover {
          border-color: #3b82f6;
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.1);
        }

        .tier-option.selected {
          border-color: #3b82f6;
          background: #eff6ff;
        }

        .tier-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .tier-header h4 {
          margin: 0;
          color: #1f2937;
          font-size: 18px;
        }

        .tier-badge {
          padding: 4px 12px;
          border-radius: 16px;
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
        }

        .tier-badge.tier1 {
          background: #dbeafe;
          color: #1d4ed8;
        }

        .tier-badge.tier2 {
          background: #dcfce7;
          color: #166534;
        }

        .personal-info-form h3 {
          margin-bottom: 8px;
          color: #1f2937;
        }

        .personal-info-form p {
          color: #6b7280;
          margin-bottom: 32px;
        }

        .form-group {
          margin-bottom: 24px;
        }

        .form-group label {
          display: block;
          margin-bottom: 8px;
          font-weight: 600;
          color: #1f2937;
        }

        .form-group input,
        .form-group textarea {
          width: 100%;
          padding: 12px;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          font-size: 16px;
          transition: border-color 0.2s;
        }

        .form-group input:focus,
        .form-group textarea:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .form-group small {
          display: block;
          margin-top: 4px;
          color: #6b7280;
          font-size: 14px;
        }

        .form-actions {
          display: flex;
          justify-content: space-between;
          margin-top: 32px;
        }

        .btn-primary,
        .btn-secondary {
          padding: 12px 24px;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .btn-primary {
          background: #3b82f6;
          color: white;
          border: none;
        }

        .btn-primary:hover:not(:disabled) {
          background: #2563eb;
        }

        .btn-primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .btn-secondary {
          background: transparent;
          color: #6b7280;
          border: 1px solid #d1d5db;
        }

        .btn-secondary:hover {
          background: #f9fafb;
          color: #374151;
        }

        .spinner {
          width: 16px;
          height: 16px;
          border: 2px solid transparent;
          border-top: 2px solid currentColor;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        @media (max-width: 768px) {
          .kyc-modal {
            width: 95%;
            margin: 20px;
          }

          .kyc-steps {
            flex-direction: column;
            gap: 16px;
          }

          .kyc-step {
            margin-right: 0;
          }

          .tier-options {
            gap: 12px;
          }

          .tier-option {
            padding: 16px;
          }

          .form-actions {
            flex-direction: column;
            gap: 12px;
          }
        }
      `}</style>
    </div>
  );
};

export default KYCUpgradeModal;