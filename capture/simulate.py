"""Send fake lab traffic to the backend so you can test the dashboard without sniffing.

    python3 simulate.py --api http://localhost:5000
"""
import argparse
import random
import time

import requests

DOMAINS = ["google.com", "github.com", "stackoverflow.com", "youtube.com", "wikipedia.org",
           "facebook.com", "npmjs.com", "geeksforgeeks.org", "steampowered.com"]
PCS = [f"192.168.1.{i}" for i in range(10, 16)]

ap = argparse.ArgumentParser()
ap.add_argument("--api", default="http://localhost:5000")
args = ap.parse_args()

while True:
    evs = []
    for _ in range(random.randint(5, 30)):
        pc = random.choice(PCS)
        out = random.random() < 0.5
        evs.append({
            "ts": time.time(), "pc_ip": pc, "direction": "out" if out else "in",
            "src_mac": "aa:bb:cc:00:00:" + pc.split(".")[-1].zfill(2), "proto": "TCP",
            "app": "HTTPS", "domain": random.choice(DOMAINS) if random.random() < 0.4 else None,
            "dst_ip": "142.250.0." + str(random.randint(1, 254)), "dport": 443,
            "bytes": random.randint(60, 1500),
        })
    try:
        requests.post(f"{args.api}/api/ingest", json={"events": evs}, timeout=5)
    except requests.RequestException as e:
        print("backend down:", e)
    time.sleep(2)
