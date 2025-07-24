// Pizza Community Website JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // Initialize core website functionality
    initializeWebsite();
    initializeMap();
    
    // Auto-start live feed
    if (typeof startLiveFeed === 'function') {
        startLiveFeed();
    }
});

function initializeWebsite() {
    // Smooth scrolling for navigation links
    const navLinks = document.querySelectorAll('.nav-menu a[href^="#"]');
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            const targetSection = document.querySelector(targetId);
            if (targetSection) {
                targetSection.scrollIntoView({
                    behavior: 'smooth'
                });
            }
        });
    });

    // Setup form submissions
    setupFormSubmissions();
    
    // Initialize counters
    initializeCounters();
}

function setupFormSubmissions() {
    // Newsletter form
    const newsletterForm = document.querySelector('.newsletter form');
    if (newsletterForm) {
        newsletterForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const email = this.querySelector('input[type="email"]').value;
            if (email) {
                alert('Thank you for subscribing! 🍕');
                this.reset();
            }
        });
    }
}

function initializeCounters() {
    // Animate statistics counters when in view
    const stats = document.querySelectorAll('.stat strong');
    
    const observerOptions = {
        threshold: 0.5,
        rootMargin: '0px 0px -100px 0px'
    };
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                animateCounter(entry.target);
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);
    
    stats.forEach(stat => {
        observer.observe(stat);
    });
}

function animateCounter(element) {
    const target = parseInt(element.textContent.replace(/,/g, ''));
    const duration = 2000; // 2 seconds
    const step = target / (duration / 16); // 60fps
    let current = 0;
    
    const counter = setInterval(() => {
        current += step;
        if (current >= target) {
            current = target;
            clearInterval(counter);
        }
        element.textContent = Math.floor(current).toLocaleString();
    }, 16);
}

// Google Maps Implementation
let map;
let markers = [];
let infoWindows = [];

// Global callback function for Google Maps API
function initMap() {
    const mapContainer = document.getElementById('pizza-map');
    if (mapContainer) {
        // Initialize Google Map
        map = new google.maps.Map(mapContainer, {
            zoom: 2,
            center: { lat: 20.0, lng: 0.0 },
            mapTypeId: 'terrain',
            styles: [
                {
                    elementType: "geometry",
                    stylers: [{ color: "#242f3e" }]
                },
                {
                    elementType: "labels.text.stroke",
                    stylers: [{ color: "#242f3e" }]
                },
                {
                    elementType: "labels.text.fill",
                    stylers: [{ color: "#746855" }]
                },
                {
                    featureType: "administrative.locality",
                    elementType: "labels.text.fill",
                    stylers: [{ color: "#d59563" }]
                },
                {
                    featureType: "poi",
                    elementType: "labels.text.fill",
                    stylers: [{ color: "#d59563" }]
                },
                {
                    featureType: "poi.park",
                    elementType: "geometry",
                    stylers: [{ color: "#263c3f" }]
                },
                {
                    featureType: "poi.park",
                    elementType: "labels.text.fill",
                    stylers: [{ color: "#6b9a76" }]
                },
                {
                    featureType: "road",
                    elementType: "geometry",
                    stylers: [{ color: "#38414e" }]
                },
                {
                    featureType: "road",
                    elementType: "geometry.stroke",
                    stylers: [{ color: "#212a37" }]
                },
                {
                    featureType: "road",
                    elementType: "labels.text.fill",
                    stylers: [{ color: "#9ca5b3" }]
                },
                {
                    featureType: "road.highway",
                    elementType: "geometry",
                    stylers: [{ color: "#746855" }]
                },
                {
                    featureType: "road.highway",
                    elementType: "geometry.stroke",
                    stylers: [{ color: "#1f2835" }]
                },
                {
                    featureType: "road.highway",
                    elementType: "labels.text.fill",
                    stylers: [{ color: "#f3d19c" }]
                },
                {
                    featureType: "transit",
                    elementType: "geometry",
                    stylers: [{ color: "#2f3948" }]
                },
                {
                    featureType: "transit.station",
                    elementType: "labels.text.fill",
                    stylers: [{ color: "#d59563" }]
                },
                {
                    featureType: "water",
                    elementType: "geometry",
                    stylers: [{ color: "#17263c" }]
                },
                {
                    featureType: "water",
                    elementType: "labels.text.fill",
                    stylers: [{ color: "#515c6d" }]
                },
                {
                    featureType: "water",
                    elementType: "labels.text.stroke",
                    stylers: [{ color: "#17263c" }]
                }
            ]
        });

        // Load locations from data
        loadMapLocations();
        
        // Set as global for admin access
        window.pizzaMap = {
            map: map,
            markers: markers,
            addLocation: addLocationMarker,
            refreshLocations: loadMapLocations,
            centerOnLocation: centerOnLocation
        };
    }
}

function loadMapLocations() {
    if (!window.pizzaMapData) return;
    
    // Clear existing markers
    clearMarkers();
    
    const locations = window.pizzaMapData.getLocations();
    locations.forEach(location => {
        addLocationMarker(location);
    });
}

function addLocationMarker(location) {
    const position = { lat: location.lat, lng: location.lng };
    const statusColor = getStatusColor(location.status);
    
    // Create custom marker icon (pizza slice)
    const markerIcon = {
        path: "M12 2C13.1 2 14 2.9 14 4C14 5.1 13.1 6 12 6C10.9 6 10 5.1 10 4C10 2.9 10.9 2 12 2ZM21 9V7L15 8L13 10V15L17.25 16.15C18.35 16.5 19 17.15 19 18V20H5V18C5 17.15 5.65 16.5 6.75 16.15L11 15V10L9 8L3 7V9H1V7C1 6.45 1.45 6 2 6H4L10 4.5C10.33 4.4 10.67 4.4 11 4.5L17 6H19C19.55 6 20 6.45 20 7V9H21Z",
        fillColor: statusColor,
        fillOpacity: 1,
        strokeWeight: 2,
        strokeColor: '#ffffff',
        scale: 1.5,
    };
    
    const marker = new google.maps.Marker({
        position: position,
        map: map,
        icon: markerIcon,
        title: location.name
    });
    
    // Create info window content
    const infoContent = createInfoWindowContent(location);
    const infoWindow = new google.maps.InfoWindow({
        content: infoContent
    });
    
    // Add click listener
    marker.addListener('click', () => {
        // Close all other info windows
        infoWindows.forEach(iw => iw.close());
        infoWindow.open(map, marker);
    });
    
    // Store references
    marker.locationId = location.id;
    markers.push(marker);
    infoWindows.push(infoWindow);
    
    return marker;
}

function getStatusColor(status) {
    const colors = {
        'active': '#4CAF50',
        'progress': '#ff9800',
        'planned': '#757575'
    };
    return colors[status] || '#757575';
}

function createInfoWindowContent(location) {
    const statusText = {
        'active': 'Active',
        'progress': 'In Progress',
        'planned': 'Planned'
    };
    
    return `
        <div class="map-popup" style="color: #333; min-width: 250px;">
            <h3 style="color: #ff6b35; margin-bottom: 0.5rem; font-size: 1.1rem;">${location.name}</h3>
            <div style="color: #666; margin-bottom: 0.5rem; font-size: 0.9rem;">${location.city}, ${location.country}</div>
            <span class="status-badge status-${location.status}" style="display: inline-block; padding: 0.2rem 0.6rem; border-radius: 12px; font-size: 0.8rem; font-weight: bold; margin-bottom: 0.8rem; background-color: ${getStatusColor(location.status)}; color: white;">
                ${statusText[location.status]}
            </span>
            <div style="display: flex; gap: 1rem; margin-bottom: 0.8rem;">
                <div style="text-align: center;">
                    <strong style="display: block; color: #ff6b35; font-size: 1.1rem;">${(location.meals_served || 0).toLocaleString()}</strong>
                    <span style="font-size: 0.8rem; color: #666;">Meals Served</span>
                </div>
                <div style="text-align: center;">
                    <strong style="display: block; color: #ff6b35; font-size: 1.1rem;">${location.partners || 0}</strong>
                    <span style="font-size: 0.8rem; color: #666;">Partners</span>
                </div>
            </div>
            ${location.description ? `<div style="margin-bottom: 0.8rem; font-size: 0.9rem; line-height: 1.4;">${location.description}</div>` : ''}
            ${location.established ? `<div style="font-size: 0.8rem; color: #888; margin-bottom: 0.8rem;">Est. ${new Date(location.established).getFullYear()}</div>` : ''}
            ${location.contact ? `<a href="mailto:${location.contact}" style="display: inline-flex; align-items: center; gap: 0.3rem; color: #ff6b35; text-decoration: none; font-size: 0.9rem;">
                <i class="fas fa-envelope"></i> Contact Location
            </a>` : ''}
        </div>
    `;
}

function clearMarkers() {
    markers.forEach(marker => {
        marker.setMap(null);
    });
    markers = [];
    infoWindows = [];
}

function centerOnLocation(locationId) {
    const marker = markers.find(m => m.locationId === locationId);
    if (marker) {
        map.setCenter(marker.getPosition());
        map.setZoom(8);
        // Find and open the corresponding info window
        const index = markers.indexOf(marker);
        if (index !== -1 && infoWindows[index]) {
            infoWindows.forEach(iw => iw.close());
            infoWindows[index].open(map, marker);
        }
    }
}

// Fallback map initialization for website
function initializeMap() {
    // Initialize map data if not already loaded
    if (!window.pizzaMapData) {
        console.warn('Map data not loaded. Initializing with default data.');
        window.pizzaMapData = new PizzaMapData();
    }
    
    // The actual map initialization happens via the Google Maps callback (initMap)
    // This function just ensures the data is ready
    if (typeof google !== 'undefined' && google.maps) {
        initMap();
    }
}

// Live feed system
function startLiveFeed() {
    const feedContainer = document.querySelector('.feed-container');
    if (!feedContainer) return;
    
    const feedItems = [
        { icon: 'fas fa-pizza-slice', text: 'Just served 50 meals in Mumbai', time: '2 min ago' },
        { icon: 'fas fa-handshake', text: 'New partnership formed in São Paulo', time: '5 min ago' },
        { icon: 'fas fa-coins', text: '1.2K $PIZZA tokens donated', time: '8 min ago' },
        { icon: 'fas fa-map-marker-alt', text: 'Chicago Food Network expanding', time: '12 min ago' },
        { icon: 'fas fa-heart', text: 'Thank you message from Lagos', time: '15 min ago' },
        { icon: 'fas fa-pizza-slice', text: 'Emergency relief in Kiev completed', time: '18 min ago' },
        { icon: 'fas fa-users', text: '25 new volunteers joined today', time: '22 min ago' },
        { icon: 'fas fa-globe', text: 'Global milestone: 10K meals served!', time: '25 min ago' }
    ];
    
    let currentIndex = 0;
    
    function addFeedItem() {
        const item = feedItems[currentIndex];
        const feedItem = document.createElement('div');
        feedItem.className = 'feed-item';
        feedItem.innerHTML = `
            <div>
                <i class="${item.icon}"></i>
                <span>${item.text}</span>
            </div>
            <small>${item.time}</small>
        `;
        
        feedContainer.insertBefore(feedItem, feedContainer.firstChild);
        
        // Remove oldest items if more than 5
        while (feedContainer.children.length > 5) {
            feedContainer.removeChild(feedContainer.lastChild);
        }
        
        currentIndex = (currentIndex + 1) % feedItems.length;
    }
    
    // Add initial items
    for (let i = 0; i < 3; i++) {
        addFeedItem();
    }
    
    // Continue adding items every 8 seconds
    setInterval(addFeedItem, 8000);
}

// Admin login functionality
async function handleAdminLogin(event) {
    event.preventDefault();
    
    const username = document.getElementById('admin-username').value;
    const password = document.getElementById('admin-password').value;
    const rememberMe = document.getElementById('admin-remember').checked;
    
    // Validate inputs
    if (!username || !password) {
        showLoginMessage('Please enter both username and password.', 'error');
        return;
    }
    
    try {
        // Get reCAPTCHA token if available
        const recaptchaToken = typeof grecaptcha !== 'undefined' 
            ? grecaptcha.getResponse() 
            : null;
        
        const response = await fetch('/api/admin/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                username,
                password,
                recaptchaToken,
                rememberMe
            })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            // Store authentication token securely
            const authData = {
                token: data.token,
                username: data.admin.username,
                role: data.admin.role,
                permissions: data.admin.permissions,
                loginTime: new Date().toISOString(),
                rememberMe: rememberMe
            };
            
            if (rememberMe) {
                localStorage.setItem('pizza_admin_auth', JSON.stringify(authData));
            } else {
                sessionStorage.setItem('pizza_admin_auth', JSON.stringify(authData));
            }
            
            // Show success message
            showLoginMessage('Login successful! Redirecting...', 'success');
            
            // Redirect to dashboard
            setTimeout(() => {
                window.location.href = 'admin-dashboard.html';
            }, 1500);
        } else {
            showLoginMessage(data.message || 'Invalid username or password. Please try again.', 'error');
            document.querySelector('.login-card').classList.add('shake');
            setTimeout(() => {
                document.querySelector('.login-card').classList.remove('shake');
            }, 500);
            
            // Reset reCAPTCHA if it exists
            if (typeof grecaptcha !== 'undefined') {
                grecaptcha.reset();
            }
        }
    } catch (error) {
        console.error('Login error:', error);
        showLoginMessage('Connection error. Please try again.', 'error');
        document.querySelector('.login-card').classList.add('shake');
        setTimeout(() => {
            document.querySelector('.login-card').classList.remove('shake');
        }, 500);
    }
}

function togglePassword() {
    const passwordInput = document.getElementById('admin-password');
    const toggleButton = document.querySelector('.toggle-password');
    
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        toggleButton.innerHTML = '<i class="fas fa-eye-slash"></i>';
    } else {
        passwordInput.type = 'password';
        toggleButton.innerHTML = '<i class="fas fa-eye"></i>';
    }
}

function showLoginMessage(message, type) {
    // Remove existing messages
    const existingMessage = document.querySelector('.message');
    if (existingMessage) {
        existingMessage.remove();
    }
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message message-${type}`;
    messageDiv.innerHTML = `
        <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
        <span>${message}</span>
    `;
    
    const form = document.querySelector('.login-form-container');
    form.insertBefore(messageDiv, form.firstChild);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (messageDiv.parentElement) {
            messageDiv.remove();
        }
    }, 5000);
}

// Background animation for admin login
function createFloatingPizzas() {
    const container = document.querySelector('.admin-bg-animation');
    if (!container) return;
    
    for (let i = 0; i < 5; i++) {
        const pizza = document.createElement('div');
        pizza.className = 'floating-pizza';
        pizza.innerHTML = '🍕';
        container.appendChild(pizza);
    }
}

// Initialize floating pizzas if on admin page
if (document.body.classList.contains('admin-body')) {
    document.addEventListener('DOMContentLoaded', createFloatingPizzas);
}

// Export functions for global access
window.pizzaWebsite = {
    initializeMap,
    startLiveFeed,
    handleAdminLogin,
    togglePassword,
    createFloatingPizzas
}; 