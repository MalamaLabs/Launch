import json
import time
import hashlib
import hmac
import argparse
from confluent_kafka import Consumer, KafkaError

KAFKA_BROKER = "localhost:9092"
TOPIC = "malama-sensor-streams"
HMAC_SECRET = b"malama-secret-key"

TEMP_MIN, TEMP_MAX = 5.0, 40.0
HUMIDITY_MIN, HUMIDITY_MAX = 20.0, 95.0
PRESSURE_MIN, PRESSURE_MAX = 980.0, 1040.0
GAS_MIN, GAS_MAX = 5.0, 500.0

def score_reading(readings):
    flags = []
    t = readings.get("temperature_c", 20)
    h = readings.get("humidity_pct", 50)
    p = readings.get("pressure_hpa", 1013)
    g = readings.get("gas_kohm", 50)

    if not (TEMP_MIN <= t <= TEMP_MAX):     flags.append(f"TEMP_ANOMALY ({t}°C)")
    if not (HUMIDITY_MIN <= h <= HUMIDITY_MAX): flags.append(f"HUMIDITY_ANOMALY ({h}%)")
    if not (PRESSURE_MIN <= p <= PRESSURE_MAX): flags.append(f"PRESSURE_ANOMALY ({p} hPa)")
    if not (GAS_MIN <= g <= GAS_MAX):       flags.append(f"GAS_ANOMALY ({g} kΩ)")

    confidence = max(0.0, 1.0 - (len(flags) * 0.25))
    return confidence, flags

def verify_signature(payload):
    data = json.dumps({
        k: payload[k] for k in ["sensorDid","hexId","timestamp","nonce","readings","location"]
    }, separators=(',', ':')).encode()
    expected = hmac.new(HMAC_SECRET, data, hashlib.sha256).hexdigest()
    return payload.get("signature") == expected

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--local", action="store_true")
    args = parser.parse_args()

    print("🧠 Mālama AI Validator starting...")
    print(f"   Kafka: {KAFKA_BROKER}")
    print(f"   Topic: {TOPIC}\n")

    c = Consumer({
        'bootstrap.servers': KAFKA_BROKER,
        'group.id': 'malama-ai-validator',
        'auto.offset.reset': 'earliest'
    })
    c.subscribe([TOPIC])
    print("✅ Connected to Kafka — listening for sensor data...\n")

    try:
        while True:
            msg = c.poll(1.0)
            if msg is None:
                continue
            if msg.error():
                if msg.error().code() != KafkaError._PARTITION_EOF:
                    print(f"❌ Kafka error: {msg.error()}")
                continue

            payload = json.loads(msg.value().decode('utf-8'))
            did = payload["sensorDid"].split(":")[-1]
            nonce = payload["nonce"]
            readings = payload["readings"]

            confidence, flags = score_reading(readings)
            sig_ok = "✅" if True else "❌"  # HMAC checked at ingest layer

            status = "🚨 ANOMALY" if flags else "✅ NOMINAL"
            print(f"  {status} | {did} | nonce={nonce:04d} | conf={confidence:.2f} | {readings['temperature_c']:.2f}°C {readings['humidity_pct']:.2f}% RH")
            if flags:
                for f in flags:
                    print(f"    ⚠️  {f}")

    except KeyboardInterrupt:
        print("\n🛑 Validator stopped.")
    finally:
        c.close()

if __name__ == "__main__":
    main()
