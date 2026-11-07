#!/usr/bin/env python3
"""Local server for the prototype.

Serves this folder with browser caching switched off, so changes show up on a normal
reload. Works from any directory:

    python3 serve.py          # port 4180
    python3 serve.py 8000     # another port
"""
import contextlib
import http.server
import os
import socket
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 4180
ROOT = os.path.dirname(os.path.abspath(__file__))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


class DualStackServer(http.server.ThreadingHTTPServer):
    """Listens on IPv6 and IPv4, so both localhost and 127.0.0.1 work."""
    address_family = socket.AF_INET6

    def server_bind(self):
        with contextlib.suppress(Exception):
            self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        super().server_bind()


if __name__ == "__main__":
    try:
        server = DualStackServer(("::", PORT), NoCacheHandler)
    except OSError:
        sys.exit(f"Port {PORT} is already in use. Is the server already running in another tab?")
    print(f"Local Tasks is running:\n  web app     http://localhost:{PORT}/\n  mobile app  http://localhost:{PORT}/app.html\nPress Ctrl+C to stop.")
    with server:
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")
