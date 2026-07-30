# Brain.md — Vision X Landmark Navigation System Index

> **AI Index Notice**: This document serves as the single source of truth for project structure, module boundaries, data schemas, and API contracts. Future AI agents reading this workspace should inspect `brain.md` first to understand system design without scanning every source file.

---

## 1. System Overview

**Vision X** is a landmark-oriented, message-based route navigation panel custom-built for **Chhatrapati Shahuji Maharaj University (CSJMU), Kanpur**. Given a user's starting point and final destination across the CSJMU campus, it calculates the shortest spatial path, analyzes turn maneuver angles, matches campus visual landmarks, and formats directions into intuitive human messages (e.g., *"Walk 310m till Administrative Building (VC Secretariat) and then take a left turn there towards Central Library"*).

### Data & Execution Flow
```
[ User Input (Start & Destination) ]
                │
                ▼
      [ FastAPI Backend (`/api/route`) ]
                │
                ├─► 1. Pathfinder Service (`pathfinder.py`)
                │      Runs Dijkstra/A* on spatial graph (`graph.json`)
                │
                ├─► 2. Landmark Matcher (`landmark_matcher.py`)
                │      Calculates bearing turn angles (Left/Right/Straight)
                │      Queries KDTree for nearest POIs (`landmarks.json`)
                │
                ├─► 3. Instruction Builder (`instruction_builder.py`)
                │      Formats text via deterministic rules & Cerebras API (Llama 3.3/3.1)
                │
                ▼
    [ Response Payload JSON ]
                │
                ▼
      [ Frontend Web App (`app.js` + `index.html`) ]
                ├─► Renders animated chat message bubbles
                └─► Draws synchronized polyline & landmark pins on Leaflet Map
```

---

## 2. Directory & Module Mapping

```
vision_x/
├── .env                                  # Environment configuration (GOOGLE_MAPS_API_KEY, CEREBRAS_API_KEY)
├── vercel.json                           # Vercel serverless deployment routing configuration
├── brain.md                              # Master AI index & architecture specification
├── requirements.txt                      # Python dependencies (FastAPI, NetworkX, Geopy, Googlemaps, Cerebras)
├── route_landmark_navigation_draft.md    # Initial design draft
├── system_architecture_report.md         # Multi-channel architecture report (Source Call, Source SMS, Web UI) & flowcharts
├── backend/
│   ├── main.py                           # FastAPI application entrypoint & API endpoints
│   ├── data/
│   │   ├── graph.json                    # Spatial network (Nodes & Edges with lat/lon/weights)
│   │   └── landmarks.json                # Visual landmark POIs database
│   └── services/
│       ├── pathfinder.py                 # Graph pathfinder (Dijkstra / A*)
│       ├── landmark_matcher.py           # Bearing angle calculation & spatial landmark matching
│       └── instruction_builder.py        # Message builder (Rule-based & Cerebras API LLM)
└── frontend/
    ├── index.html                        # Main UI layout (Glassmorphic split view)
    ├── css/style.css                     # Premium dark-mode styling & animations
    └── js/app.js                         # Chat panel logic & Leaflet interactive map integration
```

---

## 3. Data Schemas

### `graph.json` Schema
- **Nodes**: `{ "id": string, "name": string, "lat": float, "lon": float }`
- **Edges**: `{ "source": string, "target": string, "distance_m": float, "path_type": "walkway" | "road" }`

### `landmarks.json` Schema
- **Landmarks**: `{ "id": string, "name": string, "category": string, "lat": float, "lon": float, "nearest_node": string, "visibility_radius_m": float }`

### API Endpoint Schemas

#### `POST /api/route`
- **Request**:
  ```json
  {
    "start_node": "node_main_gate",
    "end_node": "node_cs_block",
    "use_ai_refinement": true
  }
  ```
- **Response**:
  ```json
  {
    "status": "success",
    "total_distance_m": 450.0,
    "path_nodes": ["node_main_gate", "node_admin_building", "node_cs_block"],
    "coordinates": [[28.6139, 77.2090], ...],
    "messages": [
      {
        "step": 1,
        "instruction": "Walk 200m straight from Main Gate towards Administrative Building.",
        "landmark": "Administrative Building",
        "turn": "straight",
        "distance_m": 200.0
      },
      {
        "step": 2,
        "instruction": "Walk 250m till Administrative Building and then take a left turn there towards CS Block.",
        "landmark": "Administrative Building",
        "turn": "left",
        "distance_m": 250.0
      }
    ]
  }
  ```

#### `POST /api/google/route` (Google Maps API Walking Route)
- **Request**:
  ```json
  {
    "start_location": "Gate 1 CSJM University Kanpur",
    "end_location": "UIET CSJM University Kanpur",
    "google_api_key": "YOUR_OPTIONAL_GOOGLE_API_KEY",
    "use_ai_refinement": true
  }
  ```
- **Response**: Returns Google Walking Directions, Google Places nearby landmarks, path coordinates, and Cerebras AI conversational instructions.

#### `POST /api/landmarks/update` (Admin Pin Calibration)
- **Request**:
  ```json
  {
    "id": "lm_admin",
    "lat": 26.498124,
    "lon": 80.268215
  }
  ```
- **Response**: Updates coordinates in both `graph.json` and `landmarks.json` permanently on disk.

#### `GET /api/landmarks`
- **Response**: List of available start/end locations for dropdown selection.

---

## 4. Key Components Detail

1. **`pathfinder.py`**: Integrates **OpenRouteService (ORS)** Directions API & **OSRM Foot Engine** for real OpenStreetMap pedestrian footpath routing between coordinates, with NetworkX Dijkstra fallback.
2. **`landmark_matcher.py`**:
   - Calculates forward azimuth (bearing) between path vectors using `geopy`.
   - Classifies turn angles into `straight`, `slight_left`, `left`, `slight_right`, `right`, or `u_turn`.
   - Uses `scipy.spatial.KDTree` to snap nearest landmarks within `visibility_radius_m` to each maneuver node.
3. **`instruction_builder.py`**:
   - Generates formatted turn messages using deterministic rules.
   - Optionally sends raw maneuvers to **Cerebras API** (`cerebras-cloud-sdk`, `llama-3.3-70b`) for conversational polishing.
4. **`frontend/app.js`**: Handles user input, manages chat thread state, renders step cards, and synchronizes Leaflet map with **CartoDB Voyager Light** (vibrant high-contrast street map tiles), **OpenStreetMap**, and **Esri Satellite** layers, customized with CSJMU SVG/FontAwesome pins and glowing route polylines.
