// Pizza Community Admin Dashboard JavaScript

// Disable console logs in production for better performance
if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    console.log = function() {};
    console.warn = function() {};
    console.info = function() {};
}

// Global variables
let currentUser = null;
let currentView = 'overview';

// Initialize dashboard
document.addEventListener('DOMContentLoaded', function() {
    checkAuthAndInit();
    initializeMap();
    loadDashboardData();
    
    // Set up event listeners
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault(); // Prevent default link behavior
            const view = this.dataset.view;
            if (view) {
                switchView(view);
            } else {
                showNotification('Navigation error: Invalid menu item', 'error');
            }
        });
    });
    
    // Logout functionality
    document.getElementById('admin-logout').addEventListener('click', handleLogout);
    
    // Setup form handlers
    setupFormHandlers();
    
    // Setup search and filter
    setupSearchAndFilter();
    
    // Auto-refresh data every 30 seconds
    setInterval(loadDashboardData, 30000);
});

// Authentication check and initialization
function checkAuthAndInit() {
    const loginData = localStorage.getItem('pizza_admin_login') || sessionStorage.getItem('pizza_admin_login');
    
    if (!loginData) {
        // Not logged in, redirect to login
        window.location.href = 'admin.html';
        return;
    }
    
    const data = JSON.parse(loginData);
    const loginTime = new Date(data.loginTime);
    const now = new Date();
    const timeDiff = now - loginTime;
    
    // Check if login is still valid
    if (data.rememberMe && timeDiff >= 24 * 60 * 60 * 1000) {
        // Login expired
        localStorage.removeItem('pizza_admin_login');
        sessionStorage.removeItem('pizza_admin_login');
        window.location.href = 'admin.html';
        return;
    }
    
    // Valid login, set current user
    currentUser = data.username;
    
    // Update user display
    document.getElementById('current-user').textContent = currentUser;
    
    // Log dashboard access
    // Dashboard access logged automatically by auth system
}

// Admin activity logging - Only log important location changes
function logAdminActivity(action, details = '') {
    if (!currentUser) return;
    
    // Only log important location operations
    const importantActions = ['LOCATION_ADDED', 'LOCATION_UPDATED', 'LOCATION_DELETED', 'LOCATION_MOVED'];
    if (!importantActions.includes(action)) return;
    
    const log = {
        timestamp: new Date().toISOString(),
        username: currentUser,
        action: action,
        details: details,
        ip: 'localhost'
    };
    
    // Get existing logs
    const existingLogs = JSON.parse(localStorage.getItem('pizza_admin_logs') || '[]');
    
    // Add new log
    existingLogs.unshift(log);
    
    // Keep only last 100 logs
    if (existingLogs.length > 100) {
        existingLogs.splice(100);
    }
    
    // Save logs
    localStorage.setItem('pizza_admin_logs', JSON.stringify(existingLogs));
    
    // Save to text file as well
    saveLogToTextFile(log);
}

// Save log to downloadable text file
function saveLogToTextFile(log) {
    try {
        const logText = `[${log.timestamp}] ${log.username} - ${log.action}: ${log.details}\n`;
        
        // Create or append to log file content
        const existingLogText = localStorage.getItem('pizza_admin_log_file') || '';
        const updatedLogText = logText + existingLogText;
        
        // Keep only last 50 entries in text format
        const lines = updatedLogText.split('\n').filter(line => line.trim());
        if (lines.length > 50) {
            lines.splice(50);
        }
        
        localStorage.setItem('pizza_admin_log_file', lines.join('\n') + '\n');
        
        // Auto-download log file (optional - can be triggered by admin)
        if (log.action === 'LOCATION_DELETED') {
            downloadLogFile();
        }
    } catch (error) {
        console.error('Failed to save log to text file:', error);
    }
}

// Download admin log file
function downloadLogFile() {
    try {
        const logContent = localStorage.getItem('pizza_admin_log_file') || 'No admin logs available.\n';
        const blob = new Blob([logContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `pizza_admin_logs_${new Date().toISOString().split('T')[0]}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showNotification('Admin log file downloaded', 'success');
    } catch (error) {
        console.error('Failed to download log file:', error);
        showNotification('Failed to download log file', 'error');
    }
}

// Handle logout
function handleLogout() {
    // Logout doesn't need logging
    
    // Clear authentication data
    localStorage.removeItem('pizza_admin_login');
    sessionStorage.removeItem('pizza_admin_login');
    
    // Show logout message
    showNotification('Logged out successfully', 'success');
    
    // Redirect to login after a brief delay
    setTimeout(() => {
        window.location.href = 'admin.html';
    }, 1000);
}

// Switch between dashboard views
function switchView(view) {
    
    // Update navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    
    const navItem = document.querySelector(`[data-view="${view}"]`);
    if (navItem) {
        navItem.classList.add('active');
    }
    
    // Update content
    document.querySelectorAll('.dashboard-section').forEach(section => {
        section.classList.remove('active');
    });
    
    const targetSection = document.getElementById(`${view}-section`);
    if (targetSection) {
        targetSection.classList.add('active');
    } else {
        showNotification(`View "${view}" not found`, 'error');
        return;
    }
    
    currentView = view;
    
    // View changes don't need logging
    
    // Load specific data for view
    if (view === 'locations') {
        loadLocationsTable();
        // Initialize locations display map
        setTimeout(() => {
            if (!locationsDisplayMap) {
                initializeLocationsDisplayMap();
            } else {
                locationsDisplayMap.invalidateSize();
                updateLocationsDisplayMap();
            }
        }, 100);
    } else if (view === 'map') {
        setTimeout(() => {
            if (window.adminMap) {
                window.adminMap.invalidateSize();
            }
        }, 100);
    }
}

// Load dashboard data
function loadDashboardData() {
    const data = pizzaMapData.getLocations();
    const stats = pizzaMapData.getTotalStats();
    
    // Update overview stats
    document.getElementById('total-partners').textContent = stats.totalPartners;
    document.getElementById('total-meals').textContent = stats.totalMeals.toLocaleString();
    document.getElementById('countries-reached').textContent = stats.countriesReached;
    document.getElementById('active-campaigns').textContent = stats.activeCampaigns;
    
    // Update progress bars
    updateProgressBar('partner-growth', 75);
    updateProgressBar('meal-distribution', 60);
    updateProgressBar('community-engagement', 85);
    
    // Update recent activity
    updateRecentActivity();
    
    if (currentView === 'locations') {
        loadLocationsTable();
    }
}

// Update progress bar
function updateProgressBar(id, percentage) {
    const progressBar = document.querySelector(`#${id} .progress-fill`);
    const progressText = document.querySelector(`#${id} .progress-text`);
    
    if (progressBar && progressText) {
        progressBar.style.width = `${percentage}%`;
        progressText.textContent = `${percentage}%`;
    }
}

// Load locations table
function loadLocationsTable() {
    const locations = pizzaMapData.getLocations();
    const tbody = document.querySelector('#locations-table tbody');
    
    tbody.innerHTML = '';
    
    locations.forEach(location => {
        const row = createLocationRow(location);
        tbody.appendChild(row);
    });
}

// Create location table row
function createLocationRow(location) {
    const row = document.createElement('tr');
    
    const statusBadge = getStatusBadge(location.status);
    
    row.innerHTML = `
        <td>
            <div class="location-info">
                <strong>${location.name}</strong>
                <small>${location.city}, ${location.country}</small>
            </div>
        </td>
        <td>${statusBadge}</td>
        <td>${location.partners}</td>
        <td>${(location.meals_served || location.mealsServed || 0).toLocaleString()}</td>
        <td>${new Date(location.established || location.dateAdded).toLocaleDateString()}</td>
        <td>
            <div class="action-buttons">
                <button class="btn btn-sm btn-outline" onclick="editLocation('${location.id}')">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteLocation('${location.id}')">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </td>
    `;
    
    return row;
}

// Get status badge HTML
function getStatusBadge(status) {
    const badges = {
        'active': '<span class="status-badge active">Active</span>',
        'progress': '<span class="status-badge progress">In Progress</span>',
        'planned': '<span class="status-badge planned">Planned</span>',
        // Backward compatibility
        'in-progress': '<span class="status-badge progress">In Progress</span>'
    };
    return badges[status] || badges['planned'];
}

// Setup form handlers
function setupFormHandlers() {
    // Add location form
    const addLocationForm = document.getElementById('add-location-form');
    if (addLocationForm) {
        addLocationForm.addEventListener('submit', handleAddLocation);
    }
}

// Handle add location
function handleAddLocation(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const locationData = {
        name: formData.get('location-name'),
        city: formData.get('city'),
        country: formData.get('country'),
        lat: parseFloat(formData.get('latitude')),
        lng: parseFloat(formData.get('longitude')),
        partners: parseInt(formData.get('partners')) || 0,
        meals_served: parseInt(formData.get('meals-served')) || 0,
        status: formData.get('status'),
        contact: formData.get('contact'),
        phone: formData.get('phone'),
        email: formData.get('email')
    };
    
    // Validate required fields
    if (!locationData.name || !locationData.city || !locationData.country || 
        isNaN(locationData.lat) || isNaN(locationData.lng)) {
        showNotification('Please fill in all required fields correctly', 'error');
        return;
    }
    
    // Add location
    const locationId = pizzaMapData.addLocation(locationData);
    
    if (locationId) {
        logAdminActivity('LOCATION_ADDED', `Added location: ${locationData.name} in ${locationData.city}, ${locationData.country}`);
        showNotification('Location added successfully!', 'success');
        
        // Clear form
        event.target.reset();
        
        // Refresh data
        loadDashboardData();
        
        // Update map if visible
        if (window.adminMap) {
            updateMapMarkers();
        }
    } else {
        showNotification('Failed to add location', 'error');
    }
}

// Edit location
function editLocation(locationId) {
    const location = pizzaMapData.getLocationById(locationId);
    if (!location) {
        showNotification('Location not found', 'error');
        return;
    }
    
    // Switch to map view and populate form
    switchView('map');
    
    // Show the form container
    const formContainer = document.getElementById('location-form-container');
    if (formContainer) {
        formContainer.style.display = 'block';
    }
    
    // Populate form with existing data
    const form = document.getElementById('add-location-form');
    if (!form) {
        showNotification('Form not found', 'error');
        return;
    }
    
    form.querySelector('[name="location-name"]').value = location.name;
    form.querySelector('[name="city"]').value = location.city;
    form.querySelector('[name="country"]').value = location.country;
    form.querySelector('[name="latitude"]').value = location.lat;
    form.querySelector('[name="longitude"]').value = location.longitude;
    form.querySelector('[name="partners"]').value = location.partners;
    form.querySelector('[name="meals-served"]').value = location.meals_served || location.mealsServed || 0;
    form.querySelector('[name="status"]').value = location.status;
    form.querySelector('[name="contact"]').value = location.contact || '';
    form.querySelector('[name="phone"]').value = location.phone || '';
    form.querySelector('[name="email"]').value = location.email || '';
    
    // Change form to edit mode
    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) {
        submitButton.innerHTML = '<i class="fas fa-save"></i> Update Location';
    }
    
    // Update form handler
    form.onsubmit = function(event) {
        event.preventDefault();
        handleUpdateLocation(event, locationId);
    };
    
    // Edit start doesn't need logging - only actual changes matter
}

// Handle update location
function handleUpdateLocation(event, locationId) {
    const formData = new FormData(event.target);
    const locationData = {
        name: formData.get('location-name'),
        city: formData.get('city'),
        country: formData.get('country'),
        lat: parseFloat(formData.get('latitude')),
        lng: parseFloat(formData.get('longitude')),
        partners: parseInt(formData.get('partners')) || 0,
        meals_served: parseInt(formData.get('meals-served')) || 0,
        status: formData.get('status'),
        contact: formData.get('contact'),
        phone: formData.get('phone'),
        email: formData.get('email')
    };
    
    // Update location
    const success = pizzaMapData.updateLocation(locationId, locationData);
    
    if (success) {
        logAdminActivity('LOCATION_UPDATED', `Updated location: ${locationData.name} in ${locationData.city}, ${locationData.country}`);
        showNotification('Location updated successfully!', 'success');
        
        // Reset form
        resetAddLocationForm();
        
        // Refresh data
        loadDashboardData();
        
        // Update map if visible
        if (window.adminMap) {
            updateMapMarkers();
        }
        
        // Hide the form and switch back to locations view
        const formContainer = document.getElementById('location-form-container');
        if (formContainer) {
            formContainer.style.display = 'none';
        }
        switchView('locations');
    } else {
        showNotification('Failed to update location', 'error');
    }
}

// Reset add location form
function resetAddLocationForm() {
    const form = document.getElementById('add-location-form');
    if (!form) return;
    
    form.reset();
    
    // Reset submit button
    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) {
        submitButton.innerHTML = '<i class="fas fa-plus"></i> Add Location';
    }
    
    // Reset form handler
    form.onsubmit = handleAddLocationEnhanced;
}

// Delete location
function deleteLocation(locationId) {
    const location = pizzaMapData.getLocationById(locationId);
    if (!location) {
        showNotification('Location not found', 'error');
        return;
    }
    
    if (confirm(`Are you sure you want to delete "${location.name}" in ${location.city}, ${location.country}?`)) {
        const success = pizzaMapData.deleteLocation(locationId);
        
        if (success) {
            logAdminActivity('LOCATION_DELETED', `Deleted location: ${location.name} in ${location.city}, ${location.country}`);
            showNotification('Location deleted successfully!', 'success');
            
            // Refresh data
            loadDashboardData();
            
            // Update map if visible
            if (window.adminMap) {
                updateMapMarkers();
            }
        } else {
            showNotification('Failed to delete location', 'error');
        }
    }
}

// Setup search and filter
function setupSearchAndFilter() {
    const searchInput = document.getElementById('location-search');
    const statusFilter = document.getElementById('status-filter');
    
    if (searchInput) {
        searchInput.addEventListener('input', filterLocations);
    }
    
    if (statusFilter) {
        statusFilter.addEventListener('change', filterLocations);
    }
}

// Filter locations
function filterLocations() {
    const searchTerm = document.getElementById('location-search')?.value.toLowerCase() || '';
    const statusFilter = document.getElementById('status-filter')?.value || '';
    
    const rows = document.querySelectorAll('#locations-table tbody tr');
    
    rows.forEach(row => {
        const locationInfo = row.querySelector('.location-info').textContent.toLowerCase();
        const status = row.querySelector('.status-badge').textContent.toLowerCase();
        
        const matchesSearch = locationInfo.includes(searchTerm);
        let matchesStatus = !statusFilter;
        
        if (statusFilter) {
            // Handle both old and new status values
            if (statusFilter === 'progress') {
                matchesStatus = status.includes('progress') || status.includes('in progress');
            } else {
                matchesStatus = status.includes(statusFilter.toLowerCase());
            }
        }
        
        if (matchesSearch && matchesStatus) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
    
            // Filter operations don't need logging
}

// Initialize admin map
function initializeMap() {
    // Initialize map in map view
    setTimeout(() => {
        if (document.getElementById('admin-map')) {
            window.adminMap = L.map('admin-map', {
                center: [20, 0],
                zoom: 2,
                zoomControl: true
            });
            
            // Add dark tile layer
            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: '© OpenStreetMap contributors © CARTO',
                subdomains: 'abcd',
                maxZoom: 19
            }).addTo(window.adminMap);
            
            // Add markers
            updateMapMarkers();
            
            // Map initialization doesn't need logging
        }
    }, 500);
}

// Update map markers
function updateMapMarkers() {
    if (!window.adminMap) return;
    
    // Clear existing markers
    window.adminMap.eachLayer(layer => {
        if (layer instanceof L.Marker) {
            window.adminMap.removeLayer(layer);
        }
    });
    
    // Add location markers
    const locations = pizzaMapData.getLocations();
    
    locations.forEach(location => {
        const marker = L.marker([location.lat, location.lng]).addTo(window.adminMap);
        
        const popupContent = `
            <div class="map-popup">
                <h4>${location.name}</h4>
                <p><strong>📍</strong> ${location.city}, ${location.country}</p>
                <p><strong>🤝</strong> ${location.partners} partners</p>
                <p><strong>🍕</strong> ${(location.meals_served || location.mealsServed || 0).toLocaleString()} meals served</p>
                <p><strong>📱</strong> ${location.contact || 'No contact'}</p>
                <div class="popup-actions">
                    <button onclick="openLocationEditPopup('${location.id}')" class="btn btn-sm btn-primary">Edit</button>
                    <button onclick="deleteLocation('${location.id}')" class="btn btn-sm btn-danger">Delete</button>
                </div>
            </div>
        `;
        
        marker.bindPopup(popupContent);
    });
}

// Update recent activity
function updateRecentActivity() {
    const activityList = document.getElementById('recent-activity-list');
    if (!activityList) return;
    
    // Get recent admin logs
    const logs = JSON.parse(localStorage.getItem('pizza_admin_logs') || '[]');
    const recentLogs = logs.slice(0, 5);
    
    activityList.innerHTML = '';
    
    if (recentLogs.length === 0) {
        activityList.innerHTML = '<div class="activity-item">No recent activity</div>';
        return;
    }
    
    recentLogs.forEach(log => {
        const activityItem = document.createElement('div');
        activityItem.className = 'activity-item';
        
        const timeAgo = getTimeAgo(new Date(log.timestamp));
        const actionText = getActionText(log.action);
        
        activityItem.innerHTML = `
            <div class="activity-content">
                <div class="activity-text">
                    <strong>${log.username}</strong> ${actionText}
                    ${log.details ? `<br><small>${log.details}</small>` : ''}
                </div>
                <div class="activity-time">${timeAgo}</div>
            </div>
        `;
        
        activityList.appendChild(activityItem);
    });
}

// Get action text for display
function getActionText(action) {
    const actionTexts = {
        'SUCCESSFUL_LOGIN': 'logged in',
        'FAILED_LOGIN_ATTEMPT': 'failed login attempt',
        'LOGOUT': 'logged out',
        'DASHBOARD_ACCESS': 'accessed dashboard',
        'VIEW_CHANGE': 'changed view',
        'LOCATION_ADDED': 'added a location',
        'LOCATION_UPDATED': 'updated a location',
        'LOCATION_DELETED': 'deleted a location',
        'LOCATION_EDIT_STARTED': 'started editing a location',
        'LOCATIONS_FILTERED': 'filtered locations',
        'MAP_INITIALIZED': 'initialized map view'
    };
    
    return actionTexts[action] || action.toLowerCase().replace(/_/g, ' ');
}

// Get time ago string
function getTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
}

// Show notification
function showNotification(message, type = 'info') {
    // Remove existing notifications
    const existingNotification = document.querySelector('.notification');
    if (existingNotification) {
        existingNotification.remove();
    }
    
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <i class="fas ${getNotificationIcon(type)}"></i>
        <span>${message}</span>
        <button class="notification-close" onclick="this.parentElement.remove()">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    document.body.appendChild(notification);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 5000);
}

// Get notification icon
function getNotificationIcon(type) {
    const icons = {
        'success': 'fa-check-circle',
        'error': 'fa-exclamation-circle',
        'warning': 'fa-exclamation-triangle',
        'info': 'fa-info-circle'
    };
    return icons[type] || icons['info'];
}

// Enhanced admin dashboard functions
let isAddLocationMode = false;
let isEditMode = false;
let locationsDisplayMap = null;

// Enable add location mode
function enableAddLocationMode() {
    isAddLocationMode = true;
    const formContainer = document.getElementById('location-form-container');
    if (formContainer) {
        formContainer.style.display = 'block';
        resetAddLocationForm();
        
        // Add click listener to map for adding locations
        if (window.adminMap) {
            window.adminMap.on('click', handleMapClickForAdd);
            document.body.style.cursor = 'crosshair';
            showNotification('Click on the map to place a new location pin', 'info');
        }
        
        // Mode changes don't need logging
    }
}

// Handle map click for adding location
function handleMapClickForAdd(e) {
    if (!isAddLocationMode) return;
    
    const { lat, lng } = e.latlng;
    
    // Update form with coordinates
    document.getElementById('latitude').value = lat.toFixed(6);
    document.getElementById('longitude').value = lng.toFixed(6);
    
    // Add temporary marker
    if (window.tempMarker) {
        window.adminMap.removeLayer(window.tempMarker);
    }
    
    window.tempMarker = L.marker([lat, lng]).addTo(window.adminMap);
    window.tempMarker.bindPopup('New location will be placed here').openPopup();
    
    showNotification('Location coordinates set. Fill in the details below.', 'success');
}

// Cancel add location mode
function cancelAddLocation() {
    isAddLocationMode = false;
    const formContainer = document.getElementById('location-form-container');
    if (formContainer) {
        formContainer.style.display = 'none';
    }
    
    // Remove map click listener
    if (window.adminMap) {
        window.adminMap.off('click', handleMapClickForAdd);
        document.body.style.cursor = 'default';
    }
    
    // Remove temporary marker
    if (window.tempMarker) {
        window.adminMap.removeLayer(window.tempMarker);
        window.tempMarker = null;
    }
    
    resetAddLocationForm();
    // Mode changes don't need logging
}

// Toggle edit mode
function toggleEditMode() {
    isEditMode = !isEditMode;
    const button = event.target.closest('button');
    
    if (isEditMode) {
        button.innerHTML = '<i class="fas fa-times"></i> Exit Edit';
        button.classList.remove('btn-outline');
        button.classList.add('btn-secondary');
        showNotification('Edit mode enabled. Drag markers to reposition locations.', 'info');
        makeMarkersEditable();
    } else {
        button.innerHTML = '<i class="fas fa-edit"></i> Edit Mode';
        button.classList.remove('btn-secondary');
        button.classList.add('btn-outline');
        showNotification('Edit mode disabled.', 'info');
        makeMarkersNonEditable();
    }
    
    // Mode changes don't need logging
}

// Make markers editable (draggable)
function makeMarkersEditable() {
    if (!window.adminMap) return;
    
    window.adminMap.eachLayer(layer => {
        if (layer instanceof L.Marker && layer !== window.tempMarker) {
            layer.dragging.enable();
            layer.on('dragend', handleMarkerDragEnd);
        }
    });
}

// Make markers non-editable
function makeMarkersNonEditable() {
    if (!window.adminMap) return;
    
    window.adminMap.eachLayer(layer => {
        if (layer instanceof L.Marker && layer !== window.tempMarker) {
            layer.dragging.disable();
            layer.off('dragend', handleMarkerDragEnd);
        }
    });
}

// Handle marker drag end
function handleMarkerDragEnd(e) {
    const marker = e.target;
    const newPos = marker.getLatLng();
    
    // Find the location for this marker
    const locations = pizzaMapData.getLocations();
    const location = locations.find(loc => 
        Math.abs(loc.lat - marker.originalPos.lat) < 0.0001 && 
        Math.abs(loc.lng - marker.originalPos.lng) < 0.0001
    );
    
    if (location) {
        // Update location coordinates
        const updateData = {
            ...location,
            lat: newPos.lat,
            lng: newPos.lng
        };
        
        const success = pizzaMapData.updateLocation(location.id, updateData);
        
        if (success) {
            marker.originalPos = newPos;
            showNotification(`${location.name} position updated`, 'success');
            logAdminActivity('LOCATION_MOVED', `Moved ${location.name} to ${newPos.lat.toFixed(6)}, ${newPos.lng.toFixed(6)}`);
            
            // Refresh locations display
            loadLocationsTable();
            updateLocationsDisplayMap();
        } else {
            // Revert marker position
            marker.setLatLng(marker.originalPos);
            showNotification('Failed to update location position', 'error');
        }
    }
}

// Initialize locations display map
function initializeLocationsDisplayMap() {
    const mapContainer = document.getElementById('locations-display-map');
    if (!mapContainer) return;
    
    // Initialize map
    locationsDisplayMap = L.map('locations-display-map').setView([20, 0], 2);
    
    // Add dark tile layer
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap contributors © CARTO',
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(locationsDisplayMap);
    
    // Add markers
    updateLocationsDisplayMap();
    
    // Map initialization doesn't need logging
}

// Update locations display map
function updateLocationsDisplayMap() {
    if (!locationsDisplayMap) return;
    
    // Clear existing markers
    locationsDisplayMap.eachLayer(layer => {
        if (layer instanceof L.Marker) {
            locationsDisplayMap.removeLayer(layer);
        }
    });
    
    // Add location markers
    const locations = pizzaMapData.getLocations();
    
    locations.forEach(location => {
        const marker = L.marker([location.lat, location.lng]).addTo(locationsDisplayMap);
        
                        const statusColors = {
                    'active': '#4CAF50',
                    'progress': '#ff9800',
                    'planned': '#757575',
                    // Backward compatibility
                    'in-progress': '#ff9800'
                };
        
        const popupContent = `
            <div class="map-popup">
                <h4>${location.name}</h4>
                <p><strong>📍</strong> ${location.city}, ${location.country}</p>
                <p><strong>Status:</strong> <span style="color: ${statusColors[location.status] || '#757575'}">${location.status}</span></p>
                <p><strong>🤝</strong> ${location.partners} partners</p>
                <p><strong>🍕</strong> ${(location.meals_served || location.mealsServed || 0).toLocaleString()} meals served</p>
                ${location.contact ? `<p><strong>📱</strong> ${location.contact}</p>` : ''}
            </div>
        `;
        
        marker.bindPopup(popupContent);
    });
}

// Enhanced add location form submission
function handleAddLocationEnhanced(event) {
    event.preventDefault();
    
    // Call original add location handler
    handleAddLocation(event);
    
    // If successful, clean up add location mode
    cancelAddLocation();
    
    // Update locations display map
    updateLocationsDisplayMap();
}



// Override form handler for enhanced functionality
document.addEventListener('DOMContentLoaded', function() {
    // Setup enhanced form handler with delay to ensure DOM is ready
    setTimeout(() => {
        const addLocationForm = document.getElementById('add-location-form');
        if (addLocationForm) {
            // Remove any existing listeners
            addLocationForm.removeEventListener('submit', handleAddLocation);
            addLocationForm.removeEventListener('submit', handleAddLocationEnhanced);
            // Add the enhanced handler
            addLocationForm.addEventListener('submit', handleAddLocationEnhanced);
            // Enhanced form handler set up successfully
        } else {
            // Add location form not found during setup
        }
    }, 1500);
});

// Location Edit Popup Functions
function openLocationEditPopup(locationId) {
    const location = pizzaMapData.getLocationById(locationId);
    if (!location) {
        showNotification('Location not found', 'error');
        return;
    }

    // Create popup HTML
    const popupHTML = `
        <div id="location-edit-popup" class="edit-popup-overlay">
            <div class="edit-popup-content">
                <div class="edit-popup-header">
                    <h3><i class="fas fa-edit"></i> Edit Location</h3>
                    <button onclick="closeLocationEditPopup()" class="popup-close-btn">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <form id="location-edit-popup-form" class="edit-popup-form">
                    <div class="form-row">
                        <div class="form-group">
                            <label for="popup-location-name">Location Name *</label>
                            <input type="text" id="popup-location-name" value="${location.name}" required>
                        </div>
                        <div class="form-group">
                            <label for="popup-city">City *</label>
                            <input type="text" id="popup-city" value="${location.city}" required>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label for="popup-country">Country *</label>
                            <input type="text" id="popup-country" value="${location.country}" required>
                        </div>
                        <div class="form-group">
                            <label for="popup-status">Status</label>
                            <select id="popup-status">
                                <option value="active" ${location.status === 'active' ? 'selected' : ''}>Active</option>
                                <option value="progress" ${location.status === 'progress' || location.status === 'in-progress' ? 'selected' : ''}>In Progress</option>
                                <option value="planned" ${location.status === 'planned' ? 'selected' : ''}>Planned</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label for="popup-partners">Partners</label>
                            <input type="number" id="popup-partners" value="${location.partners || 0}" min="0">
                        </div>
                        <div class="form-group">
                            <label for="popup-meals">Meals Served</label>
                            <input type="number" id="popup-meals" value="${location.meals_served || location.mealsServed || 0}" min="0">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label for="popup-latitude">Latitude *</label>
                            <input type="number" id="popup-latitude" value="${location.lat}" step="0.000001" required>
                        </div>
                        <div class="form-group">
                            <label for="popup-longitude">Longitude *</label>
                            <input type="number" id="popup-longitude" value="${location.lng}" step="0.000001" required>
                        </div>
                    </div>
                    <div class="form-group">
                        <label for="popup-contact">Contact</label>
                        <input type="text" id="popup-contact" value="${location.contact || ''}" placeholder="Email or phone">
                    </div>
                    <div class="popup-actions">
                        <button type="button" onclick="closeLocationEditPopup()" class="btn btn-secondary">Cancel</button>
                        <button type="submit" class="btn btn-primary">
                            <i class="fas fa-save"></i> Update Location
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;

    // Add popup to page
    document.body.insertAdjacentHTML('beforeend', popupHTML);

    // Setup form handler
    document.getElementById('location-edit-popup-form').addEventListener('submit', function(e) {
        e.preventDefault();
        updateLocationFromPopup(locationId);
    });

    // Focus first input
    document.getElementById('popup-location-name').focus();
}

function closeLocationEditPopup() {
    const popup = document.getElementById('location-edit-popup');
    if (popup) {
        popup.remove();
    }
}

function updateLocationFromPopup(locationId) {
    const locationData = {
        name: document.getElementById('popup-location-name').value,
        city: document.getElementById('popup-city').value,
        country: document.getElementById('popup-country').value,
        status: document.getElementById('popup-status').value,
        partners: parseInt(document.getElementById('popup-partners').value) || 0,
        meals_served: parseInt(document.getElementById('popup-meals').value) || 0,
        lat: parseFloat(document.getElementById('popup-latitude').value),
        lng: parseFloat(document.getElementById('popup-longitude').value),
        contact: document.getElementById('popup-contact').value || ''
    };

    // Validate required fields
    if (!locationData.name || !locationData.city || !locationData.country || 
        isNaN(locationData.lat) || isNaN(locationData.lng)) {
        showNotification('Please fill in all required fields correctly', 'error');
        return;
    }

    // Update location
    const success = pizzaMapData.updateLocation(locationId, locationData);

    if (success) {
        logAdminActivity('LOCATION_UPDATED', `Updated location: ${locationData.name} in ${locationData.city}, ${locationData.country}`);
        showNotification('Location updated successfully!', 'success');

        // Close popup
        closeLocationEditPopup();

        // Refresh data and maps
        loadDashboardData();
        updateMapMarkers();
        updateLocationsDisplayMap();
    } else {
        showNotification('Failed to update location', 'error');
    }
}

// Export functions for global access
window.enableAddLocationMode = enableAddLocationMode;
window.cancelAddLocation = cancelAddLocation;
window.toggleEditMode = toggleEditMode;
window.openLocationEditPopup = openLocationEditPopup;
window.closeLocationEditPopup = closeLocationEditPopup;
window.downloadLogFile = downloadLogFile;

window.adminDashboard = {
    logout: handleLogout,
    refreshData: loadDashboardData,
    refreshMap: function() {
        if (window.adminMap) {
            window.adminMap.invalidateSize();
        }
    },
    centerMap: function() {
        if (window.adminMap) {
            window.adminMap.setView([20, 0], 2);
        }
    },
    clearForm: resetAddLocationForm,
    editLocation: editLocation,
    deleteLocation: deleteLocation,
    enableAddLocationMode: enableAddLocationMode,
    cancelAddLocation: cancelAddLocation,
    toggleEditMode: toggleEditMode,
    initializeLocationsDisplayMap: initializeLocationsDisplayMap,
    updateLocationsDisplayMap: updateLocationsDisplayMap
}; 