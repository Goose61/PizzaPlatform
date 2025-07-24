// Pizza Community Map Data Manager

class PizzaMapData {
    constructor() {
        this.storageKey = 'pizza_map_locations';
        this.defaultLocations = [
            {
                id: 1,
                name: "Mumbai Pizza Hub",
                city: "Mumbai",
                country: "India",
                lat: 19.0760,
                lng: 72.8777,
                status: "active",
                meals_served: 2500,
                partners: 5,
                description: "Serving families in Mumbai slums with fresh pizza and hope",
                contact: "mumbai@pizzacommunity.org",
                established: "2024-01-15"
            },
            {
                id: 2,
                name: "Chicago Food Network",
                city: "Chicago",
                country: "USA",
                lat: 41.8781,
                lng: -87.6298,
                status: "active",
                meals_served: 3200,
                partners: 8,
                description: "Downtown Chicago location serving the homeless community",
                contact: "chicago@pizzacommunity.org",
                established: "2023-11-20"
            },
            {
                id: 3,
                name: "Lagos Community Kitchen",
                city: "Lagos",
                country: "Nigeria",
                lat: 6.5244,
                lng: 3.3792,
                status: "active",
                meals_served: 1800,
                partners: 3,
                description: "Supporting local families in Lagos with nutritious meals",
                contact: "lagos@pizzacommunity.org",
                established: "2024-02-10"
            },
            {
                id: 4,
                name: "São Paulo Initiative",
                city: "São Paulo",
                country: "Brazil",
                lat: -23.5505,
                lng: -46.6333,
                status: "progress",
                meals_served: 450,
                partners: 2,
                description: "New partnership launching in São Paulo favelas",
                contact: "saopaulo@pizzacommunity.org",
                established: "2024-03-01"
            },
            {
                id: 5,
                name: "Bangkok Street Food",
                city: "Bangkok",
                country: "Thailand",
                lat: 13.7563,
                lng: 100.5018,
                status: "active",
                meals_served: 1200,
                partners: 4,
                description: "Working with local street vendors to feed communities",
                contact: "bangkok@pizzacommunity.org",
                established: "2024-01-30"
            },
            {
                id: 6,
                name: "New York Outreach",
                city: "New York",
                country: "USA",
                lat: 40.7128,
                lng: -74.0060,
                status: "active",
                meals_served: 2800,
                partners: 6,
                description: "Brooklyn and Manhattan locations serving diverse communities",
                contact: "newyork@pizzacommunity.org",
                established: "2023-12-05"
            },
            {
                id: 7,
                name: "London Community Hub",
                city: "London",
                country: "UK",
                lat: 51.5074,
                lng: -0.1278,
                status: "planned",
                meals_served: 0,
                partners: 0,
                description: "Planned expansion to serve London's homeless population",
                contact: "london@pizzacommunity.org",
                established: null
            },
            {
                id: 8,
                name: "Sydney Coastal Relief",
                city: "Sydney",
                country: "Australia",
                lat: -33.8688,
                lng: 151.2093,
                status: "planned",
                meals_served: 0,
                partners: 0,
                description: "Future location targeting indigenous communities",
                contact: "sydney@pizzacommunity.org",
                established: null
            }
        ];
        
        this.initializeData();
    }

    initializeData() {
        if (!localStorage.getItem(this.storageKey)) {
            this.saveLocations(this.defaultLocations);
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
            console.warn('Map container not found');
            return;
        }

        // Initialize the map
        this.map = L.map(this.containerId, {
            zoomControl: true,
            scrollWheelZoom: true
        }).setView([20, 0], 2);

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
        window.pizzaMap = new PizzaInteractiveMap('world-map');
    }
}); 