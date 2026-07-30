import os
import re
import googlemaps
from typing import List, Dict, Any, Optional

class GoogleDirectionsService:
    """
    Google Maps Directions & Places API Integration Service.
    Queries official Google Maps Walking Directions API and snaps Google Places landmarks to turn maneuvers.
    """
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.environ.get("GOOGLE_MAPS_API_KEY", "").strip()
        self.gmaps_client = None
        if self.api_key:
            try:
                self.gmaps_client = googlemaps.Client(key=self.api_key)
            except Exception as e:
                print(f"[GoogleDirectionsService] Setup Warning: {e}")

    @staticmethod
    def clean_html_instruction(html_text: str) -> str:
        """Strips HTML tags from Google Maps html_instructions string."""
        clean = re.sub(r'<[^>]+>', ' ', html_text)
        return ' '.join(clean.split())

    def get_google_walking_route(self, origin: str, destination: str, custom_key: Optional[str] = None) -> Dict[str, Any]:
        """
        Requests Google Maps Walking Directions and returns parsed maneuvers + coordinates.
        """
        key_to_use = custom_key or self.api_key
        if not key_to_use:
            raise ValueError("Google Maps API Key is required. Please set GOOGLE_MAPS_API_KEY environment variable or provide your API key.")
            
        client = self.gmaps_client
        if custom_key or not client:
            client = googlemaps.Client(key=key_to_use)

        # Call Google Directions API for walking mode
        directions_result = client.directions(
            origin=origin,
            destination=destination,
            mode="walking",
            units="metric"
        )

        if not directions_result:
            raise ValueError(f"No Google walking route found between '{origin}' and '{destination}'.")

        route = directions_result[0]
        leg = route["legs"][0]
        
        total_distance_m = leg["distance"]["value"]
        total_duration_text = leg["duration"]["text"]
        start_address = leg["start_address"]
        end_address = leg["end_address"]
        
        steps = leg["steps"]
        parsed_steps: List[Dict[str, Any]] = []
        coordinates: List[List[float]] = []

        for idx, step in enumerate(steps):
            start_lat = step["start_location"]["lat"]
            start_lon = step["start_location"]["lng"]
            end_lat = step["end_location"]["lat"]
            end_lon = step["end_location"]["lng"]
            
            coordinates.append([start_lat, start_lon])
            
            raw_text = self.clean_html_instruction(step.get("html_instructions", ""))
            dist_m = step["distance"]["value"]
            maneuver = step.get("maneuver", "straight")
            
            # Query nearby Google Places landmarks
            landmark_name = None
            try:
                places_res = client.places_nearby(
                    location=(end_lat, end_lon),
                    radius=50,
                    type="point_of_interest"
                )
                results = places_res.get("results", [])
                if results:
                    landmark_name = results[0].get("name")
            except Exception:
                pass

            parsed_steps.append({
                "step": idx + 1,
                "instruction": raw_text,
                "distance_m": dist_m,
                "maneuver": maneuver,
                "landmark": landmark_name,
                "start_location": [start_lat, start_lon],
                "end_location": [end_lat, end_lon]
            })

        coordinates.append([leg["end_location"]["lat"], leg["end_location"]["lng"]])

        return {
            "status": "success",
            "provider": "Google Maps API",
            "start_address": start_address,
            "end_address": end_address,
            "total_distance_m": total_distance_m,
            "total_duration": total_duration_text,
            "coordinates": coordinates,
            "steps": parsed_steps
        }
