import requests
import time
import math
import random

# Update this if your server moves
# SERVER_URL = "http://127.0.0.0:8000/api/location"
SERVER_URL = "http://127.0.0.1:8000/api/location"  # Changed to localhost

# We create 6 mock EVs placed around New Delhi roughly
mock_evs = [
    {"ev_id": "EV-001", "lat": 28.6139, "lng": 77.2090, "base_lat": 28.6139, "base_lng": 77.2090, "speed": 0.1, "angle": 0},
    {"ev_id": "EV-002", "lat": 28.6200, "lng": 77.2100, "base_lat": 28.6200, "base_lng": 77.2100, "speed": 0.2, "angle": 1.5},
    {"ev_id": "EV-003", "lat": 28.6000, "lng": 77.1900, "base_lat": 28.6000, "base_lng": 77.1900, "speed": 0.08, "angle": 3.14},
    {"ev_id": "EV-004", "lat": 28.6300, "lng": 77.2200, "base_lat": 28.6300, "base_lng": 77.2200, "speed": 0.12, "angle": 2},
    {"ev_id": "EV-005", "lat": 28.6100, "lng": 77.2300, "base_lat": 28.6100, "base_lng": 77.2300, "speed": 0.12, "angle": 0.5},
    {"ev_id": "EV-006", "lat": 28.5900, "lng": 77.2100, "base_lat": 28.5900, "base_lng": 77.2100, "speed": 0.18, "angle": 4},
]

print("Starting Mock GPS Data Emitter...")
print("Press Ctrl+C to stop.")

def update_positions():
    for ev in mock_evs:
        # Move them in a slightly wobbly circle
        ev["lat"] = ev["base_lat"] + math.sin(ev["angle"]) * 0.01
        ev["lng"] = ev["base_lng"] + math.cos(ev["angle"]) * 0.01
        ev["angle"] += ev["speed"]

def send_data():
    for ev in mock_evs:
        payload = {
            "ev_id": ev["ev_id"],
            "lat": ev["lat"],
            "lng": ev["lng"]
        }
        try:
            res = requests.post(SERVER_URL, json=payload, timeout=0.01)
            print(f"[{res.status_code}] Sent {ev['ev_id']} -> {ev['lat']:.5f}, {ev['lng']:.5f}")
        except Exception as e:
            print(f"Failed to send {ev['ev_id']}: {e}")

if __name__ == "__main__":
    try:
        while True:
            update_positions()
            send_data()
            time.sleep(0.1) # Update every 3 seconds to match ESP32 interval
    except KeyboardInterrupt:
        print("\nStopped.")
