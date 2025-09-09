// Vendor Payment QR Code Generator
class VendorPayment {
    constructor() {
        this.businessId = null;
        this.qrCodeData = null;
        this.isGenerating = false;
        
        this.init();
    }
    
    init() {
        this.businessId = this.getBusinessIdFromURL();
        this.loadBusinessInfo();
        this.setupEventListeners();
    }
    
    getBusinessIdFromURL() {
        const params = new URLSearchParams(window.location.search);
        return params.get('business') || 'default-business-id';
    }
    
    async loadBusinessInfo() {
        try {
            const response = await fetch(`/api/business/info/${this.businessId}`);
            if (response.ok) {
                const business = await response.json();
                this.displayBusinessInfo(business);
            } else {
                console.error('Failed to load business info');
                this.showError('Failed to load business information');
            }
        } catch (error) {
            console.error('Error loading business info:', error);
            this.showError('Error connecting to server');
        }
    }
    
    displayBusinessInfo(business) {
        document.getElementById('business-name').textContent = business.businessName || 'Pizza Business';
        document.getElementById('business-type').textContent = `${business.businessType} Business`;
        document.getElementById('business-category').textContent = business.category || 'Restaurant';
    }
    
    setupEventListeners() {
        // Generate QR Code button
        document.getElementById('generate-qr-btn').addEventListener('click', () => {
            this.generateQRCode();
        });
        
        // New QR Code button  
        document.getElementById('new-qr-btn').addEventListener('click', () => {
            this.generateQRCode();
        });
        
        // Copy QR Data button
        document.getElementById('copy-qr-btn').addEventListener('click', () => {
            this.copyQRData();
        });
    }
    
    async generateQRCode() {
        if (this.isGenerating) return;
        
        this.isGenerating = true;
        this.showLoading('Generating QR Code...');
        
        try {
            // Fixed $15 USDC payment
            const paymentData = {
                businessId: this.businessId,
                amount: 15, // Fixed $15 USDC
                currency: 'USDC',
                description: 'Pizza Payment - 0.3 $PIZZA SPL Reward'
            };
            
            const response = await fetch('/api/blockchain/payment/qr', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('businessToken')}`
                },
                body: JSON.stringify(paymentData)
            });
            
            if (response.ok) {
                const qrData = await response.json();
                this.displayQRCode(qrData);
            } else {
                const error = await response.json();
                this.showError(error.error || 'Failed to generate QR code');
            }
        } catch (error) {
            console.error('QR generation error:', error);
            this.showError('Failed to generate QR code');
        } finally {
            this.isGenerating = false;
            this.hideLoading();
        }
    }
    
    displayQRCode(qrData) {
        this.qrCodeData = qrData;
        
        // Display QR code image
        const qrContainer = document.getElementById('qr-code-container');
        // Create elements safely to prevent XSS
        const qrDisplay = document.createElement('div');
        qrDisplay.className = 'qr-code-display';
        
        const qrImage = document.createElement('img');
        qrImage.src = `data:image/png;base64,${this.sanitizeBase64(qrData.qrCode)}`;
        qrImage.alt = 'Payment QR Code';
        qrImage.className = 'qr-image';
        
        const qrDetails = document.createElement('div');
        qrDetails.className = 'qr-details';
        qrDetails.innerHTML = `
            <p><strong>Amount:</strong> $15 USDC</p>
            <p><strong>Reward:</strong> 0.3 $PIZZA SPL</p>
            <p><strong>Reference:</strong> ${this.escapeHtml(qrData.reference)}</p>
            <p><strong>Expires:</strong> ${this.escapeHtml(new Date(qrData.expiresAt).toLocaleTimeString())}</p>
        `;
        
        qrDisplay.appendChild(qrImage);
        qrDisplay.appendChild(qrDetails);
        qrContainer.innerHTML = '';
        qrContainer.appendChild(qrDisplay);
        
        // Show QR code section
        document.getElementById('qr-section').style.display = 'block';
        document.getElementById('generate-section').style.display = 'none';
        
        // Start monitoring payment status
        this.monitorPaymentStatus(qrData.reference);
    }
    
    async monitorPaymentStatus(reference) {
        const checkStatus = async () => {
            try {
                const response = await fetch(`/api/blockchain/payment/status/${reference}`, {
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('businessToken')}`
                    }
                });
                
                if (response.ok) {
                    const status = await response.json();
                    if (status.completed) {
                        if (status.success) {
                            this.showPaymentSuccess(status);
                        } else {
                            this.showPaymentError(status.error);
                        }
                        return; // Stop monitoring
                    }
                }
            } catch (error) {
                console.error('Status check error:', error);
            }
            
            // Continue monitoring every 3 seconds
            setTimeout(checkStatus, 3000);
        };
        
        checkStatus();
    }
    
    showPaymentSuccess(status) {
        const successHtml = `
            <div class="payment-success">
                <h3>✅ Payment Received!</h3>
                <p><strong>Amount:</strong> $${this.escapeHtml(status.amount)} USDC</p>
                <p><strong>Reward Sent:</strong> 0.3 $PIZZA SPL</p>
                <p><strong>Transaction:</strong> ${this.escapeHtml(status.signature)}</p>
                <button id="new-payment-btn" class="btn btn-primary">New Payment</button>
            </div>
        `;
        
        const container = document.getElementById('qr-code-container');
        container.innerHTML = '';
        container.insertAdjacentHTML('beforeend', successHtml);
        
        // Setup new payment button
        document.getElementById('new-payment-btn').addEventListener('click', () => {
            this.resetForNewPayment();
        });
    }
    
    showPaymentError(error) {
        const errorHtml = `
            <div class="payment-error">
                <h3>❌ Payment Failed</h3>
                <p>${this.escapeHtml(error)}</p>
                <button id="retry-payment-btn" class="btn btn-secondary">Generate New QR</button>
            </div>
        `;
        
        const container = document.getElementById('qr-code-container');
        container.innerHTML = '';
        container.insertAdjacentHTML('beforeend', errorHtml);
        
        // Setup retry button
        document.getElementById('retry-payment-btn').addEventListener('click', () => {
            this.resetForNewPayment();
        });
    }
    
    resetForNewPayment() {
        document.getElementById('qr-section').style.display = 'none';
        document.getElementById('generate-section').style.display = 'block';
        document.getElementById('qr-code-container').innerHTML = '';
        this.qrCodeData = null;
    }
    
    copyQRData() {
        if (!this.qrCodeData) return;
        
        const qrText = this.qrCodeData.solanaPayURL || this.qrCodeData.reference;
        navigator.clipboard.writeText(qrText).then(() => {
            this.showMessage('QR data copied to clipboard!');
        }).catch(() => {
            this.showMessage('Failed to copy QR data');
        });
    }
    
    showLoading(message) {
        document.getElementById('loading-message').textContent = message;
        document.getElementById('loading-indicator').style.display = 'block';
    }
    
    hideLoading() {
        document.getElementById('loading-indicator').style.display = 'none';
    }
    
    showError(message) {
        document.getElementById('error-message').textContent = message;
        document.getElementById('error-container').style.display = 'block';
        setTimeout(() => {
            document.getElementById('error-container').style.display = 'none';
        }, 5000);
    }
    
    showMessage(message) {
        document.getElementById('success-message').textContent = message;
        document.getElementById('success-container').style.display = 'block';
        setTimeout(() => {
            document.getElementById('success-container').style.display = 'none';
        }, 3000);
    }
    
    // Security utility functions
    escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
    
    sanitizeBase64(input) {
        // Only allow valid base64 characters
        return input.replace(/[^A-Za-z0-9+/=]/g, '');
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    new VendorPayment();
});
