from typing import List, Dict, Any

class InstructionBuilderService:
    """Generates detailed Google Maps-style turn-by-turn landmark messages."""

    def build_deterministic_instructions(self, maneuver_steps: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        instructions = []
        total_steps = len(maneuver_steps)
        
        for i, step in enumerate(maneuver_steps):
            node_name = step["node_name"]
            dist_m = int(step["distance_to_next_m"])
            turn = step["turn_direction"]
            landmark = step["landmark"]
            lm_name = landmark["name"] if landmark else node_name
            heading = step.get("cardinal_heading", "North")
            
            loc_label = lm_name if landmark else node_name
            
            if i == 0:
                if total_steps == 1:
                    text = f"You are already at {node_name}."
                else:
                    if dist_m > 0:
                        text = f"Head {heading} from {node_name}. Walk {dist_m}m straight along the walkway."
                    else:
                        text = f"Start at {node_name} and proceed along the walkway."
            elif i == total_steps - 1:
                text = f"Arrived! Your final destination, {node_name}, is directly in front of you."
            else:
                turn_label = turn.replace('_', ' ').title()
                
                if turn in ["left", "right", "slight_left", "slight_right", "sharp_left", "sharp_right"]:
                    if dist_m > 0:
                        text = f"Near {loc_label}, turn {turn_label} and walk {dist_m}m."
                    else:
                        text = f"Turn {turn_label} near {loc_label}."
                elif turn in ["u_turn", "uturn"]:
                    text = f"Make a U-Turn near {loc_label} and walk {dist_m}m."
                else:
                    if dist_m > 0:
                        text = f"Continue straight past {loc_label} for {dist_m}m."
                    else:
                        text = f"Continue straight past {loc_label}."
                    
            instructions.append({
                "step": i + 1,
                "instruction": text,
                "node_id": step["node_id"],
                "node_name": node_name,
                "landmark": lm_name if landmark else None,
                "turn": turn,
                "distance_m": dist_m,
                "lat": step["lat"],
                "lon": step["lon"]
            })
            
        return instructions

    def generate_messages(self, maneuver_steps: List[Dict[str, Any]], use_ai: bool = False) -> List[Dict[str, Any]]:
        """Main method to build step-by-step instruction messages."""
        return self.build_deterministic_instructions(maneuver_steps)
