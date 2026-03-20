import os
import time
import json
from datetime import datetime

HISTORY_FILE = "/tmp/malama_reboot_history.json"

def handle_quarantine(sensor_did: str, error: str):
    print(f"[{datetime.utcnow().isoformat()}] Sensor Quarantine Protocol triggered - DID: {sensor_did} - Error: {error}")
    
    history = []
    if os.path.exists(HISTORY_FILE):
        try:
            with open(HISTORY_FILE, "r") as f:
                history = json.load(f)
        except Exception:
            pass
            
    current_time = time.time()
    # Filter out errors older than 1 hour
    history = [t for t in history if current_time - t < 3600]
    
    history.append(current_time)
    
    with open(HISTORY_FILE, "w") as f:
        json.dump(history, f)
        
    if len(history) > 3:
        print("More than 3 critical errors in the past hour. Triggering HARD RESET.")
        os.system("sudo reboot")
    else:
        print("Waiting 60 seconds and retrying...")
        time.sleep(60)
