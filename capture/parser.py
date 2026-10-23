"""Packet -> Netlab event parsing.

Netlab only records METADATA (who talked to what, how much, which domain).
It never stores packet payloads, passwords, or page content.
"""
from scapy.all import IP, IPv6, TCP, UDP, DNS, DNSQR, Ether, Raw


def extract_sni(payload: bytes):
    """Extract the Server Name Indication from a TLS ClientHello, if present."""
    try:
        if len(payload) < 43 or payload[0] != 0x16 or payload[5] != 0x01:
            return None
        pos = 43
        pos += 1 + payload[pos]                              # session id
        pos += 2 + int.from_bytes(payload[pos:pos + 2], "big")  # cipher suites
        pos += 1 + payload[pos]                              # compression
        ext_end = pos + 2 + int.from_bytes(payload[pos:pos + 2], "big")
        pos += 2
        while pos + 4 <= ext_end:
            ext_type = int.from_bytes(payload[pos:pos + 2], "big")
            ext_len = int.from_bytes(payload[pos + 2:pos + 4], "big")
            pos += 4
            if ext_type == 0:  # server_name
                name_len = int.from_bytes(payload[pos + 3:pos + 5], "big")
                return payload[pos + 5:pos + 5 + name_len].decode("ascii", "ignore")
            pos += ext_len
    except Exception:
        return None
    return None


def extract_http_host(payload: bytes):
    """Extract the Host header from a plain HTTP request."""
    try:
        if payload[:4] not in (b"GET ", b"POST", b"HEAD", b"PUT ", b"DELE", b"OPTI"):
            return None
        for line in payload.split(b"\r\n"):
            if line.lower().startswith(b"host:"):
                return line[5:].strip().decode("ascii", "ignore")
    except Exception:
        return None
    return None


def parse_packet(pkt):
    """Return a dict describing the packet, or None if it is not IP traffic."""
    if IP in pkt:
        ip = pkt[IP]
    elif IPv6 in pkt:
        ip = pkt[IPv6]
    else:
        return None

    proto, sport, dport = "OTHER", None, None
    if TCP in pkt:
        proto, sport, dport = "TCP", pkt[TCP].sport, pkt[TCP].dport
    elif UDP in pkt:
        proto, sport, dport = "UDP", pkt[UDP].sport, pkt[UDP].dport
    elif ip.__class__.__name__ == "IP" and ip.proto == 1:
        proto = "ICMP"

    domain, app = None, None
    if DNS in pkt and pkt[DNS].qr == 0 and DNSQR in pkt:
        domain = pkt[DNSQR].qname.decode("utf-8", "ignore").rstrip(".")
        app = "DNS"
    elif TCP in pkt and Raw in pkt:
        raw = bytes(pkt[Raw].load)
        if dport == 443 or sport == 443:
            domain = extract_sni(raw)
            app = "HTTPS" if domain else None
        elif dport == 80:
            domain = extract_http_host(raw)
            app = "HTTP" if domain else None
    if app is None:
        known = {443: "HTTPS", 80: "HTTP", 53: "DNS", 22: "SSH", 21: "FTP", 3389: "RDP"}
        app = known.get(dport) or known.get(sport)

    return {
        "ts": float(pkt.time),
        "src_ip": ip.src,
        "dst_ip": ip.dst,
        "src_mac": pkt[Ether].src if Ether in pkt else None,
        "proto": proto,
        "sport": sport,
        "dport": dport,
        "app": app,
        "domain": domain,
        "bytes": len(pkt),
    }
