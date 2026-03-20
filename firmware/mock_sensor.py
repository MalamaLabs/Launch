"""
Mock sensor — simulates N Raspberry Pi nodes streaming signed readings to Kafka.
Runs in Docker for local development. No physical hardware needed.
"""
import os, time, json, random, hashlib, hmac
from kafka import KafkaProducer

KAFKA_BOOTSTRAP = os.environ.get("KAFKA_BOOTSTRAP", "localhost:9092")
NUM_SENSORS     = int(os.environ.get("NUM_SENSORS", "5"))
ANOMALY_RATE    = float(os.environ.get("ANOMALY_RATE", "0.1"))
INTERVAL_SEC    = float(os.environ.get("INTERVAL_SEC", "5"))

# Generate deterministic fake sensor DIDs
SENSORS = [
    {
        "did": f"did:cardano:sensor:idaho-mock-{i:03d}",
        "hex_id": "8928308280fffff",
        "lat": 43.45 + (i * 0.01),
        "lng": -112.31 + (i * 0.01),
        "secret": hashlib.sha256(f"mock-secret-{i}".encode()).hexdigest(),
    }
    for i in range(NUM_SENSORS)
]

def fake_signature(did: str, payload: str, secret: str) -> str:
    return hmac.new(
        secret.encode(), 
        payload.encode(), 
        hashlib.sha256
    ).hexdigest()

def generate_reading(sensor: dict, nonce: int) -> dict:
    is_anomaly = random.random() < ANOMALY_RATE

    if is_anomaly:
        # Simulate a tampered/faulty reading
        temperature = random.uniform(85, 120)   # Way out of range
        print(f"  🚨 ANOMALY injected for {sensor['did'][-12:]}")
    else:
        temperature = round(random.gauss(18.5, 2.0), 2)

    reading = {
        "sensorDid":  sensor["did"],
        "hexId":      sensor["hex_id"],
        "timestamp":  int(time.time()),
        "nonce":      nonce,
        "readings": {
            "temperature_c": temperature,
            "humidity_pct":  round(random.gauss(55, 5), 2),
            "pressure_hpa":  round(random.gauss(1013, 3), 2),
            "gas_kohm":      round(random.uniform(10, 100), 2),
        },
        "location": [sensor["lat"], sensor["lng"]],
    }

    payload_str = json.dumps(reading, sort_keys=True)
    reading["signature"] = fake_signature(
        sensor["did"], payload_str, sensor["secret"]
    )
    return reading

def main():
    print(f"🌿 Mālama Mock Sensor starting — {NUM_SENSORS} sensors")
    print(f"   Kafka: {KAFKA_BOOTSTRAP}")
    print(f"   Anomaly rate: {ANOMALY_RATE * 100:.0f}%")
    print(f"   Interval: {INTERVAL_SEC}s\n")

    # Wait for Kafka to be ready
    for attempt in range(10):
        try:
            producer = KafkaProducer(
                bootstrap_servers=KAFKA_BOOTSTRAP,
                value_serializer=lambda v: json.dumps(v).encode("utf-8"),
            )
            print("✅ Connected to Kafka\n")
            break
        except Exception as e:
            print(f"   Waiting for Kafka... ({attempt+1}/10)")
            time.sleep(5)
    else:
        print("❌ Could not connect to Kafka after 10 attempts")
        return

    nonces = {s["did"]: 0 for s in SENSORS}

    while True:
        for sensor in SENSORS:
            nonces[sensor["did"]] += 1
            reading = generate_reading(sensor, nonces[sensor["did"]])
            producer.send("malama-sensor-streams", value=reading)
            print(
                f"  📡 {sensor['did'][-12:]} | "
                f"nonce={nonces[sensor['did']]:04d} | "
                f"temp={reading['readings']['temperature_c']:6.2f}°C"
            )

        producer.flush()
        time.sleep(INTERVAL_SEC)

if __name__ == "__main__":
    main()
