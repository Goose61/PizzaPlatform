// Pizza Community Map Data Manager

class PizzaMapData {
    constructor() {
        this.storageKey = 'pizza_map_locations';
        this.defaultLocations = [
            {
                id: 1,
                name: "Tastee Pizza",
                city: "Hawthorne",
                country: "USA",
                state: "NJ",
                lat: 40.9495,
                lng: -74.1535,
                status: "active",
                meals_served: 2800,
                partners: 5,
                description: "Family-owned pizzeria serving the Hawthorne community since 1982",
                contact: "tastee@pizzacommunity.org",
                established: "2023-10-15"
            },
            {
                id: 2,
                name: "ROCK N GRILL",
                city: "Glen Rock",
                country: "USA",
                state: "NJ",
                lat: 40.9629,
                lng: -74.1329,
                status: "active",
                meals_served: 3200,
                partners: 8,
                description: "Local favorite serving Glen Rock and surrounding areas",
                contact: "rockngrill@pizzacommunity.org",
                established: "2023-11-20"
            },
            {
                id: 3,
                name: "Uncle Louie's",
                city: "Franklin Lakes",
                country: "USA",
                state: "NJ",
                lat: 41.0168,
                lng: -74.2057,
                status: "active",
                meals_served: 2400,
                partners: 6,
                description: "Community-focused pizzeria in Franklin Lakes",
                contact: "unclelouies@pizzacommunity.org",
                established: "2023-09-10"
            },
            {
                id: 4,
                name: "Haledon Pizza",
                city: "Haledon",
                country: "USA",
                state: "NJ",
                lat: 40.9354,
                lng: -74.1863,
                status: "active",
                meals_served: 1900,
                partners: 4,
                description: "Serving the Haledon community with fresh pizza daily",
                contact: "haledon@pizzacommunity.org",
                established: "2023-08-25"
            },
            {
                id: 5,
                name: "JJ's Pizza",
                city: "Wyandotte",
                country: "USA",
                state: "MI",
                lat: 42.2142,
                lng: -83.1499,
                status: "active",
                meals_served: 3600,
                partners: 9,
                description: "Michigan's favorite since 1974, serving Wyandotte and beyond",
                contact: "jjs@pizzacommunity.org",
                established: "2023-12-05"
            },
            {
                id: 6,
                name: "Coastal Smash",
                city: "Bradenton",
                country: "USA",
                state: "FL",
                lat: 27.4989,
                lng: -82.5748,
                status: "active",
                meals_served: 4100,
                partners: 12,
                description: "Florida's coastal pizza destination in Bradenton",
                contact: "coastalsmash@pizzacommunity.org",
                established: "2023-07-15"
            },
            {
                id: 7,
                name: "Domino's Pizza",
                city: "Chicago",
                country: "USA",
                state: "IL",
                lat: 41.8781,
                lng: -87.6298,
                status: "active",
                meals_served: 5200,
                partners: 15,
                description: "Chicago's premier Domino's location serving the downtown area",
                contact: "chicago@pizzacommunity.org",
                established: "2023-06-20"
            }
        ];
        
        this.initializeData();
    }

    initializeData() {
        // Clear any existing cached data to force refresh with new locations
        localStorage.removeItem(this.storageKey);
        
        if (!localStorage.getItem(this.storageKey)) {
            this.saveLocations(this.defaultLocations);
            console.log('Initialized map with new default locations:', this.defaultLocations);
        } else {
            // Migrate any locations with old 'in-progress' status to 'progress'
            this.migrateStatusValues();
        }
    }

    migrateStatusValues() {
        const locations = this.getLocations();
        let hasChanges = false;
        
        locations.forEach(location => {
            if (location.status === 'in-progress') {
                location.status = 'progress';
                hasChanges = true;
            }
        });
        
        if (hasChanges) {
            this.saveLocations(locations);
            console.log('Migrated location status values from "in-progress" to "progress"');
        }
    }

    getLocations() {
        const stored = localStorage.getItem(this.storageKey);
        return stored ? JSON.parse(stored) : this.defaultLocations;
    }

    saveLocations(locations) {
        localStorage.setItem(this.storageKey, JSON.stringify(locations));
    }

    addLocation(location) {
        const locations = this.getLocations();
        const newId = Math.max(...locations.map(l => l.id), 0) + 1;
        location.id = newId;
        location.established = location.established || new Date().toISOString().split('T')[0];
        locations.push(location);
        this.saveLocations(locations);
        return location;
    }

    updateLocation(id, updatedData) {
        const locations = this.getLocations();
        const index = locations.findIndex(l => l.id === parseInt(id));
        if (index !== -1) {
            locations[index] = { ...locations[index], ...updatedData };
            this.saveLocations(locations);
            return locations[index];
        }
        return null;
    }

    deleteLocation(id) {
        const locations = this.getLocations();
        const filtered = locations.filter(l => l.id !== parseInt(id));
        this.saveLocations(filtered);
        return filtered;
    }

    getLocationsByStatus(status) {
        return this.getLocations().filter(l => l.status === status);
    }

    getLocationById(id) {
        const locations = this.getLocations();
        return locations.find(l => l.id === parseInt(id));
    }

    getTotalStats() {
        const locations = this.getLocations();
        return {
            totalLocations: locations.length,
            activeLocations: locations.filter(l => l.status === 'active').length,
            totalMeals: locations.reduce((sum, l) => sum + (l.meals_served || 0), 0),
            totalPartners: locations.reduce((sum, l) => sum + (l.partners || 0), 0)
        };
    }

    // Add method to force refresh map data
    forceRefresh() {
        localStorage.removeItem(this.storageKey);
        this.saveLocations(this.defaultLocations);
        console.log('Forced refresh of map data with new locations');
        return this.getLocations();
    }
}

// Global instance
window.pizzaMapData = new PizzaMapData();

// Map initialization and management
class PizzaInteractiveMap {
    constructor(containerId) {
        this.containerId = containerId;
        this.map = null;
        this.markers = [];
        this.init();
    }

    init() {
        if (!document.getElementById(this.containerId)) {
            console.warn('Map container not found - this is normal if map is not initialized yet');
            return;
        }

        if (typeof L === 'undefined') {
            console.warn('Leaflet library not loaded - map functionality disabled');
            return;
        }

        try {
            // Initialize the map
            this.map = L.map(this.containerId, {
                zoomControl: true,
                scrollWheelZoom: true
            }).setView([20, 0], 2);
        } catch (error) {
            console.error('Failed to initialize map:', error);
            return;
        }

        // Add tile layer
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors | Pizza Community',
            maxZoom: 18
        }).addTo(this.map);

        // Load and display locations
        this.loadLocations();

        // Auto-refresh every 30 seconds
        setInterval(() => {
            this.refreshLocations();
        }, 30000);
    }

    getMarkerIcon(status) {
        const iconConfigs = {
            active: {
                color: '#4CAF50',
                icon: '🍕'
            },
            progress: {
                color: '#ff9800',
                icon: '🔧'
            },
            planned: {
                color: '#757575',
                icon: '📍'
            }
        };

        const config = iconConfigs[status] || iconConfigs.planned;
        
        return L.divIcon({
            className: 'custom-marker',
            html: `<div class="marker-pin" style="background-color: ${config.color}">
                     <span class="marker-icon">${config.icon}</span>
                   </div>`,
            iconSize: [30, 30],
            iconAnchor: [15, 30],
            popupAnchor: [0, -30]
        });
    }

    createPopupContent(location) {
        const statusText = {
            active: 'Active',
            progress: 'In Progress',
            planned: 'Planned'
        };

        return `
            <div class="map-popup">
                <h3>${location.name}</h3>
                <p class="location-city">${location.city}, ${location.country}</p>
                <div class="status-badge status-${location.status}">
                    ${statusText[location.status]}
                </div>
                <div class="location-stats">
                    <div class="stat">
                        <strong>${location.meals_served || 0}</strong>
                        <span>Meals Served</span>
                    </div>
                    <div class="stat">
                        <strong>${location.partners || 0}</strong>
                        <span>Partners</span>
                    </div>
                </div>
                <p class="location-description">${location.description}</p>
                ${location.established ? `<p class="established">Est. ${new Date(location.established).toLocaleDateString()}</p>` : ''}
                <a href="mailto:${location.contact}" class="contact-link">
                    <i class="fas fa-envelope"></i> Contact
                </a>
            </div>
        `;
    }

    loadLocations() {
        // Clear existing markers
        this.clearMarkers();

        const locations = window.pizzaMapData.getLocations();
        
        locations.forEach(location => {
            if (location.lat && location.lng) {
                const marker = L.marker([location.lat, location.lng], {
                    icon: this.getMarkerIcon(location.status)
                }).addTo(this.map);

                marker.bindPopup(this.createPopupContent(location), {
                    maxWidth: 300,
                    className: 'pizza-popup'
                });

                // Store reference for later updates
                marker.locationId = location.id;
                this.markers.push(marker);
            }
        });
    }

    refreshLocations() {
        this.loadLocations();
    }

    clearMarkers() {
        this.markers.forEach(marker => {
            this.map.removeLayer(marker);
        });
        this.markers = [];
    }

    addLocation(location) {
        if (location.lat && location.lng) {
            const marker = L.marker([location.lat, location.lng], {
                icon: this.getMarkerIcon(location.status)
            }).addTo(this.map);

            marker.bindPopup(this.createPopupContent(location), {
                maxWidth: 300,
                className: 'pizza-popup'
            });

            marker.locationId = location.id;
            this.markers.push(marker);

            // Center map on new location
            this.map.setView([location.lat, location.lng], 8);
        }
    }

    removeLocation(locationId) {
        const markerIndex = this.markers.findIndex(marker => marker.locationId === parseInt(locationId));
        if (markerIndex !== -1) {
            this.map.removeLayer(this.markers[markerIndex]);
            this.markers.splice(markerIndex, 1);
        }
    }
}

// Initialize map when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    if (document.getElementById('world-map')) {
        // Force refresh the map data to ensure new locations are loaded
        if (window.pizzaMapData) {
            window.pizzaMapData.forceRefresh();
        }
        window.pizzaMap = new PizzaInteractiveMap('world-map');
        
        // Update stats display
        setTimeout(() => {
            const stats = window.pizzaMapData.getTotalStats();
            const totalLocationsEl = document.getElementById('total-locations');
            const totalPartnersEl = document.getElementById('total-partners');
            
            if (totalLocationsEl) totalLocationsEl.textContent = stats.totalLocations;
            if (totalPartnersEl) totalPartnersEl.textContent = stats.totalPartners;
        }, 1000);
    }
}); 