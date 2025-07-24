import React, { useState, useCallback } from 'react';

const DocumentUpload = ({ sessionId, requirements, onUploadComplete, tier }) => {
  const [uploads, setUploads] = useState({});
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});
  const [error, setError] = useState(null);

  const documentTypes = {
    government_id: {
      title: 'Government-Issued ID',
      description: 'Driver\'s license, passport, or state ID card',
      icon: '🪪',
      required: tier === 'tier2'
    },
    proof_of_address: {
      title: 'Proof of Address',
      description: 'Utility bill, bank statement, or lease agreement (within 90 days)',
      icon: '🏠',
      required: tier === 'tier2'
    },
    passport: {
      title: 'Passport',
      description: 'Valid passport (alternative to government ID)',
      icon: '📔',
      required: false
    },
    utility_bill: {
      title: 'Utility Bill',
      description: 'Recent utility bill showing your address',
      icon: '📄',
      required: false
    }
  };

  const handleFileSelect = useCallback((documentType, files) => {
    const file = files[0];
    if (!file) return;

    // Validate file
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
      setError(`Invalid file type for ${documentTypes[documentType].title}. Please upload JPEG, PNG, or PDF files.`);
      return;
    }

    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      setError(`File too large for ${documentTypes[documentType].title}. Maximum size is 10MB.`);
      return;
    }

    setError(null);
    setUploads(prev => ({
      ...prev,
      [documentType]: {
        file,
        status: 'selected',
        preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null
      }
    }));
  }, []);

  const uploadDocument = async (documentType) => {
    const upload = uploads[documentType];
    if (!upload || !upload.file) return;

    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('documents', upload.file);
      formData.append('documentType', documentType);
      formData.append('sessionId', sessionId);

      // Simulate upload progress
      setUploadProgress(prev => ({ ...prev, [documentType]: 0 }));
      
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          const currentProgress = prev[documentType] || 0;
          if (currentProgress < 90) {
            return { ...prev, [documentType]: currentProgress + 10 };
          }
          return prev;
        });
      }, 200);

      const response = await fetch('/api/kyc/upload-document', {
        method: 'POST',
        credentials: 'include',
        body: formData
      });

      clearInterval(progressInterval);

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      setUploadProgress(prev => ({ ...prev, [documentType]: 100 }));
      setUploads(prev => ({
        ...prev,
        [documentType]: {
          ...prev[documentType],
          status: 'uploaded',
          uploadedAt: new Date(),
          documents: data.documents
        }
      }));

    } catch (err) {
      setError(`Failed to upload ${documentTypes[documentType].title}: ${err.message}`);
      setUploads(prev => ({
        ...prev,
        [documentType]: {
          ...prev[documentType],
          status: 'error'
        }
      }));
      setUploadProgress(prev => ({ ...prev, [documentType]: 0 }));
    } finally {
      setIsUploading(false);
    }
  };

  const removeDocument = (documentType) => {
    const upload = uploads[documentType];
    if (upload && upload.preview) {
      URL.revokeObjectURL(upload.preview);
    }
    
    setUploads(prev => {
      const newUploads = { ...prev };
      delete newUploads[documentType];
      return newUploads;
    });
    
    setUploadProgress(prev => {
      const newProgress = { ...prev };
      delete newProgress[documentType];
      return newProgress;
    });
  };

  const handleContinue = () => {
    const requiredDocs = Object.entries(documentTypes)
      .filter(([_, config]) => config.required)
      .map(([type, _]) => type);

    const uploadedRequiredDocs = requiredDocs.filter(type => 
      uploads[type] && uploads[type].status === 'uploaded'
    );

    if (uploadedRequiredDocs.length >= requiredDocs.length) {
      onUploadComplete();
    } else {
      setError('Please upload all required documents before continuing.');
    }
  };

  const getRequiredDocuments = () => {
    return Object.entries(documentTypes)
      .filter(([_, config]) => config.required)
      .map(([type, _]) => type);
  };

  const getUploadedCount = () => {
    return Object.values(uploads).filter(upload => upload.status === 'uploaded').length;
  };

  const getTotalRequired = () => {
    return getRequiredDocuments().length;
  };

  return (
    <div className="document-upload">
      <div className="upload-header">
        <div className="upload-progress-summary">
          <span className="progress-text">
            {getUploadedCount()} of {getTotalRequired()} required documents uploaded
          </span>
          <div className="progress-bar">
            <div 
              className="progress-fill"
              style={{ 
                width: `${(getUploadedCount() / getTotalRequired()) * 100}%` 
              }}
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="error-message">
          <span className="error-icon">⚠️</span>
          {error}
        </div>
      )}

      <div className="document-types">
        {Object.entries(documentTypes).map(([type, config]) => {
          const upload = uploads[type];
          const progress = uploadProgress[type] || 0;

          return (
            <div key={type} className="document-type">
              <div className="document-header">
                <div className="document-info">
                  <span className="document-icon">{config.icon}</span>
                  <div>
                    <h4>
                      {config.title}
                      {config.required && <span className="required-badge">Required</span>}
                    </h4>
                    <p>{config.description}</p>
                  </div>
                </div>
                
                <div className="document-status">
                  {upload?.status === 'uploaded' && (
                    <span className="status-badge success">✓ Uploaded</span>
                  )}
                  {upload?.status === 'error' && (
                    <span className="status-badge error">⚠ Failed</span>
                  )}
                  {upload?.status === 'selected' && (
                    <span className="status-badge pending">📁 Ready</span>
                  )}
                </div>
              </div>

              {upload && upload.preview && (
                <div className="document-preview">
                  <img src={upload.preview} alt="Document preview" />
                </div>
              )}

              {upload && upload.status === 'selected' && progress > 0 && progress < 100 && (
                <div className="upload-progress">
                  <div className="progress-bar">
                    <div 
                      className="progress-fill uploading"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <span className="progress-text">{progress}%</span>
                </div>
              )}

              <div className="document-actions">
                {!upload && (
                  <label className="upload-button">
                    <input
                      type="file"
                      accept="image/jpeg,image/jpg,image/png,application/pdf"
                      onChange={(e) => handleFileSelect(type, e.target.files)}
                      style={{ display: 'none' }}
                    />
                    <span className="upload-icon">📤</span>
                    Select File
                  </label>
                )}

                {upload && upload.status === 'selected' && (
                  <div className="selected-actions">
                    <button 
                      className="upload-btn"
                      onClick={() => uploadDocument(type)}
                      disabled={isUploading}
                    >
                      {isUploading ? (
                        <>
                          <span className="spinner"></span>
                          Uploading...
                        </>
                      ) : (
                        <>
                          <span className="upload-icon">☁️</span>
                          Upload
                        </>
                      )}
                    </button>
                    <button 
                      className="remove-btn"
                      onClick={() => removeDocument(type)}
                    >
                      Remove
                    </button>
                  </div>
                )}

                {upload && upload.status === 'uploaded' && (
                  <div className="uploaded-info">
                    <span className="uploaded-time">
                      Uploaded {upload.uploadedAt.toLocaleTimeString()}
                    </span>
                    <button 
                      className="replace-btn"
                      onClick={() => removeDocument(type)}
                    >
                      Replace
                    </button>
                  </div>
                )}

                {upload && upload.status === 'error' && (
                  <div className="error-actions">
                    <button 
                      className="retry-btn"
                      onClick={() => uploadDocument(type)}
                    >
                      Retry Upload
                    </button>
                    <button 
                      className="remove-btn"
                      onClick={() => removeDocument(type)}
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="upload-tips">
        <h4>📋 Upload Tips</h4>
        <ul>
          <li>Ensure documents are clear and all text is readable</li>
          <li>Use good lighting and avoid shadows or glare</li>
          <li>Make sure all four corners of the document are visible</li>
          <li>Accepted formats: JPEG, PNG, PDF (max 10MB each)</li>
          <li>Documents must be issued within the last 90 days (for proof of address)</li>
        </ul>
      </div>

      <div className="continue-section">
        <button 
          className="continue-btn"
          onClick={handleContinue}
          disabled={getUploadedCount() < getTotalRequired()}
        >
          Continue to Verification
        </button>
      </div>

      <style jsx>{`
        .document-upload {
          max-width: 100%;
        }

        .upload-header {
          margin-bottom: 32px;
        }

        .upload-progress-summary {
          background: #f8fafc;
          padding: 16px;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
        }

        .progress-text {
          display: block;
          margin-bottom: 8px;
          font-weight: 600;
          color: #1e293b;
        }

        .progress-bar {
          height: 8px;
          background: #e2e8f0;
          border-radius: 4px;
          overflow: hidden;
        }

        .progress-fill {
          height: 100%;
          background: #10b981;
          transition: width 0.3s ease;
        }

        .progress-fill.uploading {
          background: #3b82f6;
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

        .document-types {
          display: flex;
          flex-direction: column;
          gap: 24px;
          margin-bottom: 32px;
        }

        .document-type {
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 20px;
          background: white;
        }

        .document-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 16px;
        }

        .document-info {
          display: flex;
          align-items: flex-start;
          gap: 12px;
        }

        .document-icon {
          font-size: 24px;
          margin-top: 4px;
        }

        .document-info h4 {
          margin: 0 0 4px 0;
          color: #1e293b;
          font-size: 16px;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .document-info p {
          margin: 0;
          color: #64748b;
          font-size: 14px;
          line-height: 1.4;
        }

        .required-badge {
          background: #dc2626;
          color: white;
          font-size: 10px;
          padding: 2px 6px;
          border-radius: 4px;
          text-transform: uppercase;
          font-weight: 700;
        }

        .status-badge {
          padding: 4px 8px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 600;
        }

        .status-badge.success {
          background: #dcfce7;
          color: #166534;
        }

        .status-badge.error {
          background: #fef2f2;
          color: #dc2626;
        }

        .status-badge.pending {
          background: #dbeafe;
          color: #1d4ed8;
        }

        .document-preview {
          margin: 16px 0;
        }

        .document-preview img {
          max-width: 200px;
          max-height: 150px;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          object-fit: cover;
        }

        .upload-progress {
          display: flex;
          align-items: center;
          gap: 12px;
          margin: 16px 0;
        }

        .upload-progress .progress-bar {
          flex: 1;
          height: 6px;
        }

        .upload-progress .progress-text {
          font-size: 12px;
          color: #64748b;
          font-weight: 600;
        }

        .document-actions {
          display: flex;
          gap: 12px;
          align-items: center;
        }

        .upload-button {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 16px;
          background: #3b82f6;
          color: white;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 600;
          transition: background-color 0.2s;
        }

        .upload-button:hover {
          background: #2563eb;
        }

        .selected-actions,
        .uploaded-info,
        .error-actions {
          display: flex;
          gap: 12px;
          align-items: center;
        }

        .upload-btn,
        .retry-btn {
          background: #10b981;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: background-color 0.2s;
        }

        .upload-btn:hover,
        .retry-btn:hover {
          background: #059669;
        }

        .upload-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .remove-btn,
        .replace-btn {
          background: transparent;
          color: #64748b;
          border: 1px solid #cbd5e1;
          padding: 8px 16px;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 600;
          transition: all 0.2s;
        }

        .remove-btn:hover,
        .replace-btn:hover {
          background: #f1f5f9;
          color: #334155;
        }

        .uploaded-time {
          font-size: 12px;
          color: #64748b;
        }

        .upload-tips {
          background: #f8fafc;
          padding: 20px;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          margin-bottom: 32px;
        }

        .upload-tips h4 {
          margin: 0 0 12px 0;
          color: #1e293b;
          font-size: 16px;
        }

        .upload-tips ul {
          margin: 0;
          padding-left: 20px;
          color: #64748b;
        }

        .upload-tips li {
          margin-bottom: 4px;
          line-height: 1.4;
        }

        .continue-section {
          text-align: center;
        }

        .continue-btn {
          background: #3b82f6;
          color: white;
          border: none;
          padding: 14px 32px;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .continue-btn:hover:not(:disabled) {
          background: #2563eb;
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.2);
        }

        .continue-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .spinner {
          width: 14px;
          height: 14px;
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
          .document-header {
            flex-direction: column;
            gap: 12px;
          }

          .document-info {
            width: 100%;
          }

          .document-actions {
            flex-wrap: wrap;
          }

          .selected-actions,
          .uploaded-info,
          .error-actions {
            flex-wrap: wrap;
          }
        }
      `}</style>
    </div>
  );
};

export default DocumentUpload;