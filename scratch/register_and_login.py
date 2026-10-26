"""
Manual smoke test of the VaultWatch auth API (development only).

The API uses an HttpOnly session cookie plus a CSRF token, so a requests.Session is used to keep
cookies, and every write sends the X-CSRF-Token header. Signup never signs you in: verify the
email first (in development the link is listed at GET /api/v1/dev/mail).

    python scratch/register_and_login.py you@example.com 'A-strong-passw0rd'
"""
import sys

import requests

API = "http://localhost:8000/api/v1"
email, password = sys.argv[1], sys.argv[2]

s = requests.Session()
csrf = s.get(f"{API}/auth/csrf").json()["data"]["csrfToken"]
h = {"X-CSRF-Token": csrf}

r = s.post(f"{API}/auth/signup", json={"name": "Smoke Test", "email": email, "company": "Smoke Test Org", "password": password}, headers=h)
print("signup:", r.status_code, r.json().get("message"))

mail = s.get(f"{API}/dev/mail").json().get("data") or []
link = next((m["link"] for m in mail if m["to"] == email.lower() and "/verify-email" in m["link"]), None)
if link:
    token = link.split("token=", 1)[1]
    print("verify:", s.post(f"{API}/auth/email/verify", json={"token": token}, headers=h).json()["data"])

r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, headers=h)
print("login:", r.status_code, r.json().get("message"))
if r.ok:
    print("session:", s.get(f"{API}/auth/session").json()["data"]["user"])
