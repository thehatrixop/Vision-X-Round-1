# Landmark-Based Message Navigation System — Draft & Architecture Plan

This document outlines the requirements, data architecture, routing algorithms, instruction formatting logic, and step-by-step implementation methodology for building a message-based navigation panel that produces human-friendly, landmark-oriented route directions (e.g., *"Walk 200m till Administrative Building and then take a left turn there"*).

---

## 1. System Overview & Core Concept

Unlike standard GPS navigation that uses rigid meters and street names (e.g. *"In 200m turn left onto 5th Ave"*), this panel acts as a conversational message assistant that guides users using **visual landmarks** and **relative maneuvers**.

```
[User Input] 
  │ ── "Start: Main Gate" ── "Destination: Computer Science Block"
  ▼
[Backend Engine]
  ├─ 1. Geocode / Match Locations
  ├─ 2. Compute Shortest Path (Dijkstra / A*)
  ├─ 3. Detect Maneuvers & Turn Angles (Bearing calculation)
  ├─ 4. Snap Nearest Visual Landmarks to Turn Points
  └─ 5. Format into Step-by-Step Conversational Instructions
  ▼
[Frontend UI]
  └─ Renders interactive chat message stream + visual map polyline
```

---

## 2. Requirements & Key Components Needed

### A. Data Layer (Graph & Landmarks)
1. **Spatial Node-Edge Graph**:
   - **Nodes (Vertices)**: Intersections, decision points, entrance points with coordinates `(lat, lon)`.
   - **Edges (Walkways/Roads)**: Connecting paths with distance weights, surface types, and directional vectors.
2. **Landmark Dataset**:
   - Database/JSON of prominent landmarks with attributes:
     - `id`, `name` (e.g., *"Administrative Building"*), `category` (Building, Statue, Fountain, Cafeteria), `location` `(lat, lon)`, `visibility_radius` (e.g., 25 meters).

### B. Core Routing & Spatial Processing Engine
1. **Pathfinder**: Shortest path algorithm (Dijkstra / A*) or external map provider (OSRM / OpenStreetMap / Google Maps API).
2. **Bearing & Turn Detector**: Computes heading changes between consecutive line segments to determine maneuvers:
   - $0^\circ \pm 20^\circ \rightarrow$ Continue Straight
   - $+45^\circ \text{ to } +135^\circ \rightarrow$ Turn Right
   - $-45^\circ \text{ to } -135^\circ \rightarrow$ Turn Left
3. **Landmark Matching Logic**:
   - Spatial proximity query (KD-Tree / Turf.js / PostGIS `ST_DWithin`) around decision points (turn nodes) to select the most relevant landmark.

### C. Message Generation & Formatting Layer
1. **Rule-Based Template Engine**: Fast, deterministic text generation.
   - Example Template: `"Walk {distance}m till {landmark} and then take a {turn_direction} turn."`
2. **AI / LLM Refiner (Optional Enhancement)**:
   - Uses an LLM via Cerebras API (e.g. Llama 3.3 70B / Llama 3.1 8B) for ultra-fast, natural conversational message refinement.

### D. User Interface (Messaging Panel & Map)
1. **Chat Panel**: Message-based UI showing progressive direction cards/bubbles.
2. **Interactive Map Component**: Synchronized map view (Leaflet.js / MapLibre) highlighting the polyline, start/end markers, and landmark callouts.

---

## 3. Implementation Methodology (Step-by-Step)

### Phase 1: Data Structuring & Landmark Graph Setup
- Create a structured GeoJSON or graph dataset containing path nodes, edges, and landmark points of interest (POIs).
- Build spatial index (KD-Tree) for fast landmark lookup.

### Phase 2: Core Algorithm Development
- Implement pathfinding to retrieve ordered coordinate steps.
- Calculate segment distances ($d$) and turn angles ($\theta$).
- Query nearest landmark at each turn node.

### Phase 3: Text & Instruction Generation Engine
- Create deterministic instruction generator mapping node events to message format:
  ```json
  [
    { "step": 1, "instruction": "Walk 150m straight from Main Gate towards Central Fountain." },
    { "step": 2, "instruction": "Walk 200m till Administrative Building and then take a left turn there." },
    { "step": 3, "instruction": "Continue 50m straight; target CS Department is on your right." }
  ]
  ```

### Phase 4: API Backend (FastAPI / Node.js)
- Endpoint `POST /api/route/directions`: Accepts start/destination, processes path & landmark matching, returns structured message array and path coordinates.

### Phase 5: Modern UI Development
- Implement responsive messaging interface with real-time route calculation, interactive step highlights, and landmark visual previews.

---

## 4. Proposed File Structure for Project

```
vision_x/
├── backend/
│   ├── data/
│   │   ├── graph.json            # Node and Edge network
│   │   └── landmarks.json        # Landmark POIs dataset
│   ├── services/
│   │   ├── pathfinder.py         # Dijkstra / A* algorithm
│   │   ├── landmark_matcher.py   # Spatial lookup & bearing detection
│   │   └── instruction_builder.py# Message formatter (Template / AI)
│   └── main.py                   # FastAPI server endpoints
├── frontend/
│   ├── index.html                # Main UI layout
│   ├── css/style.css             # Modern Glassmorphic styling
│   └── js/app.js                 # Messaging chat & map integration
└── route_landmark_navigation_draft.md # Project specification draft
```

---

## Key Options to Decide
1. **Data Source**: Custom Campus/Indoor Map (JSON/GeoJSON) vs OpenStreetMap API vs Google Maps API.
2. **Instruction Generator**: Pure algorithmic deterministic template vs Cerebras API (Llama 3.3/3.1) refined text.
3. **UI Approach**: Full chat interface with synchronized mini-map vs pure messaging panel.
