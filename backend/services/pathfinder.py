import json
import os
import requests
import networkx as nx
from typing import List, Dict, Any, Tuple, Optional

class PathfinderService:
    """
    Pathfinding service combining NetworkX campus graph with OSRM foot routing engine
    turn-by-turn steps for high-precision street & landmark guidance.
    """
    
    def __init__(self, data_path: Optional[str] = None):
        if data_path is None:
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            data_path = os.path.join(base_dir, "data", "graph.json")
        
        self.data_path = data_path
        self.graph = nx.Graph()
        self.nodes: Dict[str, Dict[str, Any]] = {}
        self.nodes_data: Dict[str, Dict[str, Any]] = {}
        self.center: Dict[str, float] = {"lat": 26.5025, "lon": 80.2683}
        self.ors_api_key = os.environ.get("OPENROUTESERVICE_API_KEY", "").strip()
        self.load_graph()

    def load_graph(self):
        """Loads nodes and weighted edges into NetworkX Graph."""
        if not os.path.exists(self.data_path):
            raise FileNotFoundError(f"Graph dataset not found at {self.data_path}")
            
        with open(self.data_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            
        self.center = data.get("center", self.center)
        self.nodes_data.clear()
        self.nodes.clear()
        self.graph.clear()
        
        for node in data.get("nodes", []):
            node_id = node["id"]
            self.nodes_data[node_id] = node
            self.nodes[node_id] = node
            self.graph.add_node(node_id, name=node["name"], lat=node["lat"], lon=node["lon"])
            
        for edge in data.get("edges", []):
            self.graph.add_edge(
                edge["source"],
                edge["target"],
                weight=edge.get("distance_m", 1.0),
                path_type=edge.get("path_type", "walkway")
            )

    def fetch_openrouteservice_path(self, start_node: Dict[str, Any], end_node: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Queries OSRM foot-walking engine with steps=true for real turn-by-turn road maneuvers.
        """
        start_lon, start_lat = start_node["lon"], start_node["lat"]
        end_lon, end_lat = end_node["lon"], end_node["lat"]
        
        # 1. Try OpenRouteService API if API key exists
        if self.ors_api_key:
            try:
                url = "https://api.openrouteservice.org/v2/directions/foot-walking/geojson"
                headers = {
                    "Authorization": self.ors_api_key,
                    "Content-Type": "application/json"
                }
                body = {"coordinates": [[start_lon, start_lat], [end_lon, end_lat]]}
                res = requests.post(url, json=body, headers=headers, timeout=5)
                
                if res.status_code == 200:
                    data = res.json()
                    feature = data["features"][0]
                    coords_lon_lat = feature["geometry"]["coordinates"]
                    coordinates = [[lat, lon] for lon, lat in coords_lon_lat]
                    distance_m = feature["properties"]["summary"]["distance"]
                    return {
                        "coordinates": coordinates,
                        "distance_m": round(distance_m, 1),
                        "engine": "OpenRouteService",
                        "steps": []
                    }
            except Exception as e:
                print(f"[ORS API Info]: {e}")

        # 2. Free OpenStreetMap OSRM Foot Routing Engine with steps=true
        try:
            osrm_url = f"https://router.project-osrm.org/route/v1/foot/{start_lon},{start_lat};{end_lon},{end_lat}?steps=true&overview=full&geometries=geojson"
            res = requests.get(osrm_url, timeout=4)
            if res.status_code == 200:
                data = res.json()
                if data.get("code") == "Ok" and len(data.get("routes", [])) > 0:
                    route = data["routes"][0]
                    coords_lon_lat = route["geometry"]["coordinates"]
                    coordinates = [[lat, lon] for lon, lat in coords_lon_lat]
                    distance_m = route["distance"]
                    
                    # Parse detailed road steps
                    osrm_steps = []
                    for leg in route.get("legs", []):
                        for step in leg.get("steps", []):
                            maneuver = step.get("maneuver", {})
                            loc = maneuver.get("location", [start_lon, start_lat])
                            osrm_steps.append({
                                "lat": loc[1],
                                "lon": loc[0],
                                "distance_m": step.get("distance", 0.0),
                                "maneuver_type": maneuver.get("type", "turn"),
                                "modifier": maneuver.get("modifier", "straight"),
                                "name": step.get("name", "")
                            })
                            
                    return {
                        "coordinates": coordinates,
                        "distance_m": round(distance_m, 1),
                        "engine": "OSRM Foot Engine",
                        "steps": osrm_steps
                    }
        except Exception as e:
            print(f"[OSRM Foot Engine Info]: {e}")
            
        return None

    def find_shortest_path(self, start_node: str, end_node: str, use_ors: bool = True) -> Optional[Dict[str, Any]]:
        """
        Computes shortest path combining OSRM road maneuvers and campus graph nodes for complete landmark guidance.
        """
        if start_node not in self.nodes_data or end_node not in self.nodes_data:
            return None

        start_info = self.nodes_data[start_node]
        end_info = self.nodes_data[end_node]

        # Query OSRM Foot Routing Engine with steps=true
        ors_result = None
        if use_ors:
            ors_result = self.fetch_openrouteservice_path(start_info, end_info)

        if ors_result and ors_result.get("steps") and len(ors_result["steps"]) > 0:
            osrm_steps = ors_result["steps"]
            path_details: List[Dict[str, Any]] = []
            
            for idx, s in enumerate(osrm_steps):
                node_name = start_info["name"] if idx == 0 else (end_info["name"] if idx == len(osrm_steps) - 1 else (s["name"] or f"Turn Point {idx+1}"))
                node_id = start_node if idx == 0 else (end_node if idx == len(osrm_steps) - 1 else f"osrm_{idx}")
                
                path_details.append({
                    "node_id": node_id,
                    "name": node_name,
                    "lat": s["lat"],
                    "lon": s["lon"],
                    "distance_to_next": round(s["distance_m"], 1),
                    "maneuver_type": s["maneuver_type"],
                    "modifier": s["modifier"],
                    "path_type": "footpath"
                })

            return {
                "start_node": start_node,
                "end_node": end_node,
                "path_nodes": [start_node, end_node],
                "total_distance_m": ors_result["distance_m"],
                "coordinates": ors_result["coordinates"],
                "path_details": path_details,
                "routing_engine": ors_result["engine"]
            }

        # Fallback to local NetworkX graph pathfinding
        try:
            path_nodes = nx.shortest_path(self.graph, source=start_node, target=end_node, weight="weight")
            total_graph_distance = nx.shortest_path_length(self.graph, source=start_node, target=end_node, weight="weight")
            
            coordinates: List[List[float]] = []
            path_details: List[Dict[str, Any]] = []
            
            for i, node_id in enumerate(path_nodes):
                node_info = self.nodes_data[node_id]
                coordinates.append([node_info["lat"], node_info["lon"]])
                
                step_detail = {
                    "node_id": node_id,
                    "name": node_info["name"],
                    "lat": node_info["lat"],
                    "lon": node_info["lon"],
                    "distance_to_next": 0.0,
                    "path_type": "walkway"
                }
                
                if i < len(path_nodes) - 1:
                    next_node = path_nodes[i + 1]
                    edge_data = self.graph.get_edge_data(node_id, next_node)
                    step_detail["distance_to_next"] = edge_data.get("weight", 0.0) if edge_data else 0.0
                    step_detail["path_type"] = edge_data.get("path_type", "walkway") if edge_data else "walkway"
                    
                path_details.append(step_detail)
                
            return {
                "start_node": start_node,
                "end_node": end_node,
                "path_nodes": path_nodes,
                "total_distance_m": round(total_graph_distance, 1),
                "coordinates": coordinates,
                "path_details": path_details,
                "routing_engine": "CSJMU Graph Engine"
            }
        except Exception as e:
            print(f"[Pathfinder] NetworkX routing error: {e}")
            return None

    def get_shortest_path(self, start_node: str, end_node: str, use_ors: bool = True) -> Optional[Dict[str, Any]]:
        return self.find_shortest_path(start_node, end_node, use_ors)
