// Admin Login JavaScript - Fixed structure
// Load config.js for dynamic API base
const script = document.createElement('script');
script.src = '../config.js';
script.onload = function() {
    console.log(`🍕 Admin login using API: ${window.API_BASE}`);
    loadRecaptchaConfig();
};
document.head.appendChild(script);

const apiBase = window.API_BASE ? window.API_BASE + '/api' : 'http://localhost:7000/api';
let recaptchaSiteKey = null;

// Load reCAPTCHA configuration
async function loadRecaptchaConfig() {
    try {
        const response = await fetch(`${apiBase}/config/recaptcha`);
        if (response.ok) {
            const config = await response.json();
            recaptchaSiteKey = config.siteKey;
            console.log('reCAPTCHA Enterprise v3 configured for admin login');
        } else {
            console.warn('Could not load reCAPTCHA configuration - using fallback');
            // Use fallback site key
            recaptchaSiteKey = '6LdRbK0rAAAAAHBgxTc03a4BZUSlgKov80DRhM7H';
        }
    } catch (error) {
        console.warn('Error loading reCAPTCHA config - using fallback:', error);
        // Use fallback site key
        recaptchaSiteKey = '6LdRbK0rAAAAAHBgxTc03a4BZUSlgKov80DRhM7H';
    }
}

async function handleAdminLogin(event) {
    event.preventDefault();
    console.log('Admin login form submitted'); // Debug log
    
    const username = document.getElementById('admin-username').value.trim();
    const password = document.getElementById('admin-password').value;
    const rememberMe = document.getElementById('admin-remember').checked;

    if (!username || !password) {
        showError('Please enter both username and password');
        return;
    }

    let recaptchaToken = null;
    
    // Use reCAPTCHA Enterprise v3 - invisible
    if (recaptchaSiteKey && typeof grecaptcha !== 'undefined' && grecaptcha.enterprise) {
        try {
            recaptchaToken = await grecaptcha.enterprise.execute(recaptchaSiteKey, {
                action: 'ADMIN_LOGIN'
            });
            console.log('✅ reCAPTCHA Enterprise token generated for ADMIN_LOGIN action');
        } catch (recaptchaError) {
            console.warn('⚠️ reCAPTCHA error (continuing without):', recaptchaError);
            // Continue without reCAPTCHA in development mode
        }
    } else {
        console.warn('⚠️ reCAPTCHA Enterprise not loaded - continuing in development mode');
    }

    // Show loading overlay
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) {
        loadingOverlay.style.display = 'flex';
    }

    try {
        console.log('Sending admin login request to:', `${apiBase}/admin/login`);
        
        const response = await fetch(`${apiBase}/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                username, 
                password, 
                ...(recaptchaToken && { recaptchaToken })
            })
        });
        
        console.log('Admin login response status:', response.status);
        const data = await response.json();
        console.log('Admin login response data:', data);
        
        // Log validation details if present
        if (data.details) {
            console.log('Validation details:', data.details);
        }
        
        if (!response.ok || !data.success) {
            // Hide loading overlay
            if (loadingOverlay) {
                loadingOverlay.style.display = 'none';
            }
            throw new Error(data.error || 'Login failed');
        }
        
        const token = data.token;
        
        if (rememberMe) {
            localStorage.setItem('adminToken', token);
        } else {
            sessionStorage.setItem('adminToken', token);
        }
        
        // Hide loading overlay
        if (loadingOverlay) {
            loadingOverlay.style.display = 'none';
        }
        
        showSuccess('Login successful! Redirecting...');
        
        setTimeout(() => {
            window.location.href = 'admin-dashboard.html';
        }, 1500);
        
    } catch (err) {
        console.error('Admin login error:', err);
        if (loadingOverlay) {
            loadingOverlay.style.display = 'none';
        }
        showError(err.message);
    }
}

function togglePassword(event) {
    const button = event.currentTarget;
    const passwordInput = button.previousElementSibling;
    const icon = button.querySelector('i');
    
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        icon.className = 'fas fa-eye-slash';
    } else {
        passwordInput.type = 'password';
        icon.className = 'fas fa-eye';
    }
}

function showError(message) {
    showAlert(message, 'danger');
}

function showSuccess(message) {
    showAlert(message, 'success');
}

function showAlert(message, type) {
    // Remove any existing alerts
    const existingAlert = document.querySelector('.alert');
    if (existingAlert) {
        existingAlert.remove();
    }
    
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    const container = document.querySelector('.admin-login-container');
    const logo = document.querySelector('.admin-logo');
    if (container && logo) {
        container.insertBefore(alertDiv, logo);
    }
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (alertDiv.parentNode) {
            alertDiv.remove();
        }
    }, 5000);
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', async function() {
    console.log('Admin login page loaded');
    
    // Load reCAPTCHA configuration
    await loadRecaptchaConfig();
    
    // Handle admin login form submission
    const loginForm = document.getElementById('admin-login-form');
    const submitButton = document.querySelector('.admin-login-button');
    
    console.log('Looking for form elements:');
    console.log('Form element:', loginForm);
    console.log('Submit button:', submitButton);
    
    if (loginForm) {
        console.log('Admin login form found, adding event listener');
        loginForm.addEventListener('submit', handleAdminLogin);
        
        // Also add direct button click handler as backup
        if (submitButton) {
            console.log('Adding direct click handler to submit button');
            submitButton.addEventListener('click', function(e) {
                console.log('Direct button click detected');
                e.preventDefault(); // Prevent default form submission
                console.log('Manually triggering handleAdminLogin');
                handleAdminLogin(e);
            });
        }
    } else {
        console.error('Admin login form not found!');
    }
    
    // Toggle password visibility
    const togglePasswordBtns = document.querySelectorAll('.toggle-password');
    console.log('Found toggle password buttons:', togglePasswordBtns.length);
    togglePasswordBtns.forEach(btn => {
        btn.addEventListener('click', togglePassword);
    });
    
    // Basic setup complete
    
    console.log('Admin login initialization complete');
});