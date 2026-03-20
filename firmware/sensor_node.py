#!/usr/bin/env python3
import time
import json
import yaml
import hashlib
import threading
import signal
import sys
from http.server import HTTPServer, BaseHTTPRequestHandler
from sign_reading import sign_reading_with_atecc
from reboot_handler import handle_quarantine

try:
    from confluent_kafka import Producer
except ImportError:
    Producer = None

running = True
node_status = "STARTING"

class HealthHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"status": node_status}).encode())
        else:
            self.send_response(404)
            self.end_headers()

def start_health_server():
    server = HTTPServer(('0.0.0.0', 8080), HealthHandler)
    server.timeout = 1
    while running:
        server.handle_request()

def sigterm_handler(signum, frame):
    global running, node_status
    print("Received SIGTERM, shutting down gracefully...")
    running = False
    node_status = "SHUTTING_DOWN"

def load_config():
    try:
        with open("/etc/malama/node_config.yaml", "r") as f:
            return yaml.safe_load(f)
    except FileNotFoundError:
        print("Config not found. Please run provision_sensor.py first.")
        sys.exit(1)

def get_sensor_readings():
    # Mocking BME680, Soil, or SCD40 telemetry aggregation logic
    return {
        "temperature": 25.4,
        "humidity": 45.0,
        "pressure": 1013.25,
        "gas": 45.1
    }

def main():
    global node_status
    signal.signal(signal.SIGTERM, sigterm_handler)
    signal.signal(signal.SIGINT, sigterm_handler)

    config = load_config()
    did = config.get("sensor_did")
    kafka_broker = config.get("kafka_broker")
    
    if Producer:
        producer = Producer({"bootstrap.servers": kafka_broker})
    else:
        producer = None
        print("confluent_kafka not installed. Using console stdout.")

    health_thread = threading.Thread(target=start_health_server, daemon=True)
    health_thread.start()

    node_status = "RUNNING"
    print(f"Sensor node started for DID: {did}")

    backoff = 1

    while running:
        try:
            readings = get_sensor_readings()
            timestamp = int(time.time() * 1000)
            
            payload = {
                "did": did,
                "timestamp": timestamp,
                "readings": readings
            }
            
            payload_json = json.dumps(payload, sort_keys=True)
            payload_hash = hashlib.sha256(payload_json.encode()).digest()
            
            signature = sign_reading_with_atecc(payload_hash)
            
            message = {
                "payload": payload,
                "signature": signature
            }
            
            if producer:
                producer.produce("sensor-telemetry", value=json.dumps(message))
                producer.flush()
            else:
                print(f"[KAFKA MOCK] Sent: {message}")
                
            backoff = 1 
            
            # Wait cleanly accommodating sigterm
            for _ in range(10):
                if not running: break
                time.sleep(1)
            
        except Exception as e:
            print(f"Error in sensor loop: {e}")
            handle_quarantine(did, str(e))
            
            print(f"Backing off for {backoff} seconds...")
            for _ in range(backoff):
                if not running: break
                time.sleep(1)
            backoff = min(backoff * 2, 60)

    print("Sensor node exited cleanly.")

if __name__ == "__main__":
    main()
