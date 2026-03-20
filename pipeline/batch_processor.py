import os
import json
import time
import sqlite3
import hashlib
import tempfile
import requests
import yaml
import logging
from apscheduler.schedulers.blocking import BlockingScheduler
from datasketch import MinHash
try:
    from confluent_kafka import Consumer, KafkaError, KafkaException
except ImportError:
    Consumer = None

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def load_config():
    with open("config/pipeline_config.yaml", "r") as f:
        return yaml.safe_load(f)

def init_db():
    conn = sqlite3.connect("pipeline.db")
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS batches
                 (batch_id TEXT PRIMARY KEY, merkle_root TEXT, ipfs_cid TEXT, 
                  reading_count INTEGER, timestamp INTEGER)''')
    conn.commit()
    conn.close()

def calc_merkle_root(leaves):
    if not leaves: return ""
    while len(leaves) > 1:
        if len(leaves) % 2 != 0:
            leaves.append(leaves[-1])
        next_level = []
        for i in range(0, len(leaves), 2):
            h = hashlib.sha256((leaves[i] + leaves[i+1]).encode()).hexdigest()
            next_level.append(h)
        leaves = next_level
    return leaves[0]

def pin_to_ipfs(filename, filepath):
    jwt = os.getenv("PINATA_JWT")
    if not jwt: 
        logger.warning("PINATA_JWT missing, simulating IPFS CID.")
        return "mock_cid_" + os.path.basename(filepath)
        
    headers = {"Authorization": f"Bearer {jwt}"}
    with open(filepath, 'rb') as f:
        files = {"file": (filename, f)}
        res = requests.post("https://api.pinata.cloud/pinning/pinFileToIPFS", files=files, headers=headers)
        res.raise_for_status()
        return res.json()["IpfsHash"]

def process_batch():
    config = load_config()
    kafka_broker = os.getenv("KAFKA_BROKER", "localhost:9092")
    if not Consumer:
        logger.error("Kafka consumer unavailable.")
        return
        
    c = Consumer({
        'bootstrap.servers': kafka_broker,
        'group.id': config['kafka_consumer_group'] + "_batch",
        'auto.offset.reset': 'earliest'
    })
    c.subscribe(['malama-validated-readings'])
    
    readings = []
    end_time = time.time() + 10 
    while time.time() < end_time:
        msg = c.poll(1.0)
        if msg is None: continue
        if msg.error(): continue
        
        try:
            data = json.loads(msg.value().decode())
            if data.get("action") == "ACCEPT":
                readings.append(data.get("payload"))
        except Exception:
            pass

    c.close()
    
    min_read = config['min_readings_per_batch']
    if len(readings) < min_read:
        logger.info(f"Only {len(readings)} readings retrieved. Min required {min_read}. Skipping batch.")
        return
        
    filtered = []
    seen_hashes = set()
    for r in readings:
        m = MinHash(num_perm=128)
        content = json.dumps(r, sort_keys=True)
        for d in [content[i:i+4] for i in range(0, len(content), 4)]:
            m.update(d.encode('utf8'))
        h = tuple(m.digest())
        if h not in seen_hashes:
            seen_hashes.add(h)
            filtered.append(r)
            
    leaves = [hashlib.sha256(json.dumps(r, sort_keys=True).encode()).hexdigest() for r in filtered]
    root = calc_merkle_root(leaves)
    batch_id = hashlib.sha256(f"{time.time()}_{root}".encode()).hexdigest()
    
    tmp_dir = tempfile.gettempdir()
    raw_path = os.path.join(tmp_dir, f"{batch_id}_raw.json")
    with open(raw_path, "w") as f: json.dump(filtered, f)
    
    tree_path = os.path.join(tmp_dir, f"{batch_id}_tree.json")
    with open(tree_path, "w") as f: json.dump({"root": root, "leaves": leaves}, f)
    
    cid = pin_to_ipfs(f"{batch_id}.json", raw_path) 
    
    conn = sqlite3.connect("pipeline.db")
    cursor = conn.cursor()
    cursor.execute("INSERT INTO batches VALUES (?, ?, ?, ?, ?)",
                   (batch_id, root, cid, len(filtered), int(time.time())))
    conn.commit()
    conn.close()
    logger.info(f"Batch {batch_id} processed gracefully. CID: {cid}")

if __name__ == "__main__":
    init_db()
    scheduler = BlockingScheduler()
    config = load_config()
    scheduler.add_job(process_batch, 'interval', minutes=config['batch_interval_minutes'])
    logger.info("Batch processor started natively.")
    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        pass
