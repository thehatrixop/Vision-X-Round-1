import os
import sys
from typing import Optional, List
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

# Ensure root directory is included in sys.path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BASE_DIR)
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

# Load environment variables (.env file if available)
load_dotenv()

try:
    from backend.services.pathfinder import PathfinderService
    from backend.services.landmark_matcher import LandmarkMatcherService
    from backend.services.instruction_builder import InstructionBuilderService
    from backend.services.google_directions import GoogleDirectionsService
except ModuleNotFoundError:
    from services.pathfinder import PathfinderService
    from services.landmark_matcher import LandmarkMatcherService
    from services.instruction_builder import InstructionBuilderService
    from services.google_directions import GoogleDirectionsService

app = FastAPI(
    title="Vision X — Landmark Navigation API",
    description="Message-based route calculation with landmark snapping and turn maneuver classification.",
    version="1.0.0"
)

# Enable CORS for local web development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Services
try:
    pathfinder = PathfinderService()
    landmark_matcher = LandmarkMatcherService()
    instruction_builder = InstructionBuilderService()
except Exception as e:
    print(f"[Main Setup Error]: {e}")

class RouteRequest(BaseModel):
    start_node: Optional[str] = None
    end_node: Optional[str] = None
    start_coords: Optional[List[float]] = None
    end_coords: Optional[List[float]] = None
    use_ai_refinement: Optional[bool] = True

class RouteResponse(BaseModel):
    status: str
    total_distance_m: float
    path_nodes: List[str]
    coordinates: List[List[float]]
    messages: List[dict]
    routing_engine: Optional[str] = "OpenRouteService"

@app.get("/")
def root():
    return {
        "service": "Vision X Landmark Navigation API",
        "status": "online",
        "endpoints": {
            "landmarks": "/api/landmarks",
            "route": "/api/route"
        }
    }

@app.get("/api/landmarks")
def get_landmarks():
    """Returns available CSJMU navigation locations and landmarks for selection UI."""
    try:
        pathfinder.load_graph()
        landmark_matcher.load_landmarks()
        nodes = [{"id": n["id"], "name": n["name"], "lat": n["lat"], "lon": n["lon"]} for n in pathfinder.nodes_data.values()]
        landmarks = landmark_matcher.landmarks
        return {
            "status": "success",
            "locations": nodes,
            "landmarks": landmarks
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class UpdateLandmarkRequest(BaseModel):
    id: str
    lat: float
    lon: float

@app.post("/api/landmarks/update")
def update_landmark_coordinates(request: UpdateLandmarkRequest):
    """
    Admin Calibration Endpoint: Updates latitude and longitude coordinates for a location
    in graph.json and landmarks.json datasets permanently.
    """
    import json
    
    base_dir = os.path.dirname(os.path.abspath(__file__))
    graph_path = os.path.join(base_dir, "data", "graph.json")
    landmarks_path = os.path.join(base_dir, "data", "landmarks.json")
    
    updated_graph = False
    updated_landmarks = False
    
    # 1. Update graph.json node
    if os.path.exists(graph_path):
        with open(graph_path, "r", encoding="utf-8") as f:
            graph_data = json.load(f)
            
        for node in graph_data.get("nodes", []):
            if node["id"] == request.id or node["id"].replace("node_", "lm_") == request.id or request.id.replace("lm_", "node_") == node["id"]:
                node["lat"] = round(request.lat, 6)
                node["lon"] = round(request.lon, 6)
                updated_graph = True
                break
                
        if updated_graph:
            with open(graph_path, "w", encoding="utf-8") as f:
                json.dump(graph_data, f, indent=2)
                
    # 2. Update landmarks.json POI
    if os.path.exists(landmarks_path):
        with open(landmarks_path, "r", encoding="utf-8") as f:
            lm_data = json.load(f)
            
        for lm in lm_data.get("landmarks", []):
            if lm["id"] == request.id or lm["nearest_node"] == request.id:
                lm["lat"] = round(request.lat, 6)
                lm["lon"] = round(request.lon, 6)
                updated_landmarks = True
                break
                
        if updated_landmarks:
            with open(landmarks_path, "w", encoding="utf-8") as f:
                json.dump(lm_data, f, indent=2)
                
    # Refresh in-memory services
    pathfinder.load_graph()
    landmark_matcher.load_landmarks()
    
    return {
        "status": "success",
        "message": f"Successfully updated coordinates for {request.id}",
        "new_coords": {"lat": request.lat, "lon": request.lon}
    }

class GoogleRouteRequest(BaseModel):
    start_location: str
    end_location: str
    google_api_key: Optional[str] = None
    use_ai_refinement: Optional[bool] = True

@app.post("/api/google/route")
def calculate_google_route(request: GoogleRouteRequest):
    """
    Google Maps API Route Calculation Endpoint: Queries official Google Maps Walking Directions API
    and returns parsed landmark steps and path coordinates.
    """
    try:
        # Reload environment variables to pick up any key updates
        load_dotenv(override=True)
        
        service = GoogleDirectionsService(api_key=request.google_api_key)
        google_result = service.get_google_walking_route(
            origin=request.start_location,
            destination=request.end_location,
            custom_key=request.google_api_key
        )
        
        # Optional Cerebras AI refinement on Google steps
        messages = []
        for step in google_result["steps"]:
            instr = step["instruction"]
            if step["landmark"]:
                instr += f" (Near {step['landmark']})"
            messages.append({
                "step": step["step"],
                "instruction": instr,
                "distance_m": step["distance_m"],
                "landmark": step["landmark"],
                "turn": step["maneuver"],
                "lat": step["end_location"][0],
                "lon": step["end_location"][1]
            })
            
        if request.use_ai_refinement:
            try:
                messages = instruction_builder.generate_messages(
                    [{"node_name": m["instruction"], "distance_to_next_m": m["distance_m"], "turn_direction": m["turn"], "landmark": {"name": m["landmark"]} if m["landmark"] else None, "lat": m["lat"], "lon": m["lon"], "node_id": f"step_{m['step']}"} for m in messages],
                    use_ai=True
                )
            except Exception:
                pass

        return {
            "status": "success",
            "provider": "Google Maps API",
            "total_distance_m": google_result["total_distance_m"],
            "total_duration": google_result["total_duration"],
            "coordinates": google_result["coordinates"],
            "messages": messages
        }
    except ValueError as ve:
        err_str = str(ve)
        if "Internet Connection" in err_str or "DNS Error" in err_str:
            # Fallback to local CSJMU graph pathfinder if network drops out
            try:
                pathfinder.load_graph()
                landmark_matcher.load_landmarks()
                fallback_res = pathfinder.get_shortest_path("node_main_gate", "node_uiet")
                maneuvers = landmark_matcher.process_path_maneuvers(fallback_res["path_details"])
                fallback_messages = instruction_builder.generate_messages(maneuvers, use_ai=False)
                return {
                    "status": "success",
                    "provider": "Local Offline CSJMU Graph (Network Fallback)",
                    "total_distance_m": fallback_res["total_distance_m"],
                    "total_duration": "5 mins",
                    "coordinates": fallback_res["coordinates"],
                    "messages": fallback_messages
                }
            except Exception:
                pass
        raise HTTPException(status_code=400, detail=err_str)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Google Maps API error: {str(e)}")

@app.post("/api/route", response_model=RouteResponse)
def calculate_route(request: RouteRequest):
    """
    Computes shortest path, matches nearby landmarks at turns, and generates message-based instructions.
    Supports both predefined node IDs and custom manual GPS coordinate pins.
    """
    if request.start_node and request.start_node == request.end_node:
        raise HTTPException(status_code=400, detail="Start and final location cannot be identical.")
        
    try:
        # Refresh datasets
        pathfinder.load_graph()
        landmark_matcher.load_landmarks()
        
        # 1. Compute shortest path by manual coordinates or by node IDs
        if request.start_coords and request.end_coords and len(request.start_coords) == 2 and len(request.end_coords) == 2:
            path_result = pathfinder.get_shortest_path_by_coords(
                request.start_coords[0], request.start_coords[1],
                request.end_coords[0], request.end_coords[1]
            )
        elif request.start_node and request.end_node:
            path_result = pathfinder.get_shortest_path(request.start_node, request.end_node)
        else:
            raise HTTPException(status_code=400, detail="Must provide either start_node & end_node OR start_coords & end_coords.")
        
        # 2. Match maneuvers & landmarks
        maneuver_steps = landmark_matcher.process_path_maneuvers(path_result["path_details"])
        
        # 3. Generate human conversational instructions
        messages = instruction_builder.generate_messages(maneuver_steps, use_ai=request.use_ai_refinement)
        
        return {
            "status": "success",
            "total_distance_m": path_result["total_distance_m"],
            "path_nodes": path_result["path_nodes"],
            "coordinates": path_result["coordinates"],
            "messages": messages,
            "routing_engine": path_result.get("routing_engine", "OpenRouteService")
        }
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal route processing error: {str(e)}")

# Mount static frontend files if directory exists
FRONTEND_DIR = os.path.join(PROJECT_ROOT, "frontend")
if os.path.exists(FRONTEND_DIR):
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8000, reload=True)
