"""
ExhibitX Dual HTTP + HTTPS Server for Desktop Webcam & Mobile Camera AR.
- HTTP  on port 8080 (instant desktop webcam access on http://localhost:8080)
- HTTPS on port 8443 (required by mobile Chrome/Safari for real camera & WebXR AR over Wi-Fi)
- Zero external Python dependencies (generates its own RSA-2048 self-signed X.509v3 cert).
- Zero GPS / Zero location tracking.
"""

import base64
import datetime
import hashlib
import http.server
import ipaddress
import json
import os
import random
import socket
import ssl
import threading


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CERT_FILE = os.path.join(BASE_DIR, ".exhibitx-cert.pem")
KEY_FILE = os.path.join(BASE_DIR, ".exhibitx-key.pem")
HTTP_PORT = 8080
HTTPS_PORT = 8443


def get_lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


# ── Pure-Python ASN.1 DER + RSA-2048 Self-Signed X.509v3 Cert Generator ──

def _der_len(n):
    if n < 0x80:
        return bytes([n])
    b = n.to_bytes((n.bit_length() + 7) // 8, "big")
    return bytes([0x80 | len(b)]) + b


def _der_tlv(tag, val):
    return bytes([tag]) + _der_len(len(val)) + val


def _der_int(n):
    if n == 0:
        return _der_tlv(0x02, b"\x00")
    b = n.to_bytes((n.bit_length() + 7) // 8, "big")
    if b[0] & 0x80:
        b = b"\x00" + b
    return _der_tlv(0x02, b)


def _der_seq(*items):
    return _der_tlv(0x30, b"".join(items))


def _der_set(*items):
    return _der_tlv(0x31, b"".join(items))


def _der_oid(oid_str):
    parts = [int(x) for x in oid_str.split(".")]
    out = bytearray([40 * parts[0] + parts[1]])
    for p in parts[2:]:
        if p == 0:
            out.append(0)
        else:
            chunks = []
            while p:
                chunks.append(p & 0x7F)
                p >>= 7
            for i in range(len(chunks) - 1, -1, -1):
                out.append(chunks[i] | (0x80 if i > 0 else 0))
    return _der_tlv(0x06, bytes(out))


def _der_bitstr(b):
    return _der_tlv(0x03, b"\x00" + b)


def _der_octstr(b):
    return _der_tlv(0x04, b)


def _der_utf8(s):
    return _der_tlv(0x0C, s.encode("utf-8"))


def _der_utctime(dt):
    return _der_tlv(0x17, dt.strftime("%y%m%d%H%M%SZ").encode("ascii"))


def _is_probable_prime(n, k=20):
    if n < 2:
        return False
    small_primes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37]
    for p in small_primes:
        if n == p:
            return True
        if n % p == 0:
            return False
    d, r = n - 1, 0
    while d % 2 == 0:
        d //= 2
        r += 1
    rng = random.SystemRandom()
    for _ in range(k):
        a = rng.randrange(2, n - 2)
        x = pow(a, d, n)
        if x == 1 or x == n - 1:
            continue
        for _ in range(r - 1):
            x = pow(x, 2, n)
            if x == n - 1:
                break
        else:
            return False
    return True


def _gen_prime(bits):
    rng = random.SystemRandom()
    while True:
        cand = rng.getrandbits(bits) | (1 << (bits - 1)) | 1
        if _is_probable_prime(cand):
            return cand


def _rsa_sign_sha256(msg, n, d):
    k = (n.bit_length() + 7) // 8
    digest = hashlib.sha256(msg).digest()
    # DigestInfo for SHA-256
    digest_info = _der_seq(
        _der_seq(_der_oid("2.16.840.1.101.3.4.2.1"), b"\x05\x00"),
        _der_octstr(digest),
    )
    ps_len = k - len(digest_info) - 3
    em = b"\x00\x01" + (b"\xff" * ps_len) + b"\x00" + digest_info
    sig_int = pow(int.from_bytes(em, "big"), d, n)
    return sig_int.to_bytes(k, "big")


def _to_pem(der_bytes, label):
    b64 = base64.encodebytes(der_bytes).decode("ascii")
    return f"-----BEGIN {label}-----\n{b64}-----END {label}-----\n"


def ensure_self_signed_cert(lan_ip):
    ip_marker = os.path.join(BASE_DIR, ".exhibitx-cert-ip.txt")
    if (
        os.path.exists(CERT_FILE)
        and os.path.exists(KEY_FILE)
        and os.path.exists(ip_marker)
        and open(ip_marker, "r", encoding="utf-8").read().strip() == lan_ip
    ):
        return

    print(f"[ExhibitX] Generating self-signed TLS certificate for localhost & {lan_ip}...")
    e = 65537
    while True:
        p = _gen_prime(1024)
        q = _gen_prime(1024)
        if p == q:
            continue
        phi = (p - 1) * (q - 1)
        if phi % e != 0:
            break
    n = p * q
    d = pow(e, -1, phi)
    dp = d % (p - 1)
    dq = d % (q - 1)
    qi = pow(q, -1, p)

    # PKCS#1 RSAPrivateKey
    priv_der = _der_seq(
        _der_int(0), _der_int(n), _der_int(e), _der_int(d),
        _der_int(p), _der_int(q), _der_int(dp), _der_int(dq), _der_int(qi),
    )

    # SubjectPublicKeyInfo
    rsa_pub = _der_seq(_der_int(n), _der_int(e))
    spki = _der_seq(
        _der_seq(_der_oid("1.2.840.113549.1.1.1"), b"\x05\x00"),
        _der_bitstr(rsa_pub),
    )

    # Subject / Issuer: CN=ExhibitX Local AR
    name = _der_seq(
        _der_set(_der_seq(_der_oid("2.5.4.3"), _der_utf8("ExhibitX Local AR")))
    )
    now = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=1)
    later = now + datetime.timedelta(days=825)
    validity = _der_seq(_der_utctime(now), _der_utctime(later))

    # Subject Alternative Name (DNS:localhost, IP:127.0.0.1, IP:<lan_ip>)
    san_items = [
        _der_tlv(0x82, b"localhost"),
        _der_tlv(0x87, ipaddress.IPv4Address("127.0.0.1").packed),
    ]
    if lan_ip != "127.0.0.1":
        san_items.append(_der_tlv(0x87, ipaddress.IPv4Address(lan_ip).packed))
    san_ext = _der_seq(_der_oid("2.5.29.17"), _der_octstr(_der_seq(*san_items)))
    bc_ext = _der_seq(_der_oid("2.5.29.19"), b"\x01\x01\xff", _der_octstr(_der_seq()))
    extensions = _der_tlv(0xA3, _der_seq(san_ext, bc_ext))

    sig_alg = _der_seq(_der_oid("1.2.840.113549.1.1.11"), b"\x05\x00")  # sha256WithRSAEncryption
    serial = random.SystemRandom().getrandbits(63) | 1

    tbs = _der_seq(
        _der_tlv(0xA0, _der_int(2)),  # v3
        _der_int(serial),
        sig_alg,
        name,
        validity,
        name,
        spki,
        extensions,
    )
    sig = _rsa_sign_sha256(tbs, n, d)
    cert_der = _der_seq(tbs, sig_alg, _der_bitstr(sig))

    with open(KEY_FILE, "w", encoding="ascii") as f:
        f.write(_to_pem(priv_der, "RSA PRIVATE KEY"))
    with open(CERT_FILE, "w", encoding="ascii") as f:
        f.write(_to_pem(cert_der, "CERTIFICATE"))
    with open(ip_marker, "w", encoding="utf-8") as f:
        f.write(lan_ip)
    print("[ExhibitX] Certificate generated successfully.")


class ExhibitXHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".glb": "model/gltf-binary",
        ".gltf": "model/gltf+json",
        ".js": "application/javascript; charset=utf-8",
        ".mjs": "application/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".svg": "image/svg+xml",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Cross-Origin-Opener-Policy", "same-origin-allow-popups")
        super().end_headers()

    def do_GET(self):
        if self.path.split("?")[0] == "/api/server-info":
            lan_ip = get_lan_ip()
            payload = json.dumps({
                "lanIp": lan_ip,
                "httpUrl": f"http://localhost:{HTTP_PORT}",
                "httpsUrl": f"https://{lan_ip}:{HTTPS_PORT}",
                "httpsLocalUrl": f"https://localhost:{HTTPS_PORT}",
            }).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        super().do_GET()

    def log_message(self, format, *args):
        pass


def main():
    lan_ip = get_lan_ip()
    ensure_self_signed_cert(lan_ip)

    http_server = http.server.ThreadingHTTPServer(("0.0.0.0", HTTP_PORT), ExhibitXHandler)
    https_server = http.server.ThreadingHTTPServer(("0.0.0.0", HTTPS_PORT), ExhibitXHandler)

    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.load_cert_chain(certfile=CERT_FILE, keyfile=KEY_FILE)
    https_server.socket = ctx.wrap_socket(https_server.socket, server_side=True)

    print("================================================================")
    print("  ExhibitX — Real-Life Live Camera AR & 3D Museum (Zero GPS)")
    print(f"  Desktop Webcam URL : http://localhost:{HTTP_PORT}")
    print(f"  Mobile Camera AR   : https://{lan_ip}:{HTTPS_PORT}")
    print("================================================================", flush=True)

    t_http = threading.Thread(target=http_server.serve_forever, daemon=True)
    t_http.start()
    try:
        https_server.serve_forever()
    except KeyboardInterrupt:
        http_server.shutdown()
        https_server.shutdown()


if __name__ == "__main__":
    main()
