// Customer Dashboard JavaScript
const apiBase = 'http://localhost:7000/api';

class CustomerDashboard {
    constructor() {
        this.customerData = {};
        this.isLoading = false;
        this.init();
    }

    async init() {
        console.log('Initializing customer dashboard...');
        
        // Check authentication
        if (!this.checkAuth()) {
            return;
        }

        await this.loadCustomerData();
        this.setupEventListeners();
    }

    checkAuth() {
        const customerToken = localStorage.getItem('customerToken') || sessionStorage.getItem('customerToken');
        const customerEmail = localStorage.getItem('customerEmail') || sessionStorage.getItem('customerEmail');
        
        if (!customerToken) {
            console.log('No customer token found, redirecting to login');
            window.location.href = 'customer-login.html';
            return false;
        }

        // Update welcome message if email available
        if (customerEmail) {
            const firstName = customerEmail.split('@')[0];
            const nameElement = document.getElementById('customerName');
            if (nameElement) {
                nameElement.textContent = firstName;
            }
        }

        return true;
    }

    async loadCustomerData() {
        try {
            this.showLoading(true);
            const customerToken = localStorage.getItem('customerToken') || sessionStorage.getItem('customerToken');
            
            // For now, show placeholder data since backend customer endpoints may not be fully implemented
            // In a real implementation, you would fetch from: /api/customer/profile
            
            this.updateDashboardStats({
                pizzaRewards: '0.3',
                totalTransactions: '1', 
                totalSpent: '$15',
                giftCards: '0'
            });

            this.updateRecentActivity([
                {
                    type: 'payment',
                    amount: '$15',
                    description: 'Pizza purchase at Demo Restaurant',
                    reward: '0.3 $PIZZA SPL',
                    timestamp: new Date()
                }
            ]);

        } catch (error) {
            console.error('Error loading customer data:', error);
            this.showError('Failed to load dashboard data');
        } finally {
            this.showLoading(false);
        }
    }

    updateDashboardStats(stats) {
        const elements = {
            pizzaRewards: document.getElementById('pizzaRewards'),
            totalTransactions: document.getElementById('totalTransactions'),
            totalSpent: document.getElementById('totalSpent'),
            giftCards: document.getElementById('giftCards')
        };

        Object.keys(elements).forEach(key => {
            if (elements[key] && stats[key]) {
                elements[key].textContent = stats[key];
            }
        });
    }

    updateRecentActivity(activities) {
        const activityContainer = document.getElementById('recentActivity');
        if (!activityContainer) return;

        if (activities.length === 0) {
            activityContainer.innerHTML = `
                <p class="text-muted text-center py-4">
                    <i class="fas fa-pizza-slice fs-3 d-block mb-3"></i>
                    No transactions yet. Start earning rewards by making your first purchase!
                </p>
            `;
            return;
        }

        const activityHtml = activities.map(activity => `
            <div class="activity-item d-flex justify-content-between align-items-center p-3 mb-2 bg-light rounded">
                <div>
                    <div class="fw-bold">${activity.description}</div>
                    <small class="text-muted">${activity.timestamp.toLocaleDateString()}</small>
                </div>
                <div class="text-end">
                    <div class="fw-bold text-success">${activity.amount}</div>
                    <small class="text-muted">+${activity.reward}</small>
                </div>
            </div>
        `).join('');

        activityContainer.innerHTML = activityHtml;
    }

    setupEventListeners() {
        // Find Pizza Shops button
        const findShopsBtn = document.querySelector('[onclick="findPizzaShops()"]');
        if (findShopsBtn) {
            findShopsBtn.addEventListener('click', this.findPizzaShops.bind(this));
        }

        // QR Scanner button
        const qrScannerBtn = document.querySelector('.btn-pizza');
        if (qrScannerBtn) {
            qrScannerBtn.addEventListener('click', this.openQRScanner.bind(this));
        }

        // Investment tokens button
        const investmentBtn = document.querySelector('[onclick="showKYCInfo()"]');
        if (investmentBtn) {
            investmentBtn.addEventListener('click', this.showKYCInfo.bind(this));
        }

        // Logout button
        const logoutBtn = document.querySelector('[onclick="logout()"]');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', this.logout.bind(this));
        }
    }

    findPizzaShops() {
        console.log('Finding pizza shops...');
        window.location.href = '../platform-index.html#locations';
    }

    openQRScanner() {
        console.log('Opening QR scanner...');
        this.showInfo('QR Scanner feature will be available soon! For now, visit any participating pizza shop and scan their QR code at checkout.');
    }

    showKYCInfo() {
        console.log('Showing KYC info...');
        this.showInfo(`
            <h6><i class="fas fa-star me-2"></i>Investment Tokens</h6>
            <p>Convert your $PIZZA rewards to investment tokens and participate in governance!</p>
            <ul>
                <li>KYC verification required</li>
                <li>10 $PIZZA SPL + $0.10 USDC = 1 investment token</li>
                <li>Participate in platform governance</li>
                <li>1 token = 1 vote (max 1M tokens per user)</li>
            </ul>
            <p><strong>Feature coming soon!</strong></p>
        `);
    }

    logout() {
        console.log('Logging out...');
        
        // Clear all stored data
        localStorage.removeItem('customerToken');
        localStorage.removeItem('customerEmail');
        localStorage.removeItem('customerId');
        localStorage.removeItem('customerRemember');
        sessionStorage.removeItem('customerToken');
        sessionStorage.removeItem('customerEmail');
        sessionStorage.removeItem('customerId');
        
        this.showSuccess('Logged out successfully');
        
        setTimeout(() => {
            window.location.href = 'customer-login.html';
        }, 1000);
    }

    showLoading(show) {
        this.isLoading = show;
        // You could add a loading spinner here
        console.log(show ? 'Loading...' : 'Loading complete');
    }

    showError(message) {
        this.showAlert(message, 'danger');
    }

    showSuccess(message) {
        this.showAlert(message, 'success');
    }

    showInfo(message) {
        this.showAlert(message, 'info');
    }

    showAlert(message, type) {
        // Create and show Bootstrap alert
        const alertContainer = document.querySelector('.dashboard-container');
        if (!alertContainer) return;

        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
        alertDiv.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;

        alertContainer.insertBefore(alertDiv, alertContainer.firstChild);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (alertDiv.parentNode) {
                alertDiv.remove();
            }
        }, 5000);
    }
}

// Initialize dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.customerDashboard = new CustomerDashboard();
});

// Legacy function support
function findPizzaShops() {
    if (window.customerDashboard) {
        window.customerDashboard.findPizzaShops();
    }
}

function showKYCInfo() {
    if (window.customerDashboard) {
        window.customerDashboard.showKYCInfo();
    }
}

function logout() {
    if (window.customerDashboard) {
        window.customerDashboard.logout();
    }
}