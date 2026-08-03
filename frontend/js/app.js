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
let landmarkMarkersMap = new Map();

// Available Map Tile Providers
const TILE_STYLES = {
    voyager: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    osm: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
};

document.addEventListener('DOMContentLoaded', () => {
    initMap();
    setupTileSwitcher();
    setupResizablePanels();
    fetchLocations();

    const findRouteBtn = document.getElementById('find-route-btn');
    if (findRouteBtn) {
        findRouteBtn.addEventListener('click', handleFindRoute);
    }
});

/** Setup Resizable Panels (Horizontal & Vertical Drag Adjustments) */
function setupResizablePanels() {
    const resizerV = document.getElementById('resizer-v');
    const resizerH = document.getElementById('resizer-h');
    const navPanel = document.getElementById('navigation-panel');
    const controlBox = document.getElementById('control-box');
    const workspace = document.getElementById('workspace');

    // Restore saved panel sizes from localStorage
    const savedNavWidth = localStorage.getItem('visionx_nav_width');
    if (savedNavWidth && navPanel) {
        navPanel.style.width = `${savedNavWidth}px`;
    }

    const savedControlHeight = localStorage.getItem('visionx_control_height');
    if (savedControlHeight && controlBox) {
        controlBox.style.height = `${savedControlHeight}px`;
        controlBox.style.flex = 'none';
    }

    // Vertical Resizer (Left / Right Panel Width)
    if (resizerV && navPanel && workspace) {
        const startDragV = () => {
            resizerV.classList.add('dragging');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        };

        const doDragV = (clientX) => {
            const workspaceRect = workspace.getBoundingClientRect();
            let newWidth = clientX - workspaceRect.left;
            newWidth = Math.max(260, Math.min(newWidth, workspaceRect.width - 300));
            navPanel.style.width = `${newWidth}px`;
            localStorage.setItem('visionx_nav_width', newWidth);
            if (map) map.invalidateSize();
        };

        const stopDragV = () => {
            resizerV.classList.remove('dragging');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            if (map) map.invalidateSize();
        };

        resizerV.addEventListener('mousedown', (e) => {
            startDragV();
            const onMouseMove = (e) => doDragV(e.clientX);
            const onMouseUp = () => {
                stopDragV();
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            };
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });

        // Touch support
        resizerV.addEventListener('touchstart', (e) => {
            startDragV();
            const onTouchMove = (e) => {
                if (e.touches.length > 0) doDragV(e.touches[0].clientX);
            };
            const onTouchEnd = () => {
                stopDragV();
                document.removeEventListener('touchmove', onTouchMove);
                document.removeEventListener('touchend', onTouchEnd);
            };
            document.addEventListener('touchmove', onTouchMove);
            document.addEventListener('touchend', onTouchEnd);
        });
    }

    // Horizontal Resizer (Control Box vs Messages Height)
    if (resizerH && controlBox && navPanel) {
        const startDragH = () => {
            resizerH.classList.add('dragging');
            document.body.style.cursor = 'row-resize';
            document.body.style.userSelect = 'none';
        };

        const doDragH = (clientY) => {
            const navRect = navPanel.getBoundingClientRect();
            let newHeight = clientY - navRect.top;
            newHeight = Math.max(140, Math.min(newHeight, navRect.height - 120));
            controlBox.style.height = `${newHeight}px`;
            controlBox.style.flex = 'none';
            localStorage.setItem('visionx_control_height', newHeight);
        };

        const stopDragH = () => {
            resizerH.classList.remove('dragging');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };

        resizerH.addEventListener('mousedown', (e) => {
            startDragH();
            const onMouseMove = (e) => doDragH(e.clientY);
            const onMouseUp = () => {
                stopDragH();
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            };
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });

        // Touch support
        resizerH.addEventListener('touchstart', (e) => {
            startDragH();
            const onTouchMove = (e) => {
                if (e.touches.length > 0) doDragH(e.touches[0].clientY);
            };
            const onTouchEnd = () => {
                stopDragH();
                document.removeEventListener('touchmove', onTouchMove);
                document.removeEventListener('touchend', onTouchEnd);
            };
            document.addEventListener('touchmove', onTouchMove);
            document.addEventListener('touchend', onTouchEnd);
        });
    }
}

/** Initialize Leaflet Map with CartoDB Voyager Vibrant Light Layer */
function initMap() {
    // CSJM University Kanpur Center Coordinates
    map = L.map('map', {
        zoomControl: true,
        attributionControl: false
    }).setView([26.5025, 80.2683], 16);

    // Default Tile Layer: Voyager (Vibrant Light Map with crisp buildings & roads)
    tileLayer = L.tileLayer(TILE_STYLES.voyager, {
        maxZoom: 19,
        subdomains: 'abcd'
    }).addTo(map);

    markersLayerGroup = L.layerGroup().addTo(map);
    setTimeout(() => { if (map) map.invalidateSize(); }, 200);
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
    { id: "lm_main_gate", name: "Main Entrance Gate No. 1 (GT Road)", category: "Gate", lat: 26.4969563933019, lon: 80.26674262346492, nearest_node: "node_main_gate", description: "Grand main entrance gate of CSJM University on Kalyanpur GT Road" },
    { id: "lm_admin", name: "Administrative Building (VC Secretariat)", category: "Administrative", lat: 26.498399299314453, lon: 80.26620693886696, nearest_node: "node_admin_block", description: "Central administrative block housing Vice Chancellor Secretariat & Administrative offices" },
    { id: "lm_library", name: "Central Library Building", category: "Library", lat: 26.50112015829331, lon: 80.26699407897705, nearest_node: "node_central_library", description: "Chhatrapati Shahuji Maharaj Central Library facing the central academic lawn" },
    { id: "lm_uiet", name: "UIET Engineering & Technology Block", category: "Academic", lat: 26.50098417502509, lon: 80.26550809655177, nearest_node: "node_uiet", description: "University Institute of Engineering and Technology (UIET) building complex" },
    { id: "lm_auditorium", name: "CSJMU Main Auditorium", category: "Event", lat: 26.504245233002063, lon: 80.26841753767731, nearest_node: "node_auditorium", description: "University Grand Jubilee Auditorium and Convocation Hall" },
    { id: "lm_canteen", name: "Central Canteen & Student Shopping Complex", category: "Dining", lat: 26.4990, lon: 80.2709, nearest_node: "node_canteen", description: "Central student canteen, food stalls, stationery, and bank ATMs" },
    { id: "lm_incubation", name: "Incubation & Robotics Center", category: "Research", lat: 26.497191329387295, lon: 80.2670811673868, nearest_node: "node_incubation_center", description: "Chhatrapati Shahuji Maharaj Innovation Hub and Startup Incubation Center" },
    { id: "lm_sports", name: "CSJMU Sports Stadium & Athletic Complex", category: "Sports", lat: 26.506300783257753, lon: 80.27104071856068, nearest_node: "node_sports_stadium", description: "University Sports Stadium, athletic track, and indoor sports hall" },
    { id: "lm_hostel", name: "Shivaji Boys Hostel", category: "Residential", lat: 26.50807044543542, lon: 80.27021508321725, nearest_node: "node_boys_hostel", description: "Residential boys hostel block in the northern residential sector" },
    { id: "lm_pharmacy", name: "Department of Pharmacy & Life Sciences", category: "Academic", lat: 26.502998352775094, lon: 80.26811329168027, nearest_node: "node_pharmacy_dept", description: "Department of Pharmaceutical Sciences and Life Sciences laboratories" }
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
            icon: pinIcon
        });

        marker.bindPopup(`
            <div style="font-family:sans-serif; padding:4px;">
                <h4 style="margin:0 0 4px 0; color:#f59e0b; font-size:14px;"><i class="${iconSymbol}"></i> ${lm.name}</h4>
                <p style="margin:0 0 4px 0; font-size:12px; color:#d1d5db;">${lm.description}</p>
            </div>
        `);

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
    const btn = document.getElementById('find-route-btn');
    
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

    const endpoint = `${API_BASE_URL}/api/route`;
    const payload = {
        start_node: startNode,
        end_node: endNode
    };

    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Calculating CSJMU Path...';
    btn.disabled = true;

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (response.ok && data.status === 'success') {
            renderRouteMessages(data.messages, data.total_distance_m, data.routing_engine);
            drawRouteOnMap(data.coordinates, data.messages);
        } else {
            alert(data.detail || 'Failed to calculate route.');
        }
    } catch (err) {
        console.error('[Vision X] Route error:', err);
        alert('Could not connect to backend server at ' + API_BASE_URL);
    } finally {
        btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Get CSJMU Landmark Route';
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
