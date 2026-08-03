import json
import math
import os
from typing import Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from services.pathfinder import PathfinderService
from services.landmark_matcher import LandmarkMatcherService
from services.instruction_builder import InstructionBuilderService

from fastapi.staticfiles import StaticFiles

app = FastAPI(
    title="Vision X — CSJMU Campus Landmark Navigation API",
    version="1.0.0",
    description="Backend spatial routing engine providing landmark-based conversational directions."
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

frontend_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend")
if os.path.exists(frontend_dir):
    app.mount("/app", StaticFiles(directory=frontend_dir, html=True), name="frontend")


pathfinder = PathfinderService()
landmark_matcher = LandmarkMatcherService()
instruction_builder = InstructionBuilderService()

class RouteRequest(BaseModel):
    start_node: str
    end_node: str

class LandmarkUpdateRequest(BaseModel):
    id: str
    lat: float
    lon: float

def calculate_haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculates Haversine distance in meters between two lat/lon points."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = math.sin(delta_phi / 2.0)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0)**2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return round(6371000.0 * c, 1)

@app.get("/")
def root():
    return {
        "status": "online",
        "service": "Vision X Navigation API",
        "university": "CSJMU Kanpur"
    }

@app.get("/api/landmarks")
def get_landmarks():
    """Returns CSJMU campus node locations and landmarks dataset."""
    locations = [
        {
            "id": node_id,
            "name": node["name"],
            "category": next((lm["category"] for lm in landmark_matcher.landmarks if lm.get("nearest_node") == node_id), "Node"),
            "lat": node["lat"],
            "lon": node["lon"]
        }
        for node_id, node in pathfinder.nodes.items()
    ]
    return {
        "status": "success",
        "locations": locations,
        "landmarks": landmark_matcher.landmarks
    }

@app.post("/api/route")
def calculate_route(req: RouteRequest):
    """Calculates shortest path and generates conversational landmark instructions."""
    route = pathfinder.find_shortest_path(req.start_node, req.end_node)
    if not route:
        raise HTTPException(status_code=404, detail="No valid path found between selected locations.")

    maneuver_steps = landmark_matcher.process_path_maneuvers(route["path_details"])
    messages = instruction_builder.generate_messages(maneuver_steps)

    return {
        "status": "success",
        "routing_engine": "Vision-X Campus Graph (Dijkstra)",
        "total_distance_m": route["total_distance_m"],
        "coordinates": route["coordinates"],
        "messages": messages
    }

@app.post("/api/landmarks/update")
def update_landmark_position(req: LandmarkUpdateRequest):
    """Updates landmark pin position and recalculates graph edge distances."""
    base_dir = os.path.dirname(os.path.abspath(__file__))
    graph_path = os.path.join(base_dir, "data", "graph.json")
    landmarks_path = os.path.join(base_dir, "data", "landmarks.json")

    # 1. Update landmarks.json
    if os.path.exists(landmarks_path):
        with open(landmarks_path, "r", encoding="utf-8") as f:
            lm_data = json.load(f)

        updated = False
        target_node_id = None
        for lm in lm_data.get("landmarks", []):
            if lm["id"] == req.id or lm.get("nearest_node") == req.id:
                lm["lat"] = req.lat
                lm["lon"] = req.lon
                target_node_id = lm.get("nearest_node", req.id)
                updated = True
                break

        if updated:
            with open(landmarks_path, "w", encoding="utf-8") as f:
                json.dump(lm_data, f, indent=2)

    # 2. Update graph.json
    if os.path.exists(graph_path):
        with open(graph_path, "r", encoding="utf-8") as f:
            g_data = json.load(f)

        target_node = req.id if req.id in [n["id"] for n in g_data.get("nodes", [])] else target_node_id

        for node in g_data.get("nodes", []):
            if node["id"] == target_node:
                node["lat"] = req.lat
                node["lon"] = req.lon
                break

        node_dict = {n["id"]: n for n in g_data.get("nodes", [])}

        # Recalculate edge distances
        for edge in g_data.get("edges", []):
            s_node = node_dict.get(edge["source"])
            t_node = node_dict.get(edge["target"])
            if s_node and t_node:
                edge["distance_m"] = calculate_haversine(
                    s_node["lat"], s_node["lon"],
                    t_node["lat"], t_node["lon"]
                )

        with open(graph_path, "w", encoding="utf-8") as f:
            json.dump(g_data, f, indent=2)

    # Reload services
    pathfinder.load_graph()
    landmark_matcher.load_landmarks()

    return {"status": "success", "message": "Position and edge distances updated successfully."}
