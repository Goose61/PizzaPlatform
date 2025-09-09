// API Configuration for Pizza Platform
// Automatically detects environment and sets appropriate API base URL

function getApiBase() {
    // Get current hostname
    const hostname = window.location.hostname;
    
    // If we're on the Cloudflare tunnel domain, use the API tunnel
    if (hostname === 'app.pizzabit.io') {
        return 'https://api.pizzabit.io';
    }
    
    // If we're on localhost or any other local domain, use local API
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.') || hostname.startsWith('10.')) {
        return 'http://localhost:7000';
    }
    
    // Default fallback to local development
    return 'http://localhost:7000';
}

// Export for global use
window.API_BASE = getApiBase();

console.log(`🍕 Pizza Platform API configured: ${window.API_BASE}`);