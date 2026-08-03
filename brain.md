# Vision X — Spatial Graph & Distance Recalibration Analysis

## Overview
This document logs the analysis and fixes performed following updates to the latitude and longitude coordinates of nodes in `backend/data/graph.json`.

## Graph Node Coordinates (Updated Baseline)
1. `node_main_gate`: `(26.496956, 80.266743)`
2. `node_admin_block`: `(26.498399, 80.266207)`
3. `node_central_library`: `(26.501120, 80.266994)`
4. `node_uiet`: `(26.500984, 80.265508)`
5. `node_auditorium`: `(26.504245, 80.268418)`
6. `node_canteen`: `(26.499000, 80.270900)`
7. `node_incubation_center`: `(26.497191, 80.267081)`
8. `node_sports_stadium`: `(26.506301, 80.271041)`
9. `node_boys_hostel`: `(26.508070, 80.270215)`
10. `node_pharmacy_dept`: `(26.502998, 80.268113)`

## Recalculated Edge Distances (`distance_m` via Haversine)
- `node_main_gate` <-> `node_admin_block`: **169.0m** (was 275.0m)
- `node_main_gate` <-> `node_sports_stadium`: **1123.0m** (was 560.0m)
- `node_admin_block` <-> `node_central_library`: **312.4m** (was 140.0m)
- `node_admin_block` <-> `node_auditorium`: **685.9m** (was 230.0m)
- `node_admin_block` <-> `node_pharmacy_dept`: **545.1m** (was 220.0m)
- `node_central_library` <-> `node_uiet`: **148.5m** (was 215.0m)
- `node_central_library` <-> `node_canteen`: **454.4m** (was 165.0m)
- `node_uiet` <-> `node_incubation_center`: **449.6m** (was 145.0m)
- `node_uiet` <-> `node_pharmacy_dept`: **342.3m** (was 110.0m)
- `node_incubation_center` <-> `node_boys_hostel`: **1248.6m** (was 160.0m)
- `node_canteen` <-> `node_auditorium`: **633.1m** (was 155.0m)
- `node_canteen` <-> `node_boys_hostel`: **1010.4m** (was 290.0m)
- `node_auditorium` <-> `node_sports_stadium`: **346.7m** (was 185.0m)

## Summary of Changes
1. **`graph.json`**:
   - Recalculated `distance_m` for all 13 graph edges using exact Haversine formulas.
   - Updated campus centroid to `(26.5025, 80.2683)`.
2. **`landmarks.json`**:
   - Synchronized all landmark coordinates with their respective `nearest_node` updated positions.
3. **`frontend/js/app.js`**:
   - Updated offline fallback landmark coordinates (`FALLBACK_LANDMARKS`) and initial Leaflet map view bounds.
4. **Backend Services (`pathfinder.py` & `main.py`)**:
   - Implemented Dijkstra pathfinder for optimal route calculation.
   - Implemented FastAPI backend server endpoints (`/api/landmarks`, `/api/route`, `/api/landmarks/update`) with dynamic edge distance recalculation on position update.
