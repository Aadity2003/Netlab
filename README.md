# Netlab — agentless network activity monitor for lab PCs

Netlab sniffs traffic at the lab gateway (or a switch mirror port), so nothing needs to be
installed on the lab PCs. It records **metadata only** (which PC, which domain, how many bytes).
Packet contents, passwords and page data are never stored.

```
Lab PCs ──► Switch / Gateway ──► capture/sniffer.py (Scapy) ──► backend (Express + MongoDB)
                                                                     │ REST + WebSocket
                                                                     ▼
                                                            frontend (React dashboard)
```

## Features
- Live packet capture (TCP/UDP/ICMP, DNS queries, TLS SNI, HTTP Host)
- Per-PC tracking by IP/MAC with online status, bandwidth and sites visited
- Blocklist rules with real-time alerts and an acknowledge workflow
- Dashboard: bandwidth chart, top domains, protocol breakdown, live feed with filter/pause
- History in MongoDB (raw events auto-expire, per-minute usage is kept) and CSV report export

## Run it

### 1. Backend (needs MongoDB on localhost:27017)
```bash
cd backend
cp .env.example .env
npm install
npm start
```

### 2. Frontend
```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

### 3. Test without real traffic
```bash
cd capture
pip install -r requirements.txt
python3 simulate.py
```

### 4. Real capture (Linux gateway / mirror-port machine)
```bash
cd capture
pip install -r requirements.txt
sudo python3 sniffer.py --iface eth0 --lab-subnet 192.168.1.0/24 --api http://localhost:5000
```
Find your interface name with `ip link`. To see *all* lab traffic, the machine must be the lab's
gateway/router or be plugged into a **mirror (SPAN) port** on the switch.

## Notes
- HTTPS content is encrypted; Netlab sees only the domain (SNI) and packet sizes. Encrypted DNS
  (DoH) or Encrypted Client Hello can hide domains.
- Only monitor your own lab network, and make sure users know the policy.
- The backend has no login yet, so keep it on the internal network. JWT auth is a good next step.
