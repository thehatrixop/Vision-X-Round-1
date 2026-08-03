import json
import math
import os
from typing import List, Dict, Any, Optional
from scipy.spatial import KDTree

class LandmarkMatcherService:
    """Calculates turn maneuver angles and matches visual landmarks to route decision points."""
    
    def __init__(self, data_path: Optional[str] = None):
        if data_path is None:
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            data_path = os.path.join(base_dir, "data", "landmarks.json")
            
        self.data_path = data_path
        self.landmarks: List[Dict[str, Any]] = []
        self.kdtree: Optional[KDTree] = None
        self.landmark_coords: List[List[float]] = []
        self.load_landmarks()

    def load_landmarks(self):
        """Loads landmark POIs and builds KDTree index for rapid spatial queries."""
        if not os.path.exists(self.data_path):
            raise FileNotFoundError(f"Landmarks dataset not found at {self.data_path}")
            
        with open(self.data_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            
        self.landmarks = data.get("landmarks", [])
        if self.landmarks:
            self.landmark_coords = [[lm["lat"], lm["lon"]] for lm in self.landmarks]
            self.kdtree = KDTree(self.landmark_coords)

    @staticmethod
    def calculate_bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """Calculates initial bearing (heading angle) in degrees between two GPS points."""
        phi1 = math.radians(lat1)
        phi2 = math.radians(lat2)
        delta_lambda = math.radians(lon2 - lon1)
        
        y = math.sin(delta_lambda) * math.cos(phi2)
        x = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(delta_lambda)
        
        bearing = math.degrees(math.atan2(y, x))
        return (bearing + 360) % 360

    @staticmethod
    def get_cardinal_direction(bearing: float) -> str:
        """Converts a bearing in degrees to a human-readable cardinal direction."""
        directions = ["North", "North-East", "East", "South-East", "South", "South-West", "West", "North-West"]
        idx = int((bearing + 22.5) / 45) % 8
        return directions[idx]

    @staticmethod
    def classify_turn(bearing_prev: float, bearing_next: float) -> str:
        """Classifies turn maneuver direction based on bearing change angle."""
        diff = (bearing_next - bearing_prev + 180) % 360 - 180
        
        if -25 <= diff <= 25:
            return "straight"
        elif 25 < diff <= 65:
            return "slight_right"
        elif 65 < diff <= 120:
            return "right"
        elif 120 < diff <= 165:
            return "sharp_right"
        elif -65 <= diff < -25:
            return "slight_left"
        elif -120 <= diff < -65:
            return "left"
        elif -165 <= diff < -120:
            return "sharp_left"
        else:
            return "u_turn"

    def find_nearest_landmark(self, lat: float, lon: float, max_radius_m: float = 120.0) -> Optional[Dict[str, Any]]:
        """Finds nearest landmark to given coordinates within max_radius_m."""
        if not self.kdtree or not self.landmarks:
            return None
            
        distance, index = self.kdtree.query([lat, lon])
        approx_dist_m = distance * 111000.0
        
        if approx_dist_m <= max_radius_m:
            landmark = self.landmarks[index].copy()
            landmark["distance_to_node_m"] = round(approx_dist_m, 1)
            return landmark
        return None

    def process_path_maneuvers(self, path_details: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Enriches path nodes & OSRM road steps with turn maneuver classification, heading, and nearest visual landmark tagging.
        """
        maneuver_steps: List[Dict[str, Any]] = []
        n = len(path_details)
        
        for i in range(n):
            curr = path_details[i]
            nearest_lm = self.find_nearest_landmark(curr["lat"], curr["lon"])
            
            turn_direction = curr.get("modifier", "straight").replace(" ", "_")
            cardinal_heading = "North"
            
            if i == 0 and n > 1:
                nxt = path_details[1]
                b = self.calculate_bearing(curr["lat"], curr["lon"], nxt["lat"], nxt["lon"])
                cardinal_heading = self.get_cardinal_direction(b)
            elif 0 < i < n - 1:
                prev = path_details[i - 1]
                nxt = path_details[i + 1]
                
                b1 = self.calculate_bearing(prev["lat"], prev["lon"], curr["lat"], curr["lon"])
                b2 = self.calculate_bearing(curr["lat"], curr["lon"], nxt["lat"], nxt["lon"])
                cardinal_heading = self.get_cardinal_direction(b2)
                
                if "modifier" not in curr or curr["modifier"] in ["straight", "none", ""]:
                    turn_direction = self.classify_turn(b1, b2)
            elif i == n - 1:
                turn_direction = "destination"
                
            maneuver_steps.append({
                "step_index": i + 1,
                "node_id": curr["node_id"],
                "node_name": curr["name"],
                "lat": curr["lat"],
                "lon": curr["lon"],
                "distance_to_next_m": curr["distance_to_next"],
                "turn_direction": turn_direction,
                "cardinal_heading": cardinal_heading,
                "landmark": nearest_lm
            })
            
        return maneuver_steps
