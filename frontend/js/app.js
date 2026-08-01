// Dynamic API origin supporting file:// local viewing, localhost, and Vercel serverless production
const API_BASE_URL = (window.location.protocol === 'file:' || !window.location.hostname || window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost')
    ? 'http://127.0.0.1:8000'
    : window.location.origin;

let map = null;
let tileLayer = null;
let pathPolyline = null;
let pathGlowPolyline = null;
let markersLayerGroup = null;
let currentLocations = [];

// Available Map Tile Providers
const TILE_STYLES = {
    voyager: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    osm: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
};

let currentEngineMode = 'google'; // Default: 'google', 'csjmu', or 'custom'
let customStartMarker = null;
let customEndMarker = null;

/** Switch between CSJMU Mode, Google Maps API Mode, and Manual Pinning Mode */
function switchEngineMode(mode) {
    currentEngineMode = mode;
    
    const csjmuBtn = document.getElementById('mode-csjmu-btn');
    const googleBtn = document.getElementById('mode-google-btn');
    const customBtn = document.getElementById('mode-custom-btn');
    
    const startSelect = document.getElementById('start-location');
    const endSelect = document.getElementById('end-location');
    const startText = document.getElementById('start-location-text');
    const endText = document.getElementById('end-location-text');

    if (csjmuBtn) csjmuBtn.classList.remove('active');
    if (googleBtn) googleBtn.classList.remove('active');
    if (customBtn) customBtn.classList.remove('active');

    if (mode === 'google') {
        if (googleBtn) googleBtn.classList.add('active');
        
        startSelect.style.display = 'none';
        endSelect.style.display = 'none';
        startText.style.display = 'block';
        endText.style.display = 'block';
        
        startText.value = "Gate 1 CSJM University Kanpur";
        endText.value = "UIET CSJM University Kanpur";
    } else if (mode === 'custom') {
        if (customBtn) customBtn.classList.add('active');
        
        startSelect.style.display = 'none';
        endSelect.style.display = 'none';
        startText.style.display = 'block';
        endText.style.display = 'block';

        initCustomPins();
    } else {
        if (csjmuBtn) csjmuBtn.classList.add('active');
        
        startText.style.display = 'none';
        endText.style.display = 'none';
        startSelect.style.display = 'block';
        endSelect.style.display = 'block';
    }
}

/** Initialize interactive draggable Start & End pins on map for manual pinning */
function initCustomPins() {
    if (!map) return;
    const center = map.getCenter();
    
    if (!customStartMarker) {
        const startIcon = L.divIcon({
            className: 'csjmu-map-pin-container',
            html: `<div class="csjmu-pin-wrapper pin-start"><div class="pin-head" style="background:#10b981;"><i class="fa-solid fa-location-dot"></i></div></div>`,
            iconSize: [32, 42],
            iconAnchor: [16, 42]
        });
        const startLatLon = [center.lat - 0.001, center.lng - 0.001];
        customStartMarker = L.marker(startLatLon, { draggable: true, icon: startIcon }).addTo(map);
        customStartMarker.bindPopup("<b>📍 Start Location Pin</b><br>Drag me anywhere on map!").openPopup();
        
        customStartMarker.on('dragend', () => {
            const pos = customStartMarker.getLatLng();
            document.getElementById('start-location-text').value = `${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}`;
        });
    }

    if (!customEndMarker) {
        const endIcon = L.divIcon({
            className: 'csjmu-map-pin-container',
            html: `<div class="csjmu-pin-wrapper pin-end"><div class="pin-head" style="background:#f43f5e;"><i class="fa-solid fa-flag-checkered"></i></div></div>`,
            iconSize: [32, 42],
            iconAnchor: [16, 42]
        });
        const endLatLon = [center.lat + 0.001, center.lng + 0.001];
        customEndMarker = L.marker(endLatLon, { draggable: true, icon: endIcon }).addTo(map);
        customEndMarker.bindPopup("<b>🏁 Destination Pin</b><br>Drag me anywhere on map!").openPopup();

        customEndMarker.on('dragend', () => {
            const pos = customEndMarker.getLatLng();
            document.getElementById('end-location-text').value = `${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}`;
        });
    }

    const startPos = customStartMarker.getLatLng();
    const endPos = customEndMarker.getLatLng();
    document.getElementById('start-location-text').value = `${startPos.lat.toFixed(6)}, ${startPos.lng.toFixed(6)}`;
    document.getElementById('end-location-text').value = `${endPos.lat.toFixed(6)}, ${endPos.lng.toFixed(6)}`;
}

document.addEventListener('DOMContentLoaded', () => {
    initMap();
    setupTileSwitcher();
    setupAdminCalibration();
    fetchLocations();

    const findRouteBtn = document.getElementById('find-route-btn');
    if (findRouteBtn) {
        findRouteBtn.addEventListener('click', handleFindRoute);
    }
});

/** Setup Admin Pin Drag & Drop Calibration Toggle */
function setupAdminCalibration() {
    const adminBtn = document.getElementById('admin-calibrate-btn');
    if (!adminBtn) return;

    adminBtn.addEventListener('click', () => {
        isAdminCalibrating = !isAdminCalibrating;

        if (isAdminCalibrating) {
            adminBtn.classList.add('admin-active');
            adminBtn.innerHTML = '<i class="fa-solid fa-arrows-spin fa-spin"></i> Drag Pins to Calibrate Mode (ON)';
            enableMarkerDragging(true);
            alert('Admin Calibration Mode ON!\n\nYou can now drag any location pin on the map to place it on its exact entrance/building point. Dropping a pin automatically saves its new position!');
        } else {
            adminBtn.classList.remove('admin-active');
            adminBtn.innerHTML = '<i class="fa-solid fa-up-down-left-right"></i> Admin Calibrate Pins';
            enableMarkerDragging(false);
        }
    });
}

/** Enable or disable dragging on all landmark markers */
function enableMarkerDragging(enable) {
    landmarkMarkersMap.forEach(({ marker }) => {
        if (enable) {
            marker.dragging.enable();
        } else {
            marker.dragging.disable();
        }
    });
}

/** Initialize Leaflet Map with CartoDB Voyager Vibrant Light Layer */
function initMap() {
    // CSJM University Kanpur Center Coordinates
    map = L.map('map', {
        zoomControl: true,
        attributionControl: false
    }).setView([26.4990, 80.2700], 16);

    // Default Tile Layer: Voyager (Vibrant Light Map with crisp buildings & roads)
    tileLayer = L.tileLayer(TILE_STYLES.voyager, {
        maxZoom: 19,
        subdomains: 'abcd'
    }).addTo(map);

    markersLayerGroup = L.layerGroup().addTo(map);
}

/** Set up map tile style switcher buttons */
function setupTileSwitcher() {
    const buttons = document.querySelectorAll('.map-tile-switcher .tile-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            buttons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const styleKey = btn.getAttribute('data-style');
            if (TILE_STYLES[styleKey]) {
                map.removeLayer(tileLayer);
                tileLayer = L.tileLayer(TILE_STYLES[styleKey], {
                    maxZoom: 19,
                    subdomains: 'abcd'
                }).addTo(map);
            }
        });
    });
}

const FALLBACK_LANDMARKS = [
    { id: "lm_main_gate", name: "Main Entrance Gate No. 1 (GT Road)", category: "Gate", lat: 26.4962, lon: 80.2665, nearest_node: "node_main_gate", description: "Grand main entrance gate of CSJM University on Kalyanpur GT Road" },
    { id: "lm_admin", name: "Administrative Building (VC Secretariat)", category: "Administrative", lat: 26.4981, lon: 80.2682, nearest_node: "node_admin_block", description: "Central administrative block housing Vice Chancellor Secretariat & Administrative offices" },
    { id: "lm_library", name: "Central Library Building", category: "Library", lat: 26.4989, lon: 80.2693, nearest_node: "node_central_library", description: "Chhatrapati Shahuji Maharaj Central Library facing the central academic lawn" },
    { id: "lm_uiet", name: "UIET Engineering & Technology Block", category: "Academic", lat: 26.5001, lon: 80.2676, nearest_node: "node_uiet", description: "University Institute of Engineering and Technology (UIET) building complex" },
    { id: "lm_auditorium", name: "CSJMU Main Auditorium", category: "Event", lat: 26.4977, lon: 80.2704, nearest_node: "node_auditorium", description: "University Grand Jubilee Auditorium and Convocation Hall" },
    { id: "lm_canteen", name: "Central Canteen & Student Shopping Complex", category: "Dining", lat: 26.4990, lon: 80.2709, nearest_node: "node_canteen", description: "Central student canteen, food stalls, stationery, and bank ATMs" },
    { id: "lm_incubation", name: "Incubation & Robotics Center", category: "Research", lat: 26.5006, lon: 80.2689, nearest_node: "node_incubation_center", description: "Chhatrapati Shahuji Maharaj Innovation Hub and Startup Incubation Center" },
    { id: "lm_sports", name: "CSJMU Sports Stadium & Athletic Complex", category: "Sports", lat: 26.4969, lon: 80.2720, nearest_node: "node_sports_stadium", description: "University Sports Stadium, athletic track, and indoor sports hall" },
    { id: "lm_hostel", name: "Shivaji Boys Hostel", category: "Residential", lat: 26.5016, lon: 80.2701, nearest_node: "node_boys_hostel", description: "Residential boys hostel block in the northern residential sector" },
    { id: "lm_pharmacy", name: "Department of Pharmacy & Life Sciences", category: "Academic", lat: 26.4996, lon: 80.2667, nearest_node: "node_pharmacy_dept", description: "Department of Pharmaceutical Sciences and Life Sciences laboratories" }
];

/** Fetch CSJMU locations from FastAPI endpoint */
async function fetchLocations() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/landmarks`);
        const data = await response.json();

        if (data.status === 'success' && data.locations) {
            currentLocations = data.locations;
            populateSelects(data.locations);
            renderMapLandmarks(data.landmarks || []);
            
            // Auto-fit map to show all CSJMU landmarks
            if (data.locations.length > 0) {
                const bounds = L.latLngBounds(data.locations.map(loc => [loc.lat, loc.lon]));
                map.fitBounds(bounds, { padding: [50, 50] });
            }
            return;
        }
    } catch (err) {
        console.warn('[Vision X] Backend API offline. Loading fallback landmarks:', err);
        
        // Render offline fallback data on map & dropdowns
        const fallbackLocations = FALLBACK_LANDMARKS.map(lm => ({
            id: lm.nearest_node,
            name: lm.name,
            category: lm.category,
            lat: lm.lat,
            lon: lm.lon
        }));
        
        currentLocations = fallbackLocations;
        populateSelects(fallbackLocations);
        renderMapLandmarks(FALLBACK_LANDMARKS);
        
        if (fallbackLocations.length > 0) {
            const bounds = L.latLngBounds(fallbackLocations.map(loc => [loc.lat, loc.lon]));
            map.fitBounds(bounds, { padding: [50, 50] });
        }

        displayMessage('error', 'Backend API offline. Please ensure FastAPI server is running on http://127.0.0.1:8000.');
    }
}

/** Populate dropdowns with CSJMU locations */
function populateSelects(locations) {
    const startSelect = document.getElementById('start-location');
    const endSelect = document.getElementById('end-location');

    startSelect.innerHTML = '';
    endSelect.innerHTML = '';

    locations.forEach(loc => {
        const option1 = new Option(loc.name, loc.id);
        const option2 = new Option(loc.name, loc.id);

        startSelect.add(option1);
        endSelect.add(option2);
    });

    // Default start at Main Gate (index 0) & end at UIET (index 3)
    if (locations.length > 3) {
        startSelect.selectedIndex = 0;
        endSelect.selectedIndex = 3;
    }
}

/** Render CSJMU landmarks on map with draggable icon pins */
function renderMapLandmarks(landmarks) {
    landmarkMarkersMap.clear();

    landmarks.forEach(lm => {
        const iconSymbol = getCategoryIcon(lm.category);
        const pinIcon = L.divIcon({
            className: 'csjmu-map-pin-container',
            html: `
                <div class="csjmu-pin-wrapper pin-landmark">
                    <div class="pin-head"><i class="${iconSymbol}"></i></div>
                </div>
            `,
            iconSize: [32, 42],
            iconAnchor: [16, 42],
            popupAnchor: [0, -42]
        });

        const marker = L.marker([lm.lat, lm.lon], { 
            icon: pinIcon,
            draggable: isAdminCalibrating 
        });

        marker.bindPopup(`
            <div style="font-family:sans-serif; padding:4px;">
                <h4 style="margin:0 0 4px 0; color:#f59e0b; font-size:14px;"><i class="${iconSymbol}"></i> ${lm.name}</h4>
                <p style="margin:0 0 6px 0; font-size:12px; color:#d1d5db;">${lm.description}</p>
                <small style="color:#6366f1;">Drag pin to calibrate position</small>
            </div>
        `);

        // Dragend handler to update backend coordinates
        marker.on('dragend', async (event) => {
            const newPos = event.target.getLatLng();
            const landmarkId = lm.id;

            try {
                const res = await fetch(`${API_BASE_URL}/api/landmarks/update`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: landmarkId,
                        lat: newPos.lat,
                        lon: newPos.lng
                    })
                });

                const resData = await res.json();
                if (res.ok) {
                    marker.getPopup().setContent(`
                        <div style="font-family:sans-serif; padding:4px;">
                            <h4 style="margin:0 0 4px 0; color:#10b981; font-size:14px;"><i class="fa-solid fa-check"></i> Calibrated & Saved!</h4>
                            <p style="margin:0; font-size:12px; color:#ffffff;"><b>${lm.name}</b></p>
                            <small style="color:#9ca3af;">Lat: ${newPos.lat.toFixed(6)}, Lon: ${newPos.lng.toFixed(6)}</small>
                        </div>
                    `);
                    marker.openPopup();
                } else {
                    alert('Error saving position: ' + resData.detail);
                }
            } catch (err) {
                console.error('[Vision X] Error saving landmark pin:', err);
                alert('Could not save landmark pin position to backend server.');
            }
        });

        marker.addTo(markersLayerGroup);
        landmarkMarkersMap.set(lm.id, { marker, data: lm });
    });
}

/** Get FontAwesome icon based on landmark category */
function getCategoryIcon(category) {
    switch ((category || '').toLowerCase()) {
        case 'gate': return 'fa-solid fa-door-open';
        case 'administrative': return 'fa-solid fa-building-columns';
        case 'library': return 'fa-solid fa-book-open';
        case 'academic': return 'fa-solid fa-graduation-cap';
        case 'dining': return 'fa-solid fa-utensils';
        case 'research': return 'fa-solid fa-microscope';
        case 'sports': return 'fa-solid fa-person-running';
        case 'residential': return 'fa-solid fa-hotel';
        default: return 'fa-solid fa-landmark';
    }
}

/** Handle route calculation button click */
async function handleFindRoute() {
    const useAi = document.getElementById('ai-toggle').checked;
    const btn = document.getElementById('find-route-btn');
    
    let endpoint = `${API_BASE_URL}/api/route`;
    let payload = {};

    if (currentEngineMode === 'google') {
        const startVal = document.getElementById('start-location-text').value.trim();
        const endVal = document.getElementById('end-location-text').value.trim();

        if (!startVal || !endVal) {
            alert('Please enter starting location and destination for Google Maps.');
            return;
        }

        endpoint = `${API_BASE_URL}/api/google/route`;
        payload = {
            start_location: startVal,
            end_location: endVal,
            use_ai_refinement: useAi
        };
        btn.innerHTML = '<i class="fa-brands fa-google fa-spin"></i> Querying Google Maps API...';
    } else if (currentEngineMode === 'custom') {
        const startPos = customStartMarker ? customStartMarker.getLatLng() : null;
        const endPos = customEndMarker ? customEndMarker.getLatLng() : null;

        if (!startPos || !endPos) {
            alert('Please place both Start and Destination pins on the map.');
            return;
        }

        endpoint = `${API_BASE_URL}/api/route`;
        payload = {
            start_coords: [startPos.lat, startPos.lng],
            end_coords: [endPos.lat, endPos.lng],
            use_ai_refinement: useAi
        };
        btn.innerHTML = '<i class="fa-solid fa-compass fa-spin"></i> Routing between Custom Pins...';
    } else {
        const startNode = document.getElementById('start-location').value;
        const endNode = document.getElementById('end-location').value;

        if (!startNode || !endNode) {
            alert('Please select both a present location and destination.');
            return;
        }

        if (startNode === endNode) {
            alert('Present location and destination cannot be identical.');
            return;
        }

        payload = {
            start_node: startNode,
            end_node: endNode,
            use_ai_refinement: useAi
        };
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Calculating CSJMU Path...';
    }

    btn.disabled = true;

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (response.ok && data.status === 'success') {
            renderRouteMessages(data.messages, data.total_distance_m, data.provider || data.routing_engine);
            drawRouteOnMap(data.coordinates, data.messages);
        } else {
            alert(data.detail || 'Failed to calculate route.');
        }
    } catch (err) {
        console.error('[Vision X] Route error:', err);
        alert('Could not connect to backend server at ' + API_BASE_URL);
    } finally {
        btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Get Shortest Landmark Route';
        btn.disabled = false;
    }
}

/** Render turn-by-turn chat instruction cards */
function renderRouteMessages(messages, totalDistance, routingEngine = 'OpenRouteService') {
    const list = document.getElementById('messages-list');
    const stats = document.getElementById('route-stats');

    list.innerHTML = '';
    stats.innerText = `[${routingEngine}] Total: ${totalDistance}m`;

    messages.forEach((msg, idx) => {
        const bubble = document.createElement('div');
        bubble.className = 'message-bubble bot-bubble';

        const turnBadge = getTurnBadge(msg.turn);
        const landmarkTag = msg.landmark ? `<span class="landmark-tag"><i class="fa-solid fa-landmark"></i> ${msg.landmark}</span>` : '';

        bubble.innerHTML = `
            <div class="message-avatar"><i class="fa-solid fa-location-arrow"></i></div>
            <div class="message-content step-card" onclick="zoomToStep(${msg.lat}, ${msg.lon})">
                <div class="step-header">
                    <span class="step-badge ${turnBadge.class}">${turnBadge.label}</span>
                    ${landmarkTag}
                </div>
                <p><strong>Step ${msg.step}:</strong> ${msg.instruction}</p>
            </div>
        `;

        list.appendChild(bubble);
    });
}

/** Get badge for turn direction */
function getTurnBadge(turn) {
    switch (turn) {
        case 'left':
        case 'slight_left':
        case 'sharp_left':
            return { class: 'badge-left', label: 'Turn Left' };
        case 'right':
        case 'slight_right':
        case 'sharp_right':
            return { class: 'badge-right', label: 'Turn Right' };
        case 'destination':
            return { class: 'badge-destination', label: 'Arrived at Destination' };
        default:
            return { class: 'badge-straight', label: 'Walk Straight' };
    }
}

/** Draw vibrant route polyline and start/end markers on Leaflet map */
function drawRouteOnMap(coordinates, messages) {
    markersLayerGroup.clearLayers();

    if (pathPolyline) map.removeLayer(pathPolyline);
    if (pathGlowPolyline) map.removeLayer(pathGlowPolyline);

    // 1. Draw outer glow polyline
    pathGlowPolyline = L.polyline(coordinates, {
        color: '#4f46e5',
        weight: 10,
        opacity: 0.35,
        lineCap: 'round'
    }).addTo(map);

    // 2. Draw sharp vibrant path polyline
    pathPolyline = L.polyline(coordinates, {
        color: '#ec4899',
        weight: 5,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round'
    }).addTo(map);

    // Fit map view to path bounds with padding
    map.fitBounds(pathPolyline.getBounds(), { padding: [60, 60] });

    // Start marker
    const startCoord = coordinates[0];
    const startIcon = L.divIcon({
        className: 'csjmu-map-pin-container',
        html: `
            <div class="csjmu-pin-wrapper pin-start">
                <div class="pin-head"><i class="fa-solid fa-play"></i></div>
            </div>
        `,
        iconSize: [32, 42],
        iconAnchor: [16, 42],
        popupAnchor: [0, -42]
    });
    L.marker(startCoord, { icon: startIcon }).bindPopup('<b>Present Location</b>').addTo(markersLayerGroup);

    // Destination marker
    const endCoord = coordinates[coordinates.length - 1];
    const endIcon = L.divIcon({
        className: 'csjmu-map-pin-container',
        html: `
            <div class="csjmu-pin-wrapper pin-end">
                <div class="pin-head"><i class="fa-solid fa-flag-checkered"></i></div>
            </div>
        `,
        iconSize: [32, 42],
        iconAnchor: [16, 42],
        popupAnchor: [0, -42]
    });
    L.marker(endCoord, { icon: endIcon }).bindPopup('<b>Final Destination</b>').addTo(markersLayerGroup);

    // Turn point landmark markers
    messages.forEach(msg => {
        if (msg.landmark) {
            const icon = L.divIcon({
                className: 'csjmu-map-pin-container',
                html: `
                    <div class="csjmu-pin-wrapper pin-landmark">
                        <div class="pin-head"><i class="fa-solid fa-location-dot"></i></div>
                    </div>
                `,
                iconSize: [32, 42],
                iconAnchor: [16, 42],
                popupAnchor: [0, -42]
            });
            L.marker([msg.lat, msg.lon], { icon })
             .bindPopup(`<b>${msg.landmark}</b><br><small>${msg.instruction}</small>`)
             .addTo(markersLayerGroup);
        }
    });
}

/** Zoom map to specific step node when message card is clicked */
function zoomToStep(lat, lon) {
    if (map) {
        map.flyTo([lat, lon], 18, { duration: 0.8 });
    }
}

function displayMessage(type, text) {
    const list = document.getElementById('messages-list');
    list.innerHTML = `
        <div class="message-bubble bot-bubble">
            <div class="message-avatar"><i class="fa-solid fa-triangle-exclamation" style="color:#f43f5e;"></i></div>
            <div class="message-content">
                <p style="color:#f43f5e;">${text}</p>
            </div>
        </div>
    `;
}
