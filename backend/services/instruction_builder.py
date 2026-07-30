import os
from typing import List, Dict, Any

class InstructionBuilderService:
    """Generates step-by-step human messages using rule templates and Cerebras Cloud API (Llama 3.3/3.1)."""
    
    def __init__(self):
        self.cerebras_api_key = os.environ.get("CEREBRAS_API_KEY", "").strip()
        self.client = None
        
        if self.cerebras_api_key:
            try:
                from cerebras.cloud.sdk import Cerebras
                self.client = Cerebras(api_key=self.cerebras_api_key)
            except Exception as e:
                print(f"[InstructionBuilder] Warning initializing Cerebras SDK: {e}")

    def build_deterministic_instructions(self, maneuver_steps: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Creates rule-based turn-by-turn messages with distance and landmark mentions.
        Example: 'Walk 200m till Administrative Building and then take a left turn there.'
        """
        instructions = []
        total_steps = len(maneuver_steps)
        
        for i, step in enumerate(maneuver_steps):
            node_name = step["node_name"]
            dist_m = int(step["distance_to_next_m"])
            turn = step["turn_direction"]
            landmark = step["landmark"]
            lm_name = landmark["name"] if landmark else node_name
            
            if i == 0:
                if total_steps == 1:
                    text = f"You are already at {node_name}."
                else:
                    if turn == "straight":
                        text = f"Start at {node_name}. Walk {dist_m}m straight towards {maneuver_steps[i+1]['node_name']}."
                    else:
                        turn_str = turn.replace('_', ' ')
                        text = f"Start at {node_name}. Walk {dist_m}m towards {lm_name} and prepare for a {turn_str} turn."
            elif i == total_steps - 1:
                text = f"Arrived! Your final destination {node_name} is right in front of you."
            else:
                next_node = maneuver_steps[i+1]['node_name'] if i + 1 < total_steps else "your destination"
                turn_str = turn.replace('_', ' ')
                
                if turn in ["left", "right", "slight_left", "slight_right", "sharp_left", "sharp_right"]:
                    text = f"Walk {dist_m}m till {lm_name} and then take a {turn_str} turn there towards {next_node}."
                elif turn == "u_turn":
                    text = f"Walk {dist_m}m till {lm_name} and make a U-turn there."
                else:
                    text = f"Continue {dist_m}m straight past {lm_name} towards {next_node}."
                    
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

    def refine_with_cerebras(self, deterministic_messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Uses Cerebras Llama 3.3 70B / 3.1 8B via Cerebras SDK to polish instructions into warm, natural conversational steps.
        """
        if not self.client:
            return deterministic_messages
            
        try:
            prompt = (
                "You are an AI spatial navigation assistant. "
                "Refine the following turn-by-turn route instructions so they sound like a friendly, clear conversational guide. "
                "Keep landmark names and distances exact. Return ONLY a JSON list of refined step strings.\n\n"
                "Steps:\n" + "\n".join([f"Step {m['step']}: {m['instruction']}" for m in deterministic_messages])
            )
            
            response = self.client.chat.completions.create(
                model="llama-3.3-70b", # or llama3.1-8b
                messages=[{"role": "user", "content": prompt}],
                temperature=0.2,
                max_tokens=500
            )
            
            content = response.choices[0].message.content.strip()
            # Attempt to parse or update messages safely
            import json
            if content.startswith("[") and content.endswith("]"):
                refined_texts = json.loads(content)
                if isinstance(refined_texts, list) and len(refined_texts) == len(deterministic_messages):
                    for i, refined in enumerate(refined_texts):
                        deterministic_messages[i]["instruction"] = str(refined)
            return deterministic_messages
        except Exception as e:
            print(f"[InstructionBuilder] Cerebras API call info (using fallback): {e}")
            return deterministic_messages

    def generate_messages(self, maneuver_steps: List[Dict[str, Any]], use_ai: bool = True) -> List[Dict[str, Any]]:
        """Main method to build step-by-step instruction messages."""
        base_messages = self.build_deterministic_instructions(maneuver_steps)
        if use_ai and self.cerebras_api_key and self.client:
            return self.refine_with_cerebras(base_messages)
        return base_messages
