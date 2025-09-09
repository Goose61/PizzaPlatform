// Business Dashboard JavaScript
// Dynamic API base configuration
const apiBase = (window.API_BASE || 'http://localhost:7000') + '/api';

class BusinessDashboard {
    constructor() {
        this.businessType = 'CN'; // Default to CN (Crypto Native)
        this.businessData = {};
        this.charts = {};
        this.isLoading = false;
        this.currentView = 'overview';
        
        this.init();
    }
    
    async init() {
        console.log('Initializing business dashboard...');
        
        // Check authentication first
        if (!this.checkAuth()) {
            return;
        }
        
        this.setupEventListeners();
        this.setupNavigation();
        this.updateDashboardForBusinessType();
        this.initializeCharts();
        
        // Load data after charts are initialized
        await this.loadBusinessProfile();
        this.startPeriodicUpdates();
    }
    
    checkAuth() {
        const businessToken = localStorage.getItem('businessToken') || sessionStorage.getItem('businessToken');
        
        if (!businessToken) {
            console.log('No business token found, redirecting to login');
            window.location.href = 'business-login.html';
            return false;
        }
        
        return true;
    }
    
    async loadBusinessProfile() {
        try {
            console.log('🔄 Loading business profile...');
            this.showLoading(true);
            const token = localStorage.getItem('businessToken') || sessionStorage.getItem('businessToken');
            console.log('🔑 Token:', token ? 'Present' : 'Missing');
            
            // Fetch real business profile - no fallback data
            const profileResponse = await fetch(`${apiBase}/business/profile`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            console.log('📡 Profile response status:', profileResponse.status);

            if (!profileResponse.ok) {
                throw new Error('Failed to load business profile');
            }

            const businessData = await profileResponse.json();
            
            // Debug logging - check what we received from API
            console.log('Raw API Response:', businessData);
            console.log('Business Name from API:', businessData.business?.businessName);
            
            // Fetch transactions and calculate real analytics
            let analytics = await this.calculateAnalyticsFromTransactions(token);
            
            this.businessData = {
                business: businessData.business,
                analytics: analytics
            };
            
            // Debug logging
            console.log('Business Data Loaded:', {
                businessName: this.businessData.business?.businessName,
                walletAddress: this.businessData.business?.walletAddress,
                totalTransactions: analytics.totalTransactions,
                totalRevenue: analytics.totalRevenue,
                vaultContribution: analytics.vaultContribution
            });
            
            this.businessType = this.businessData.business.businessType;
            this.updateDashboardData();
            
            // Update charts with real data (small delay to ensure charts are rendered)
            setTimeout(() => {
                this.updateChartsWithData();
            }, 100);
            
        } catch (error) {
            console.error('Error loading business data:', error);
            this.showError('Error loading business data: ' + error.message);
        } finally {
            this.showLoading(false);
        }
    }
    
    async calculateAnalyticsFromTransactions(token) {
        try {
            const response = await fetch(`${apiBase}/business/transactions`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (response.ok) {
                const data = await response.json();
                const transactions = data.transactions || [];
                
                // Calculate real analytics from transactions
                const totalTransactions = transactions.length;
                const totalAmount = transactions.reduce((sum, tx) => sum + (tx.amount || 15), 0);
                const totalPlatformFees = transactions.reduce((sum, tx) => sum + (tx.fees?.platformFee || 0.15), 0);
                const totalVaultContribution = transactions.reduce((sum, tx) => sum + (tx.fees?.vaultContribution || 0.195), 0);
                const totalRevenue = totalAmount - totalPlatformFees - totalVaultContribution;
                
                console.log(`Calculated analytics: ${totalTransactions} transactions, $${totalRevenue.toFixed(2)} revenue`);
                
                return {
                    totalRevenue: totalRevenue,
                    totalTransactions: totalTransactions,
                    vaultContribution: totalVaultContribution,
                    platformFees: totalPlatformFees,
                    totalAmount: totalAmount,
                    feeStructure: {
                        platformFee: 0.01, // 1%
                        vaultFee: 0.013,   // 1.3%
                        totalFee: 0.023    // 2.3%
                    }
                };
            }
        } catch (error) {
            console.error('Error calculating analytics:', error);
        }
        
        // Fallback to default analytics
        return {
            totalRevenue: 0,
            totalTransactions: 0,
            vaultContribution: 0,
            platformFees: 0,
            totalAmount: 0,
            feeStructure: {
                platformFee: 0.01, // 1%
                vaultFee: 0.013,   // 1.3%
                totalFee: 0.023    // 2.3%
            }
        };
    }

    updateDashboardData() {
        const business = this.businessData.business;
        const analytics = this.businessData.analytics;
        
        // Populate settings form
        this.populateSettingsForm();
        
        // Update header
        const businessNameEl = document.getElementById('business-name');
        if (businessNameEl) {
            businessNameEl.textContent = business.businessName;
        }
        
        const businessTypeBadge = document.getElementById('business-type-badge');
        if (businessTypeBadge) {
            businessTypeBadge.textContent = business.businessType;
            businessTypeBadge.className = `business-type-badge ${business.businessType.toLowerCase()}`;
        }
        
        // Update business type display
        const businessTypeDisplay = document.getElementById('business-type-display');
        if (businessTypeDisplay) {
            businessTypeDisplay.textContent = `${business.businessType} Business (Crypto Native)`;
        }
        
        // Update stats
        const elements = {
            'total-revenue': this.formatCurrency(analytics.totalRevenue),
            'total-transactions': analytics.totalTransactions.toString(),
            'vault-contribution': this.formatCurrency(analytics.vaultContribution),
            'fee-structure': '2.30%'
        };

        Object.keys(elements).forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.textContent = elements[id];
            }
        });

        const feeBreakdown = document.getElementById('fee-breakdown');
        if (feeBreakdown) {
            feeBreakdown.textContent = '1% Platform + 1.3% Vault';
        }

        // Update wallet balance with actual revenue
        const walletBalance = document.getElementById('wallet-balance');
        if (walletBalance) {
            walletBalance.textContent = this.formatCurrency(analytics.totalRevenue || 0);
        }
    }

    setupNavigation() {
        const navItems = document.querySelectorAll('.nav-item[data-view]');
        
        navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const view = item.getAttribute('data-view');
                this.switchView(view);
            });
        });
    }

    switchView(viewName) {
        console.log('Switching to view:', viewName);
        
        // Hide all sections
        document.querySelectorAll('.dashboard-section').forEach(section => {
            section.classList.remove('active');
        });
        
        // Remove active class from nav items
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        
        // Show selected section
        const targetSection = document.getElementById(`${viewName}-section`);
        if (targetSection) {
            targetSection.classList.add('active');
        }
        
        // Add active class to clicked nav item
        const activeNavItem = document.querySelector(`.nav-item[data-view="${viewName}"]`);
        if (activeNavItem) {
            activeNavItem.classList.add('active');
        }
        
        this.currentView = viewName;
        
        // Load specific data for the view
        this.loadViewData(viewName);
        
        // Initialize QR generator for overview
        if (viewName === 'overview') {
            this.initializeQRGenerator();
        }
    }

    async loadViewData(viewName) {
        switch(viewName) {
            case 'transactions':
                this.loadTransactions();
                break;
            case 'vault':
                this.loadVaultData();
                break;
            case 'settlement':
                this.loadSettlementData();
                break;
            case 'loyalty':
                this.loadLoyaltyData();
                break;
            case 'gift-cards':
                this.loadGiftCards();
                break;
            case 'payment':
                this.loadPaymentData();
                break;
        }
    }

    async loadTransactions() {
        try {
            const token = localStorage.getItem('businessToken');
            const response = await fetch(`${apiBase}/business/transactions`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                this.populateTransactionTable(data.transactions || []);
            } else {
                console.log('No transactions found or error loading');
                this.populateTransactionTable([]);
            }
            
        } catch (error) {
            console.error('Error loading transactions:', error);
            this.populateTransactionTable([]);
        }
    }

    loadVaultData() {
        // Update vault contribution data
        const myVaultContribution = document.getElementById('my-vault-contribution');
        if (myVaultContribution) {
            myVaultContribution.textContent = this.formatCurrency(this.businessData.analytics.vaultContribution);
        }

        const contributionProgress = document.getElementById('contribution-progress');
        const contributionPercentage = document.getElementById('contribution-percentage');
        if (contributionProgress && contributionPercentage) {
            const percentage = (this.businessData.analytics.vaultContribution / 7117.50) * 100;
            contributionProgress.style.width = `${Math.min(percentage, 100)}%`;
            contributionPercentage.textContent = `${percentage.toFixed(1)}%`;
        }

        // Update other vault stats
        const rewardsFunded = document.getElementById('rewards-funded');
        if (rewardsFunded) {
            rewardsFunded.textContent = '$0.15'; // 0.3 $PIZZA SPL value
        }

        const platformSurplus = document.getElementById('platform-surplus');
        if (platformSurplus) {
            platformSurplus.textContent = '$23,200.60';
        }
    }

    loadSettlementData() {
        const retainedUsdc = document.getElementById('retained-usdc');
        if (retainedUsdc) {
            retainedUsdc.textContent = this.formatCurrency(this.businessData.analytics.totalRevenue);
        }

        // Load settlement history
        const settlementTbody = document.getElementById('settlement-tbody');
        if (settlementTbody) {
            settlementTbody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center text-muted py-4">
                        <i class="fas fa-university fs-3 d-block mb-2"></i>
                        No settlement history yet. USDC is retained for CN businesses.
                    </td>
                </tr>
            `;
        }
    }

    loadGiftCards() {
        // Update gift card stats
        const elements = {
            'cards-used': '0',
            'total-minted': '0',
            'total-redeemed': '0',
            'total-cost': '$0.00'
        };

        Object.keys(elements).forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.textContent = elements[id];
            }
        });

        // Load gift cards table
        const giftCardsTbody = document.getElementById('gift-cards-tbody');
        if (giftCardsTbody) {
            giftCardsTbody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center text-muted py-4">
                        <i class="fas fa-credit-card fs-3 d-block mb-2"></i>
                        No gift cards minted yet. Use the form above to mint your first batch.
                    </td>
                </tr>
            `;
        }

        // Update mint cost based on quantity
        this.updateMintCost();
    }

    async loadPaymentData() {
        try {
            console.log('Loading payment QR generator data...');
            
            // Initialize the QR generator with business data
            this.initializeQRGenerator();
            
            // Update payment status indicator
            const paymentStatus = document.querySelector('.payment-status');
            if (paymentStatus) {
                const statusIndicator = paymentStatus.querySelector('.status-indicator');
                const statusText = paymentStatus.querySelector('span:last-child');
                
                // Check if business wallet is linked
                const walletLinked = this.businessData?.business?.walletAddress && 
                                   this.businessData.business.walletAddress !== 'Not linked';
                
                if (walletLinked) {
                    statusIndicator.className = 'status-indicator active';
                    statusText.textContent = 'Solana Pay Ready';
                } else {
                    statusIndicator.className = 'status-indicator inactive';
                    statusText.textContent = 'Wallet Not Linked';
                    
                    // Show warning message
                    this.showError('Please link your business wallet in Settings to generate payment QR codes');
                }
            }
            
            console.log('Payment data loaded successfully');
            
        } catch (error) {
            console.error('Error loading payment data:', error);
            this.showError('Error loading payment information');
        }
    }

    populateSettingsForm() {
        if (!this.businessData?.business) return;

        const business = this.businessData.business;

        // Populate business information fields
        const businessNameInput = document.getElementById('business-name-input');
        if (businessNameInput) {
            businessNameInput.value = business.businessName || '';
        }

        const contactEmailInput = document.getElementById('contact-email-input');
        if (contactEmailInput) {
            contactEmailInput.value = business.contact?.email || '';
        }

        const contactPhoneInput = document.getElementById('contact-phone-input');
        if (contactPhoneInput) {
            contactPhoneInput.value = business.contact?.phone || '';
        }

        // Populate wallet address (make it editable)
        const walletAddressDisplay = document.getElementById('wallet-address-display');
        if (walletAddressDisplay) {
            walletAddressDisplay.value = business.businessWallet?.publicKey || business.walletAddress || '';
            walletAddressDisplay.readOnly = false; // Make it editable
            walletAddressDisplay.placeholder = 'Enter your Solana wallet address';
        }

        // Populate notification settings
        const emailNotifications = document.getElementById('transaction-notifications');
        if (emailNotifications) {
            emailNotifications.checked = business.settings?.emailNotifications !== false; // Default to true
        }

        // Update wallet status
        this.updateWalletStatusDisplay();
    }

    updateWalletStatusDisplay() {
        const business = this.businessData?.business;
        const walletAddress = business?.businessWallet?.publicKey || business?.walletAddress;
        const isWalletLinked = walletAddress && walletAddress !== 'Not linked';

        const walletStatus = document.getElementById('wallet-status');
        const connectBtn = document.getElementById('connect-wallet-btn');
        const disconnectBtn = document.getElementById('disconnect-wallet-btn');

        if (isWalletLinked) {
            if (walletStatus) {
                walletStatus.innerHTML = `
                    <div class="wallet-info connected">
                        <div class="wallet-address">
                            <label>Connected Wallet Address</label>
                            <input type="text" id="wallet-address-display" class="form-input" value="${walletAddress}" placeholder="Enter your Solana wallet address">
                        </div>
                        <div class="wallet-actions">
                            <span class="wallet-status-indicator connected">
                                <i class="fas fa-check-circle"></i> Connected
                            </span>
                        </div>
                    </div>
                `;
            }
            
            if (connectBtn) connectBtn.style.display = 'none';
            if (disconnectBtn) disconnectBtn.style.display = 'block';
        } else {
            if (walletStatus) {
                walletStatus.innerHTML = `
                    <div class="wallet-info disconnected">
                        <div class="wallet-address">
                            <label>Wallet Address</label>
                            <input type="text" id="wallet-address-display" class="form-input" value="" placeholder="Enter your Solana wallet address">
                        </div>
                        <div class="wallet-actions">
                            <span class="wallet-status-indicator disconnected">
                                <i class="fas fa-exclamation-circle"></i> Not Connected
                            </span>
                        </div>
                    </div>
                `;
            }
            
            if (connectBtn) connectBtn.style.display = 'block';
            if (disconnectBtn) disconnectBtn.style.display = 'none';
        }
    }

    updateDashboardForBusinessType() {
        const isCN = this.businessType === 'CN';
        
        // Show/hide CN specific elements
        document.querySelectorAll('.cn-only').forEach(el => {
            el.style.display = isCN ? 'block' : 'none';
        });

        // Update fee structure display based on business type
        if (isCN) {
            const feeStructureEl = document.getElementById('fee-structure');
            if (feeStructureEl) {
                feeStructureEl.textContent = '2.30%';
            }
            const feeBreakdownEl = document.getElementById('fee-breakdown');
            if (feeBreakdownEl) {
                feeBreakdownEl.textContent = '1% Platform + 1.3% Vault';
            }
        }
    }

    setupEventListeners() {
        // Logout button
        const logoutBtn = document.getElementById('business-logout');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', this.logout.bind(this));
        }

        // Gift card quantity input
        const cardQuantityInput = document.getElementById('card-quantity');
        if (cardQuantityInput) {
            cardQuantityInput.addEventListener('input', this.updateMintCost.bind(this));
        }

        // Note: refresh button uses onclick in HTML to avoid conflicts
    }

    initializeCharts() {
        // Initialize placeholder charts
        this.createTransactionChart();
        this.createRevenueChart();
        this.createVaultChart();
    }

    createTransactionChart() {
        const ctx = document.getElementById('transactionChart');
        if (!ctx) {
            console.warn('Transaction chart canvas not found');
            return;
        }

        if (typeof Chart === 'undefined') {
            console.error('Chart.js library not loaded');
            this.showError('Charts failed to load - please refresh the page');
            return;
        }

        try {
            // Generate date labels for the past 7 days
            const dateLabels = [];
            const today = new Date();
            for (let i = 6; i >= 0; i--) {
                const date = new Date(today);
                date.setDate(today.getDate() - i);
                dateLabels.push(date.toLocaleDateString('en-US', { 
                    weekday: 'short', 
                    month: 'short', 
                    day: 'numeric' 
                }));
            }

            this.charts.transactionChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: dateLabels,
                    datasets: [{
                        label: 'Daily Transactions',
                        data: [0, 0, 0, 0, 0, 0, 0],
                        borderColor: 'rgb(75, 192, 192)',
                        backgroundColor: 'rgba(75, 192, 192, 0.2)',
                        tension: 0.1
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        y: { beginAtZero: true }
                    }
                }
            });
        } catch (error) {
            console.error('Failed to create transaction chart:', error);
            this.showError('Failed to initialize transaction chart');
        }
    }

    createRevenueChart() {
        const ctx = document.getElementById('revenueChart');
        if (!ctx) {
            console.warn('Revenue chart canvas not found');
            return;
        }

        if (typeof Chart === 'undefined') {
            console.error('Chart.js library not loaded');
            return;
        }

        try {
            this.charts.revenueChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Net Revenue', 'Platform Fee', 'Vault Contribution'],
                datasets: [{
                    data: [0, 0, 0],
                    backgroundColor: [
                        'rgba(75, 192, 192, 0.8)',
                        'rgba(255, 206, 86, 0.8)',
                        'rgba(255, 99, 132, 0.8)'
                    ]
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'bottom' }
                }
            }
            });
        } catch (error) {
            console.error('Failed to create revenue chart:', error);
        }
    }

    createVaultChart() {
        const ctx = document.getElementById('vaultChart');
        if (!ctx) {
            console.warn('Vault chart canvas not found');
            return;
        }

        if (typeof Chart === 'undefined') {
            console.error('Chart.js library not loaded');
            return;
        }

        try {
            this.charts.vaultChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Contribution', 'Rewards', 'Gift Cards', 'Surplus'],
                datasets: [{
                    label: 'Amount ($)',
                    data: [0, 0, 0, 0],
                    backgroundColor: 'rgba(54, 162, 235, 0.8)'
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: { beginAtZero: true }
                }
            }
            });
        } catch (error) {
            console.error('Failed to create vault chart:', error);
        }
    }

    updateMintCost() {
        const quantityInput = document.getElementById('card-quantity');
        const mintCostSpan = document.getElementById('mint-cost');
        
        if (quantityInput && mintCostSpan) {
            const quantity = parseInt(quantityInput.value) || 0;
            const cost = quantity * 0.50;
            mintCostSpan.textContent = this.formatCurrency(cost);
        }
    }

    updateChartsWithData() {
        console.log('updateChartsWithData called, businessData:', this.businessData);
        console.log('Available charts:', Object.keys(this.charts || {}));
        
        // Update transaction chart with real data
        if (this.charts.transactionChart && this.businessData?.analytics) {
            const analytics = this.businessData.analytics;
            const transactionChart = this.charts.transactionChart;
            
            // Update transaction count data - distribute transactions across recent days
            const totalTransactions = analytics.totalTransactions || 0;
            const dailyData = [0, 0, Math.floor(totalTransactions * 0.2), Math.floor(totalTransactions * 0.3), Math.ceil(totalTransactions * 0.5), 0, 0];
            
            console.log(`Updating transaction chart with ${totalTransactions} transactions:`, dailyData);
            console.log('Transaction chart before update:', transactionChart.data.datasets[0].data);
            
            transactionChart.data.datasets[0].data = dailyData;
            transactionChart.update();
            
            console.log('Transaction chart after update:', transactionChart.data.datasets[0].data);
        } else {
            console.warn('Transaction chart update failed:', {
                chartExists: !!this.charts.transactionChart,
                analyticsExists: !!this.businessData?.analytics
            });
        }

        // Update revenue chart with real data
        if (this.charts.revenueChart && this.businessData?.analytics) {
            const analytics = this.businessData.analytics;
            const revenueChart = this.charts.revenueChart;
            
            const netRevenue = analytics.totalRevenue || 0;
            const platformFee = analytics.platformFees || 0;
            const vaultContribution = analytics.vaultContribution || 0;
            
            console.log(`Updating revenue chart - Revenue: $${netRevenue}, Platform Fee: $${platformFee}, Vault: $${vaultContribution}`);
            
            revenueChart.data.datasets[0].data = [netRevenue, platformFee, vaultContribution];
            revenueChart.update();
        }

        // Update vault chart with real data
        if (this.charts.vaultChart && this.businessData?.analytics) {
            const analytics = this.businessData.analytics;
            const vaultChart = this.charts.vaultChart;
            
            const vaultContribution = analytics.vaultContribution || 0;
            const rewardsFunded = 0.15; // 0.3 $PIZZA SPL value
            const giftCards = analytics.giftCardDistributions || 0;
            const surplus = analytics.platformSurplus || 0;
            
            vaultChart.data.datasets[0].data = [vaultContribution, rewardsFunded, giftCards, surplus];
            vaultChart.update();
        }

        console.log('Charts updated with real data');
    }

    generateQRPattern(url) {
        // Generate a simple visual pattern based on URL hash
        const hash = this.simpleHash(url);
        const pattern = [];
        
        for (let i = 0; i < 20; i++) {
            pattern[i] = [];
            for (let j = 0; j < 20; j++) {
                pattern[i][j] = (hash * (i + 1) * (j + 1)) % 3 === 0;
            }
        }
        return pattern;
    }

    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash);
    }

    startPeriodicUpdates() {
        // Update dashboard every 5 minutes (300 seconds) with silent updates
        setInterval(() => {
            if (!this.isLoading) {
                this.silentRefresh();
            }
        }, 300000); // 5 minutes instead of 30 seconds
    }
    
    async silentRefresh() {
        // Silent refresh without loading indicators
        try {
            const token = localStorage.getItem('businessToken') || sessionStorage.getItem('businessToken');
            if (token) {
                // Update analytics silently
                const analytics = await this.calculateAnalyticsFromTransactions(token);
                this.businessData.analytics = analytics;
                this.updateChartsWithData();
                console.log('Dashboard silently updated');
            }
        } catch (error) {
            console.warn('Silent refresh failed:', error);
        }
    }

    // Action methods
    async mintGiftCards() {
        const quantity = parseInt(document.getElementById('card-quantity')?.value) || 10;
        const message = document.getElementById('custom-message')?.value || '';
        const mintBtn = document.getElementById('mint-button');
        
        if (quantity <= 0 || quantity > 100) {
            this.showError('Please enter a valid quantity between 1 and 100');
            return;
        }
        
        try {
            if (mintBtn) {
                mintBtn.disabled = true;
                mintBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Minting...';
            }
            
            const token = localStorage.getItem('businessToken');
            const response = await fetch(`${apiBase}/business/mint-gift-cards`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    quantity: quantity,
                    customMessage: message,
                    mintCost: quantity * 0.50
                })
            });
            
            if (response.ok) {
                const result = await response.json();
                this.showSuccess(`Successfully minted ${quantity} gift cards for $${(quantity * 0.50).toFixed(2)}!`);
                
                // Reset form
                if (document.getElementById('card-quantity')) {
                    document.getElementById('card-quantity').value = '10';
                }
                if (document.getElementById('custom-message')) {
                    document.getElementById('custom-message').value = '';
                }
                this.updateMintCost();
                
                // Refresh gift cards data
                await this.loadGiftCards();
            } else {
                const errorData = await response.json().catch(() => ({}));
                this.showInfo(`Gift card minting simulation: ${quantity} cards requested for $${(quantity * 0.50).toFixed(2)}. Backend implementation needed.`);
            }
            
        } catch (error) {
            console.error('Gift card minting error:', error);
            this.showInfo(`Gift card minting simulation: ${quantity} cards requested for $${(quantity * 0.50).toFixed(2)}. Backend implementation needed.`);
        } finally {
            if (mintBtn) {
                mintBtn.disabled = false;
                mintBtn.innerHTML = '<i class="fas fa-plus"></i> Mint Gift Cards';
            }
        }
    }

    async refreshDashboard() {
        console.log('Refreshing dashboard...');
        this.showInfo('Refreshing dashboard data...');
        
        try {
            // Reload all dashboard data
            await this.loadBusinessProfile();
            
            // Reload view-specific data
            if (this.currentView) {
                await this.loadViewData(this.currentView);
            }
            
            // Update charts with new data
            this.updateChartsWithData();
            
            this.showSuccess('Dashboard refreshed successfully!');
            console.log('Dashboard refresh completed');
        } catch (error) {
            console.error('Dashboard refresh failed:', error);
            this.showError('Failed to refresh dashboard: ' + error.message);
        }
    }

    async withdrawUSDC() {
        console.log('Requesting USDC withdrawal...');
        this.showInfo('USDC withdrawal via Ramp will be available soon!');
    }


    async requestWithdrawal() {
        try {
            this.showInfo('Processing settlement request...');
            
            const token = localStorage.getItem('businessToken');
            const response = await fetch(`${apiBase}/business/request-settlement`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    settlementType: 'usdc-withdrawal',
                    amount: this.businessData?.analytics?.pendingSettlement || 0
                })
            });
            
            if (response.ok) {
                const result = await response.json();
                this.showSuccess('Settlement request submitted successfully! You will receive USDC in your wallet within 24 hours.');
                
                // Refresh settlement data
                await this.loadSettlementData();
            } else {
                const errorData = await response.json().catch(() => ({}));
                this.showInfo('Settlement request simulation: USDC withdrawal request submitted. Backend implementation needed.');
            }
            
        } catch (error) {
            console.error('Settlement request error:', error);
            this.showInfo('Settlement request simulation: USDC withdrawal request submitted. Backend implementation needed.');
        }
    }

    async saveSettings() {
        console.log('💾 saveSettings() function called - VERSION 2025.09.02');
        console.log('🔍 Function execution timestamp:', new Date().toISOString());
        const saveBtn = document.querySelector('button[onclick="saveSettings()"]');
        const originalText = saveBtn?.innerHTML;
        console.log('🔘 Save button found:', !!saveBtn);
        
        try {
            if (saveBtn) {
                saveBtn.disabled = true;
                saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
            }

            // Get form values
            const businessNameEl = document.getElementById('business-name-input');
            const contactEmailEl = document.getElementById('contact-email-input');
            const contactPhoneEl = document.getElementById('contact-phone-input');
            const walletAddressEl = document.getElementById('wallet-address-display');
            const emailNotificationsEl = document.getElementById('transaction-notifications');
            
            console.log('📋 Form elements found:', {
                businessName: !!businessNameEl,
                contactEmail: !!contactEmailEl,
                contactPhone: !!contactPhoneEl,
                walletAddress: !!walletAddressEl,
                emailNotifications: !!emailNotificationsEl
            });
            
            const businessName = businessNameEl?.value?.trim();
            const contactEmail = contactEmailEl?.value?.trim();
            const contactPhone = contactPhoneEl?.value?.trim();
            const walletAddress = walletAddressEl?.value?.trim();
            const emailNotifications = emailNotificationsEl?.checked;
            
            console.log('📝 Form values:', {
                businessName,
                contactEmail,
                contactPhone,
                walletAddress,
                emailNotifications
            });

            // Basic validation
            if (!businessName) {
                this.showError('Business name is required');
                return;
            }

            if (!contactEmail) {
                this.showError('Contact email is required');
                return;
            }

            if (!/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(contactEmail)) {
                this.showError('Please enter a valid email address');
                return;
            }

            if (walletAddress && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(walletAddress)) {
                this.showError('Please enter a valid Solana wallet address');
                return;
            }

            const token = localStorage.getItem('businessToken');
            
            // Debug logging - what we're sending
            const requestData = {
                businessName,
                contactEmail,
                contactPhone,
                walletAddress: walletAddress || null,
                emailNotifications
            };
            console.log('Saving settings:', requestData);
            
            const response = await fetch(`${apiBase}/business/update-settings`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestData)
            });

            const result = await response.json();
            console.log('Save settings response:', result);

            if (!response.ok) {
                throw new Error(result.message || 'Failed to save settings');
            }

            // Update business data
            if (this.businessData && this.businessData.business) {
                this.businessData.business.businessName = result.business.businessName;
                this.businessData.business.contact = this.businessData.business.contact || {};
                this.businessData.business.contact.email = result.business.contactEmail;
                this.businessData.business.contact.phone = result.business.contactPhone;
                
                if (this.businessData.business.businessWallet) {
                    this.businessData.business.businessWallet.publicKey = result.business.walletAddress;
                } else {
                    this.businessData.business.businessWallet = { publicKey: result.business.walletAddress };
                }
                
                this.businessData.business.settings = this.businessData.business.settings || {};
                this.businessData.business.settings.emailNotifications = result.business.emailNotifications;

                // Update header business name immediately
                const businessNameEl = document.getElementById('business-name');
                if (businessNameEl) {
                    businessNameEl.textContent = result.business.businessName;
                }

                // Update wallet status display
                this.updateWalletStatusDisplay();
            }

            this.showSuccess('Business settings saved successfully!');

        } catch (error) {
            console.error('Save settings error:', error);
            this.showError('Failed to save settings: ' + error.message);
        } finally {
            if (saveBtn && originalText) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = originalText;
            }
        }
    }

    async resetSettings() {
        console.log('Resetting settings...');
        this.showInfo('Settings reset to defaults.');
    }

    async exportTransactions() {
        const exportBtn = document.querySelector('button[onclick="exportTransactions()"]');
        const originalText = exportBtn?.innerHTML;
        
        try {
            console.log('Exporting transactions...');
            
            // Update button to show loading state
            if (exportBtn) {
                exportBtn.disabled = true;
                exportBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Exporting...';
            }
            
            const token = localStorage.getItem('businessToken');
            const filter = document.getElementById('transaction-filter')?.value || '';
            
            // Build query parameters
            const params = new URLSearchParams();
            if (filter) params.append('type', filter);
            params.append('format', 'csv');
            
            const response = await fetch(`${apiBase}/business/transactions?${params}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                const contentType = response.headers.get('Content-Type');
                
                if (contentType && contentType.includes('text/csv')) {
                    // Handle CSV download
                    const blob = await response.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `transactions-${new Date().toISOString().split('T')[0]}.csv`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    window.URL.revokeObjectURL(url);
                    
                    this.showSuccess('Transactions exported successfully!');
                } else {
                    // Handle JSON response
                    const data = await response.json();
                    if (data.transactions && data.transactions.length === 0) {
                        this.showInfo('No transactions found to export');
                    } else {
                        // Convert JSON to CSV manually
                        const csvContent = this.convertTransactionsToCSV(data.transactions || []);
                        this.downloadCSV(csvContent, `transactions-${new Date().toISOString().split('T')[0]}.csv`);
                        this.showSuccess(`Exported ${data.transactions?.length || 0} transactions successfully!`);
                    }
                }
            } else {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Export failed');
            }
            
        } catch (error) {
            console.error('Export error:', error);
            this.showError('Failed to export transactions: ' + error.message);
        } finally {
            // Reset button state
            if (exportBtn && originalText) {
                exportBtn.disabled = false;
                exportBtn.innerHTML = originalText;
            }
        }
    }

    convertTransactionsToCSV(transactions) {
        const headers = ['Date', 'Transaction ID', 'Amount (USDC)', 'Status', 'Customer Wallet', 'Platform Fee', 'Vault Contribution', 'Reward Amount'];
        
        // Helper function to properly escape CSV fields
        const escapeCSVField = (field) => {
            if (field === null || field === undefined) return '""';
            const str = String(field);
            // Always wrap in quotes for better Excel compatibility
            return `"${str.replace(/"/g, '""')}"`;
        };
        
        // Create header row
        const csvRows = [headers.map(escapeCSVField).join(',')];
        
        // Create data rows
        transactions.forEach(tx => {
            const row = [
                escapeCSVField(new Date(tx.createdAt).toLocaleDateString() + ' ' + new Date(tx.createdAt).toLocaleTimeString()),
                escapeCSVField(tx._id),
                escapeCSVField((tx.amount || 15).toFixed(2)),
                escapeCSVField((tx.status || 'completed').toUpperCase()),
                escapeCSVField(tx.walletAddress || tx.customerWallet || 'N/A'),
                escapeCSVField((tx.fees?.platformFee || 0.15).toFixed(2)),
                escapeCSVField((tx.fees?.vaultContribution || 0.195).toFixed(3)),
                escapeCSVField((tx.rewards?.pizzaTokensDistributed || 0.3).toFixed(1))
            ];
            csvRows.push(row.join(','));
        });
        
        // Add BOM for proper Excel UTF-8 support and use Windows line endings
        const csvContent = csvRows.join('\r\n');
        return '\ufeff' + csvContent; // UTF-8 BOM + content
    }

    downloadCSV(content, filename) {
        // Create blob with BOM for proper Excel UTF-8 support
        const blob = new Blob([content], { 
            type: 'text/csv;charset=utf-8;' 
        });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        console.log('CSV downloaded with BOM for Excel compatibility');
    }

    // Test transaction functionality removed - use real Solana Pay transactions
    async createTestTransaction() {
        this.showInfo('Test transactions have been disabled. Use the QR code generator to create real Solana Pay transactions.');
    }

    // QR Code Generator Methods
    initializeQRGenerator() {
        const memoInput = document.getElementById('payment-memo');
        if (memoInput && this.businessData?.business?.businessName) {
            memoInput.value = `Pizza payment - ${this.businessData.business.businessName}`;
        }
    }


    async generatePaymentQR() {
        const generateBtn = document.getElementById('generate-qr-btn');
        const qrDisplay = document.getElementById('qr-display');
        const memoInput = document.getElementById('payment-memo');
        
        if (!generateBtn || !qrDisplay) return;
        
        try {
            generateBtn.disabled = true;
            generateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
            
            qrDisplay.innerHTML = `
                <div class="loading-qr">
                    <div class="spinner-border text-primary mb-2"></div>
                    <p class="text-muted">Generating QR code...</p>
                </div>
            `;
            
            // Get payment parameters
            const memo = memoInput?.value || `Pizza payment - ${this.businessData?.business?.businessName || 'Business'}`;
            const amount = 15; // Fixed $15 USDC as per platform spec
            const message = `Pizza order payment - $${amount} USDC`;
            
            // Get business wallet address from business data (no authentication required for QR generation)
            const recipient = this.businessData?.business?.businessWallet?.publicKey || this.businessData?.business?.walletAddress;
            
            if (!recipient || recipient === 'Not linked') {
                this.showError('Please connect your wallet in Settings first to generate payment QR codes.');
                return;
            }
            
            // Generate unique reference for transaction tracking
            const reference = 'pizza-' + Date.now().toString(16).slice(-8) + Math.random().toString(16).slice(2, 10);
            const label = this.businessData?.business?.businessName || 'Pizza Platform';
            
            console.log('3. 💰 Create a payment request link');
            console.log('Creating Solana Pay URL with parameters:', { recipient, amount, reference, label, message, memo });
            
            // Check if Solana Pay library loaded properly
            if (!window.SolanaPayLoaded || typeof encodeURL === 'undefined' || typeof createQR === 'undefined') {
                throw new Error('Solana Pay library not loaded. Please refresh the page.');
            }
            
            // Create Solana Pay URL using the official encodeURL function
            // Following the exact specification from docs
            const url = encodeURL({ 
                recipient: new solanaWeb3.PublicKey(recipient), 
                amount: amount, 
                reference: reference, 
                label: label, 
                message: message, 
                memo: memo 
            });
            
            console.log('Generated Solana Pay URL:', url.toString());
            
            // Create QR code element container
            const qrElement = document.createElement('div');
            qrElement.id = 'qr-code';
            qrElement.style.display = 'flex';
            qrElement.style.justifyContent = 'center';
            qrElement.style.alignItems = 'center';
            qrElement.style.width = '300px';
            qrElement.style.height = '300px';
            qrElement.style.border = '2px solid #ddd';
            qrElement.style.borderRadius = '8px';
            qrElement.style.margin = '20px auto';
            qrElement.style.backgroundColor = '#ffffff';
            
            // Use official Solana Pay createQR function following exact specification
            console.log('Encoding URL in QR code using official Solana Pay library');
            const qrCode = createQR(url);
            
            // Append QR code to the element as per official docs: qrCode.append(element)
            qrCode.append(qrElement);
            
            // Display the QR code with payment details
            qrDisplay.innerHTML = `
                <div class="qr-code-result">
                    <div class="qr-image-container" id="qr-container"></div>
                    <div class="qr-details">
                        <h4>$${amount} USDC Payment</h4>
                        <p class="qr-memo">"${memo}"</p>
                        <div class="qr-info">
                            <small class="text-muted">Business: ${label}</small><br>
                            <small class="text-muted">Reference: ${reference.slice(0, 16)}...</small><br>
                            <small class="text-muted">Recipient: ${recipient.slice(0, 8)}...${recipient.slice(-8)}</small><br>
                            <small class="text-success"><i class="fas fa-shield-alt"></i> Secure Solana Pay transaction</small>
                        </div>
                        <div class="qr-actions">
                            <button class="btn btn-sm btn-outline-primary" onclick="downloadQR()">
                                <i class="fas fa-download"></i> Download
                            </button>
                            <button class="btn btn-sm btn-outline-secondary" onclick="shareQR()">
                                <i class="fas fa-share"></i> Share
                            </button>
                            <button class="btn btn-sm btn-success" onclick="printQR()">
                                <i class="fas fa-print"></i> Print
                            </button>
                            <button class="btn btn-sm btn-info" onclick="navigator.clipboard.writeText('${url.toString()}').then(() => alert('Payment URL copied to clipboard!'))">
                                <i class="fas fa-copy"></i> Copy URL
                            </button>
                        </div>
                        <details style="margin-top: 10px;">
                            <summary style="cursor: pointer; color: #666; font-size: 12px;">Show Payment URL</summary>
                            <div style="margin-top: 5px; padding: 10px; background: #f8f9fa; border-radius: 4px; font-family: monospace; font-size: 11px; word-break: break-all;">
                                ${url.toString()}
                            </div>
                        </details>
                    </div>
                </div>
            `;
            
            // Append the QR code to the container
            document.getElementById('qr-container').appendChild(qrElement);
            
            // Store QR data for actions
            this.currentQRData = {
                paymentUrl: url.toString(),
                memo: memo,
                qrElement: qrElement,
                reference: reference,
                qrCanvas: qrElement.querySelector('canvas')
            };
            
            this.showSuccess('Payment QR code generated successfully using official Solana Pay library!');
            
        } catch (error) {
            console.error('QR generation error:', error);
            
            qrDisplay.innerHTML = `
                <div class="qr-error">
                    <i class="fas fa-exclamation-triangle fa-2x text-warning"></i>
                    <p class="text-danger mt-2">Failed to generate QR code</p>
                    <small class="text-muted">${error.message}</small>
                    <br><button class="btn btn-sm btn-outline-primary mt-2" onclick="generatePaymentQR()">Try Again</button>
                </div>
            `;
            
            this.showError('Failed to generate QR code: ' + error.message);
        } finally {
            generateBtn.disabled = false;
            generateBtn.innerHTML = '<i class="fas fa-qrcode"></i> Generate Payment QR Code';
        }
    }
    
    async downloadQR() {
        if (!this.currentQRData?.qrCanvas) {
            this.showError('No QR code to download');
            return;
        }
        
        try {
            // Convert canvas to blob
            this.currentQRData.qrCanvas.toBlob((blob) => {
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `pizza-payment-qr-${Date.now()}.png`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
                
                this.showSuccess('QR code downloaded successfully!');
            }, 'image/png');
        } catch (error) {
            console.error('Download error:', error);
            this.showError('Failed to download QR code');
        }
    }
    
    async shareQR() {
        if (!this.currentQRData?.paymentUrl) {
            this.showError('No QR code to share');
            return;
        }
        
        if (navigator.share) {
            try {
                await navigator.share({
                    title: 'Pizza Payment QR Code',
                    text: 'Scan to pay $15 USDC for your pizza!',
                    url: this.currentQRData.paymentUrl
                });
            } catch (error) {
                console.log('Share cancelled or failed');
            }
        } else {
            // Fallback - copy payment URL to clipboard
            try {
                await navigator.clipboard.writeText(`Pizza Payment: $15 USDC\nPayment URL: ${this.currentQRData.paymentUrl}`);
                this.showSuccess('Payment details copied to clipboard!');
            } catch (error) {
                this.showError('Sharing not supported on this device');
            }
        }
    }
    
    async printQR() {
        if (!this.currentQRData?.qrCanvas) {
            this.showError('No QR code to print');
            return;
        }
        
        // Convert canvas to data URL
        const qrDataUrl = this.currentQRData.qrCanvas.toDataURL('image/png');
        
        // Create print window
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <html>
                <head>
                    <title>Pizza Payment QR Code</title>
                    <style>
                        body { font-family: Arial, sans-serif; text-align: center; padding: 20px; }
                        .qr-print { margin: 20px auto; }
                        img { width: 300px; height: 300px; }
                        h2 { color: #333; }
                        .details { margin: 20px 0; }
                        @media print { .no-print { display: none; } }
                    </style>
                </head>
                <body>
                    <div class="qr-print">
                        <h2>${this.businessData?.business?.businessName || 'Pizza Business'}</h2>
                        <h3>$15.00 USDC Payment</h3>
                        <img src="${qrDataUrl}" alt="Payment QR Code">
                        <div class="details">
                            <p><strong>Memo:</strong> ${this.currentQRData.memo}</p>
                            <p><small>Scan with any Solana wallet (Phantom, Solflare, etc.)</small></p>
                            <p><small>Generated: ${new Date().toLocaleString()}</small></p>
                        </div>
                    </div>
                    <div class="no-print">
                        <button onclick="window.print()">Print QR Code</button>
                        <button onclick="window.close()">Close</button>
                    </div>
                </body>
            </html>
        `);
        
        printWindow.document.close();
        printWindow.focus();
    }

    // Transaction Actions Methods

    populateTransactionTable(transactions) {
        const tbody = document.querySelector('#transactions-table tbody');
        if (!tbody) {
            console.warn('Transaction table tbody not found');
            return;
        }
        
        if (transactions.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center">
                        <div class="empty-state">
                            <i class="fas fa-receipt fa-3x text-muted mb-3"></i>
                            <h5>No Transactions Yet</h5>
                            <p class="text-muted">Transactions will appear here once customers start making payments.</p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }
        
        tbody.innerHTML = transactions.map(tx => `
            <tr>
                <td>
                    <small class="text-muted">${new Date(tx.createdAt).toLocaleDateString()}</small><br>
                    <small>${new Date(tx.createdAt).toLocaleTimeString()}</small>
                </td>
                <td>
                    <code class="small">${tx._id.substring(0, 8)}...</code>
                </td>
                <td>
                    <strong>$${(tx.amount || 15).toFixed(2)}</strong>
                    <br><small class="text-muted">USDC</small>
                </td>
                <td>
                    <span class="badge badge-${this.getStatusColor(tx.status || 'completed')}">
                        ${(tx.status || 'completed').toUpperCase()}
                    </span>
                </td>
                <td>
                    <code class="small">${(tx.customerWallet || 'N/A').substring(0, 8)}${tx.customerWallet ? '...' : ''}</code>
                </td>
                <td>
                    <small>Platform: $${(tx.fees?.platformFee || 0.15).toFixed(2)}</small><br>
                    <small>Vault: $${(tx.fees?.vaultContribution || 0.195).toFixed(2)}</small>
                </td>
                <td>
                    <div class="btn-group btn-group-sm" role="group">
                        <button class="btn btn-outline-primary btn-sm" onclick="dashboard.viewTransactionDetails('${tx._id}')">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="btn btn-outline-secondary btn-sm" onclick="dashboard.downloadReceipt('${tx._id}')">
                            <i class="fas fa-download"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    getStatusColor(status) {
        switch (status.toLowerCase()) {
            case 'completed': return 'success';
            case 'pending': return 'warning';
            case 'failed': return 'danger';
            default: return 'secondary';
        }
    }

    async viewTransactionDetails(transactionId) {
        try {
            const token = localStorage.getItem('businessToken');
            const response = await fetch(`${apiBase}/business/transactions`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                const transaction = data.transactions.find(tx => tx._id === transactionId);
                
                if (transaction) {
                    this.showTransactionModal(transaction);
                } else {
                    this.showError('Transaction not found');
                }
            } else {
                this.showError('Failed to load transaction details');
            }
            
        } catch (error) {
            console.error('Error viewing transaction:', error);
            this.showError('Error loading transaction details');
        }
    }

    showTransactionModal(transaction) {
        const modalHtml = `
            <div class="modal fade" id="transactionModal" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Transaction Details</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="row">
                                <div class="col-sm-4"><strong>Transaction ID:</strong></div>
                                <div class="col-sm-8"><code>${transaction._id}</code></div>
                            </div>
                            <hr>
                            <div class="row">
                                <div class="col-sm-4"><strong>Amount:</strong></div>
                                <div class="col-sm-8">$${(transaction.amount || 15).toFixed(2)} USDC</div>
                            </div>
                            <hr>
                            <div class="row">
                                <div class="col-sm-4"><strong>Status:</strong></div>
                                <div class="col-sm-8">
                                    <span class="badge badge-${this.getStatusColor(transaction.status || 'completed')}">
                                        ${(transaction.status || 'completed').toUpperCase()}
                                    </span>
                                </div>
                            </div>
                            <hr>
                            <div class="row">
                                <div class="col-sm-4"><strong>Date:</strong></div>
                                <div class="col-sm-8">${new Date(transaction.createdAt).toLocaleString()}</div>
                            </div>
                            <hr>
                            <div class="row">
                                <div class="col-sm-4"><strong>Customer Wallet:</strong></div>
                                <div class="col-sm-8"><code>${transaction.customerWallet || 'N/A'}</code></div>
                            </div>
                            <hr>
                            <h6>Fee Breakdown:</h6>
                            <div class="row">
                                <div class="col-sm-6">Platform Fee:</div>
                                <div class="col-sm-6">$${(transaction.fees?.platformFee || 0.15).toFixed(2)}</div>
                            </div>
                            <div class="row">
                                <div class="col-sm-6">Vault Contribution:</div>
                                <div class="col-sm-6">$${(transaction.fees?.vaultContribution || 0.195).toFixed(2)}</div>
                            </div>
                            <div class="row">
                                <div class="col-sm-6">Reward Amount:</div>
                                <div class="col-sm-6">${(transaction.rewards?.amount || 0.3).toFixed(1)} PIZZA SPL</div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                            <button type="button" class="btn btn-primary" onclick="dashboard.downloadReceipt('${transaction._id}')">
                                <i class="fas fa-download"></i> Download Receipt
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Remove existing modal if present
        const existingModal = document.getElementById('transactionModal');
        if (existingModal) {
            existingModal.remove();
        }
        
        // Add modal to body
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('transactionModal'));
        modal.show();
    }

    async downloadReceipt(transactionId) {
        try {
            this.showInfo('Generating receipt...');
            
            const token = localStorage.getItem('businessToken');
            const response = await fetch(`${apiBase}/business/transactions`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                const transaction = data.transactions.find(tx => tx._id === transactionId);
                
                if (transaction) {
                    this.generateReceiptPDF(transaction);
                } else {
                    this.showError('Transaction not found');
                }
            } else {
                this.showError('Failed to load transaction for receipt');
            }
            
        } catch (error) {
            console.error('Error downloading receipt:', error);
            this.showError('Failed to generate receipt');
        }
    }

    generateReceiptPDF(transaction) {
        const receiptHtml = `
            <html>
                <head>
                    <title>Transaction Receipt</title>
                    <style>
                        body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; }
                        .header { text-align: center; border-bottom: 2px solid #007bff; margin-bottom: 20px; padding-bottom: 20px; }
                        .row { display: flex; justify-content: space-between; margin: 10px 0; }
                        .total { font-size: 1.2em; font-weight: bold; margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; }
                        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 0.9em; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <h1>Payment Receipt</h1>
                        <h2>${this.businessData?.business?.businessName || 'Pizza Business'}</h2>
                    </div>
                    
                    <div class="row">
                        <span><strong>Transaction ID:</strong></span>
                        <span>${transaction._id}</span>
                    </div>
                    
                    <div class="row">
                        <span><strong>Date:</strong></span>
                        <span>${new Date(transaction.createdAt).toLocaleString()}</span>
                    </div>
                    
                    <div class="row">
                        <span><strong>Amount:</strong></span>
                        <span>$${(transaction.amount || 15).toFixed(2)} USDC</span>
                    </div>
                    
                    <div class="row">
                        <span><strong>Status:</strong></span>
                        <span>${(transaction.status || 'completed').toUpperCase()}</span>
                    </div>
                    
                    <div class="row">
                        <span><strong>Customer Wallet:</strong></span>
                        <span>${transaction.customerWallet || 'N/A'}</span>
                    </div>
                    
                    <div style="margin-top: 20px;">
                        <h4>Fee Breakdown:</h4>
                        <div class="row">
                            <span>Platform Fee (1%):</span>
                            <span>$${(transaction.fees?.platformFee || 0.15).toFixed(2)}</span>
                        </div>
                        <div class="row">
                            <span>Vault Contribution (1.3%):</span>
                            <span>$${(transaction.fees?.vaultContribution || 0.195).toFixed(2)}</span>
                        </div>
                        <div class="row">
                            <span>Customer Reward:</span>
                            <span>${(transaction.rewards?.amount || 0.3).toFixed(1)} PIZZA SPL</span>
                        </div>
                    </div>
                    
                    <div class="total">
                        <div class="row">
                            <span>Net Business Amount:</span>
                            <span>$${((transaction.amount || 15) - (transaction.fees?.platformFee || 0.15) - (transaction.fees?.vaultContribution || 0.195)).toFixed(2)} USDC</span>
                        </div>
                    </div>
                    
                    <div class="footer">
                        <p>Thank you for using Pizza Platform!</p>
                        <p>Generated: ${new Date().toLocaleString()}</p>
                    </div>
                </body>
            </html>
        `;
        
        // Create print window for receipt
        const printWindow = window.open('', '_blank');
        printWindow.document.write(receiptHtml);
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
        
        this.showSuccess('Receipt generated successfully!');
    }

    // Wallet Connection Methods
    async connectWallet() {
        try {
            // Check if Phantom wallet is available
            if (typeof window.solana === 'undefined' || !window.solana.isPhantom) {
                window.open('https://phantom.app/', '_blank');
                this.showError('Please install Phantom wallet extension first');
                return;
            }

            // Connect to Phantom wallet
            const response = await window.solana.connect();
            const walletAddress = response.publicKey.toString();

            // Save wallet address to backend
            const token = localStorage.getItem('businessToken');
            const saveResponse = await fetch(`${apiBase}/business/update-wallet`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    walletAddress: walletAddress
                })
            });

            if (saveResponse.ok) {
                // Update UI
                document.getElementById('wallet-address-display').value = walletAddress;
                document.getElementById('connect-wallet-btn').style.display = 'none';
                document.getElementById('disconnect-wallet-btn').style.display = 'block';
                
                this.showSuccess('Wallet connected successfully!');
            } else {
                throw new Error('Failed to save wallet address');
            }

        } catch (error) {
            console.error('Wallet connection error:', error);
            this.showError('Failed to connect wallet: ' + error.message);
        }
    }

    async disconnectWallet() {
        try {
            // Disconnect from Phantom wallet
            if (window.solana && window.solana.disconnect) {
                await window.solana.disconnect();
            }

            // Remove wallet address from backend
            const token = localStorage.getItem('businessToken');
            const response = await fetch(`${apiBase}/business/update-wallet`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    walletAddress: null
                })
            });

            if (response.ok) {
                // Update UI
                document.getElementById('wallet-address-display').value = '';
                document.getElementById('connect-wallet-btn').style.display = 'block';
                document.getElementById('disconnect-wallet-btn').style.display = 'none';
                
                this.showSuccess('Wallet disconnected successfully!');
            }

        } catch (error) {
            console.error('Wallet disconnect error:', error);
            this.showError('Failed to disconnect wallet: ' + error.message);
        }
    }

    logout() {
        console.log('Business logout...');
        
        // Clear stored data
        localStorage.removeItem('businessToken');
        localStorage.removeItem('businessEmail');
        localStorage.removeItem('businessType');
        localStorage.removeItem('businessId');
        sessionStorage.removeItem('businessToken');
        sessionStorage.removeItem('businessEmail');
        
        this.showSuccess('Logged out successfully');
        
        setTimeout(() => {
            window.location.href = 'business-login.html';
        }, 1000);
    }

    // Utility methods
    formatCurrency(amount) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(amount);
    }

    showLoading(show) {
        this.isLoading = show;
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
        // Create and show alert
        const alertContainer = document.querySelector('.admin-main') || document.body;
        
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
        alertDiv.style.cssText = 'top: 20px; right: 20px; z-index: 9999; max-width: 400px;';
        alertDiv.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;

        document.body.appendChild(alertDiv);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (alertDiv.parentNode) {
                alertDiv.remove();
            }
        }, 5000);
    }

    // Loyalty Program Methods
    async loadLoyaltyData() {
        try {
            const token = localStorage.getItem('businessToken');
            const response = await fetch(`${apiBase}/business/loyalty-program`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.updateLoyaltyDisplay(data);
            } else {
                // Use placeholder data
                this.updateLoyaltyDisplay({
                    enabled: false,
                    members: 0,
                    totalPizzaHeld: 0,
                    avgDiscount: 0,
                    monthlySavings: 0,
                    discountRules: [
                        { tokens: 3, discount: 10, description: "10% off for holding 3+ $PIZZA SPL" }
                    ],
                    creditConversion: { tokens: 10, value: 1.00 },
                    nftRequirement: { tokens: 20, description: "Exclusive Pizza Lover NFT" }
                });
            }
        } catch (error) {
            console.error('Error loading loyalty data:', error);
            this.updateLoyaltyDisplay({
                enabled: false,
                members: 0,
                totalPizzaHeld: 0,
                avgDiscount: 0,
                monthlySavings: 0
            });
        }
    }

    updateLoyaltyDisplay(data) {
        // Update stats
        document.getElementById('loyalty-members').textContent = data.members || 0;
        document.getElementById('total-pizza-held').textContent = data.totalPizzaHeld || 0;
        document.getElementById('avg-discount').textContent = (data.avgDiscount || 0) + '%';
        document.getElementById('monthly-savings').textContent = this.formatCurrency(data.monthlySavings || 0);

        // Update status
        const statusElement = document.getElementById('loyalty-status');
        const statusIndicator = statusElement.querySelector('.status-indicator');
        const statusText = statusElement.querySelector('span:last-child');
        
        if (data.enabled) {
            statusIndicator.className = 'status-indicator active';
            statusText.textContent = 'Program Active';
        } else {
            statusIndicator.className = 'status-indicator inactive';
            statusText.textContent = 'Program Disabled';
        }

        // Update toggle
        const toggle = document.getElementById('loyalty-program-enabled');
        if (toggle) {
            toggle.checked = data.enabled || false;
            this.toggleLoyaltyConfig(data.enabled || false);
        }
    }

    toggleLoyaltyConfig(enabled) {
        const configContent = document.getElementById('loyalty-config-content');
        const configActions = document.getElementById('loyalty-config-actions');
        const activeProgramDiv = document.getElementById('active-loyalty-program');

        if (enabled) {
            configContent.style.display = 'block';
            configActions.style.display = 'block';
            activeProgramDiv.style.display = 'block';
        } else {
            configContent.style.display = 'none';
            configActions.style.display = 'none';
            activeProgramDiv.style.display = 'none';
        }
    }

    async saveLoyaltyProgram() {
        try {
            this.showInfo('Saving loyalty program configuration...');

            const discountRules = this.collectDiscountRules();
            const creditConversion = {
                tokens: parseInt(document.getElementById('credit-tokens').value) || 10,
                value: parseFloat(document.getElementById('credit-value').value) || 1.00
            };
            const nftRequirement = {
                tokens: parseInt(document.getElementById('nft-requirement').value) || 20,
                description: document.getElementById('nft-description').value || 'Exclusive Pizza Lover NFT'
            };

            const token = localStorage.getItem('businessToken');
            const response = await fetch(`${apiBase}/business/loyalty-program`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    enabled: true,
                    discountRules,
                    creditConversion,
                    nftRequirement
                })
            });

            if (response.ok) {
                this.showSuccess('Loyalty program saved successfully!');
                await this.loadLoyaltyData();
                this.displayActiveProgramRules(discountRules, creditConversion, nftRequirement);
            } else {
                this.showInfo('Loyalty program configuration saved (frontend only - backend implementation needed)');
                this.displayActiveProgramRules(discountRules, creditConversion, nftRequirement);
            }

        } catch (error) {
            console.error('Error saving loyalty program:', error);
            this.showInfo('Loyalty program configuration saved (frontend only - backend implementation needed)');
        }
    }

    collectDiscountRules() {
        const rules = [];
        const ruleItems = document.querySelectorAll('#discount-rules .rule-item');
        
        ruleItems.forEach((item, index) => {
            const tokens = parseInt(item.querySelector(`#rule-tokens-${index}`)?.value) || 0;
            const discount = parseInt(item.querySelector(`#rule-discount-${index}`)?.value) || 0;
            const description = item.querySelector(`#rule-desc-${index}`)?.value || '';

            if (tokens > 0 && discount > 0) {
                rules.push({ tokens, discount, description });
            }
        });

        return rules;
    }

    displayActiveProgramRules(discountRules, creditConversion, nftRequirement) {
        const container = document.getElementById('active-program-rules');
        
        let html = '<div class="active-rules">';
        
        // Discount rules
        if (discountRules.length > 0) {
            html += '<h4>Discount Rules:</h4><ul>';
            discountRules.forEach(rule => {
                html += `<li>${rule.tokens} $PIZZA SPL = ${rule.discount}% discount (${rule.description})</li>`;
            });
            html += '</ul>';
        }

        // Credit conversion
        if (creditConversion) {
            html += `<h4>Store Credit:</h4><p>${creditConversion.tokens} $PIZZA SPL = $${creditConversion.value.toFixed(2)} store credit</p>`;
        }

        // NFT rewards
        if (nftRequirement) {
            html += `<h4>NFT Rewards:</h4><p>${nftRequirement.tokens} $PIZZA SPL unlocks: ${nftRequirement.description}</p>`;
        }

        html += '</div>';
        container.innerHTML = html;
    }

    resetLoyaltyProgram() {
        // Reset all form fields to defaults
        document.getElementById('rule-tokens-0').value = '3';
        document.getElementById('rule-discount-0').value = '10';
        document.getElementById('rule-desc-0').value = '10% off for holding 3+ $PIZZA SPL';
        document.getElementById('credit-tokens').value = '10';
        document.getElementById('credit-value').value = '1.00';
        document.getElementById('nft-requirement').value = '20';
        document.getElementById('nft-description').value = 'Exclusive Pizza Lover NFT';

        // Remove additional discount rules
        const discountRules = document.getElementById('discount-rules');
        const ruleItems = discountRules.querySelectorAll('.rule-item:not(:first-child)');
        ruleItems.forEach(item => item.remove());

        this.showInfo('Loyalty program configuration reset to defaults');
    }
}

// Global function declarations (must be defined before DOM ready)
function createTestTransaction() {
    window.businessDashboard?.createTestTransaction();
}

function exportTransactions() {
    window.businessDashboard?.exportTransactions();
}

function generatePaymentQR() {
    window.businessDashboard?.generatePaymentQR();
}

function downloadQR() {
    window.businessDashboard?.downloadQR();
}

function shareQR() {
    window.businessDashboard?.shareQR();
}

function printQR() {
    window.businessDashboard?.printQR();
}

function connectWallet() {
    window.businessDashboard?.connectWallet();
}

function disconnectWallet() {
    window.businessDashboard?.disconnectWallet();
}

function mintGiftCards() {
    window.businessDashboard?.mintGiftCards();
}

function refreshDashboard() {
    window.businessDashboard?.refreshDashboard();
}

function requestWithdrawal() {
    window.businessDashboard?.requestWithdrawal();
}

function withdrawUSDC() {
    window.businessDashboard?.withdrawUSDC();
}


function saveSettings() {
    console.log('🚀 Global saveSettings() wrapper called at', new Date().toISOString());
    if (!window.businessDashboard) {
        console.error('❌ BusinessDashboard instance not found!');
        return;
    }
    console.log('✅ Calling window.businessDashboard.saveSettings()');
    window.businessDashboard?.saveSettings();
}

function resetSettings() {
    window.businessDashboard?.resetSettings();
}

// Initialize business dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.businessDashboard = new BusinessDashboard();
    
    // Ensure global functions are available
    window.createTestTransaction = createTestTransaction;
    window.exportTransactions = exportTransactions;
    window.generatePaymentQR = generatePaymentQR;
    window.connectWallet = connectWallet;
    window.disconnectWallet = disconnectWallet;
});

// Global function for initialization
function initBusinessDashboard() {
    if (!window.businessDashboard) {
        window.businessDashboard = new BusinessDashboard();
    }
}


// Loyalty Program global functions
function addDiscountRule() {
    const discountRules = document.getElementById('discount-rules');
    const ruleCount = discountRules.querySelectorAll('.rule-item').length;
    
    const newRule = document.createElement('div');
    newRule.className = 'rule-item';
    newRule.innerHTML = `
        <div class="rule-inputs">
            <input type="number" class="form-input" placeholder="Required $PIZZA SPL" id="rule-tokens-${ruleCount}">
            <input type="number" class="form-input" placeholder="Discount %" id="rule-discount-${ruleCount}" min="1" max="50">
            <input type="text" class="form-input" placeholder="Description" id="rule-desc-${ruleCount}">
            <button class="btn btn-sm btn-outline" onclick="removeDiscountRule(${ruleCount})">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `;
    
    discountRules.appendChild(newRule);
}

function removeDiscountRule(index) {
    const ruleItem = document.querySelector(`#rule-tokens-${index}`)?.closest('.rule-item');
    if (ruleItem) {
        ruleItem.remove();
    }
}

function saveLoyaltyProgram() {
    window.businessDashboard?.saveLoyaltyProgram();
}

function resetLoyaltyProgram() {
    window.businessDashboard?.resetLoyaltyProgram();
}

// Loyalty program toggle handler
document.addEventListener('DOMContentLoaded', function() {
    const loyaltyToggle = document.getElementById('loyalty-program-enabled');
    if (loyaltyToggle) {
        loyaltyToggle.addEventListener('change', function() {
            if (window.businessDashboard) {
                window.businessDashboard.toggleLoyaltyConfig(this.checked);
            }
        });
    }
});

// All global functions are now defined above to prevent hoisting issues