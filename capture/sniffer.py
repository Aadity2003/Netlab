"""Netlab capture agent (runs on the gateway / mirror-port machine).

Usage (Linux, needs root):
    sudo python3 sniffer.py --iface eth0 --lab-subnet 192.168.1.0/24 \
         --api http://localhost:5000
"""
import argparse
import ipaddress
import queue
import threading
import time

import requests
from scapy.all import sniff

from parser import parse_packet

events = queue.Queue(maxsize=50000)


def make_handler(subnet):
    net = ipaddress.ip_network(subnet, strict=False) if subnet else None

    def handle(pkt):
        ev = parse_packet(pkt)
        if not ev:
            return
        # Attribute traffic to the lab PC (the side inside the lab subnet).
        try:
            src_in = net and ipaddress.ip_address(ev["src_ip"]) in net
            dst_in = net and ipaddress.ip_address(ev["dst_ip"]) in net
        except ValueError:
            return
        if net:
            if src_in:
                ev["pc_ip"], ev["direction"] = ev["src_ip"], "out"
            elif dst_in:
                ev["pc_ip"], ev["direction"] = ev["dst_ip"], "in"
            else:
                return
        else:
            ev["pc_ip"], ev["direction"] = ev["src_ip"], "out"
        try:
            events.put_nowait(ev)
        except queue.Full:
            pass  # drop rather than block the sniffer

    return handle


def shipper(api, interval, batch_size):
    """Batch events and POST them to the backend."""
    session = requests.Session()
    buf = []
    last = time.time()
    while True:
        try:
            buf.append(events.get(timeout=interval))
        except queue.Empty:
            pass
        if buf and (len(buf) >= batch_size or time.time() - last >= interval):
            try:
                session.post(f"{api}/api/ingest", json={"events": buf}, timeout=5)
                buf = []
            except requests.RequestException as exc:
                print(f"[netlab] backend unreachable: {exc}")
                buf = buf[-5000:]  # keep a bounded backlog
            last = time.time()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--iface", required=True)
    ap.add_argument("--lab-subnet", default=None, help="e.g. 192.168.1.0/24")
    ap.add_argument("--api", default="http://localhost:5000")
    ap.add_argument("--interval", type=float, default=2.0)
    ap.add_argument("--batch", type=int, default=200)
    ap.add_argument("--bpf", default="ip or ip6", help="BPF capture filter")
    args = ap.parse_args()

    threading.Thread(target=shipper, args=(args.api, args.interval, args.batch),
                     daemon=True).start()
    print(f"[netlab] capturing on {args.iface}, shipping to {args.api}")
    sniff(iface=args.iface, filter=args.bpf, prn=make_handler(args.lab_subnet), store=False)


if __name__ == "__main__":
    main()
