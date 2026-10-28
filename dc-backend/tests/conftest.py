"""
Tests run against an in-memory MongoDB (mongomock-motor), so no services are needed:

    pip install -r requirements-dev.txt
    pytest
"""
import os
import re

os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("SECRET_KEY", "test-secret-key-that-is-long-enough-1234567890")
os.environ.setdefault("CORS_ORIGINS", "http://localhost:5173")
os.environ.setdefault("EMAIL_BACKEND", "console")
os.environ.setdefault("RUN_MIGRATIONS_ON_STARTUP", "false")
os.environ.setdefault("DEMO_SEED_HOURS", "5")  # the in-memory test database checks unique indexes row by row

import pytest  # noqa: E402
from beanie import init_beanie  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from mongomock_motor import AsyncMongoMockClient  # noqa: E402

from app.core import ratelimit  # noqa: E402
from app.main import app  # noqa: E402
from app.ml.inference import registry  # noqa: E402
from app.models import ALL_MODELS  # noqa: E402
from app.models.account import DevMail  # noqa: E402
from app.models.monitoring import TelemetryBucket, TelemetryPoint  # noqa: E402

PASSWORD = "Correct-Horse-42"

# mongomock lacks a few keyword arguments Beanie passes for the time-series metrics collection.
import mongomock  # noqa: E402

TelemetryPoint.Settings.timeseries = None  # mongomock has no time-series collections; MongoDB still uses them
# mongomock checks unique indexes and TTL expiry by scanning every document on every write, which makes
# bulk telemetry inserts quadratic. Real MongoDB uses the indexes; tests skip them for the bucket rollups.
TelemetryBucket.Settings.indexes = []
mongomock.store.CollectionStore._remove_expired_documents = lambda self: None

_list_names = mongomock.database.Database.list_collection_names
_create = mongomock.database.Database.create_collection
mongomock.database.Database.list_collection_names = lambda self, *a, **kw: _list_names(self)
mongomock.database.Database.create_collection = lambda self, name, **kw: _create(self, name)


@pytest.fixture(autouse=True)
async def db():
    client = AsyncMongoMockClient()
    await init_beanie(database=client["vaultwatch_test"], document_models=ALL_MODELS)
    ratelimit.reset_all()
    if not registry.ready:
        registry.load()  # the real artifact in app/ml/artifacts, loaded once per test session
    yield


class Browser:
    """A cookie-keeping client that behaves like the SPA: fetches a CSRF token and sends it on writes."""

    def __init__(self, client: AsyncClient):
        self.c = client
        self.csrf = None

    async def token(self):
        r = await self.c.get("/api/v1/auth/csrf")
        self.csrf = r.json()["data"]["csrfToken"]
        return self.csrf

    async def req(self, method: str, path: str, json=None, **kw):
        headers = kw.pop("headers", {})
        if method != "GET":
            headers.setdefault("X-CSRF-Token", self.csrf or await self.token())
        r = await self.c.request(method, f"/api/v1{path}", json=json, headers=headers, **kw)
        if r.status_code == 403 and r.json().get("code") == "csrf_failed" and "X-CSRF-Token" in headers:
            headers["X-CSRF-Token"] = await self.token()
            r = await self.c.request(method, f"/api/v1{path}", json=json, headers=headers, **kw)
        return r

    async def get(self, path, **kw):
        return await self.req("GET", path, **kw)

    async def post(self, path, json=None, **kw):
        return await self.req("POST", path, json if json is not None else {}, **kw)

    async def put(self, path, json=None, **kw):
        return await self.req("PUT", path, json, **kw)

    async def patch(self, path, json=None, **kw):
        return await self.req("PATCH", path, json, **kw)

    async def delete(self, path, **kw):
        return await self.req("DELETE", path, **kw)


@pytest.fixture
async def make_browser():
    clients = []

    async def factory() -> Browser:
        c = AsyncClient(transport=ASGITransport(app=app), base_url="https://testserver")
        clients.append(c)
        return Browser(c)

    yield factory
    for c in clients:
        await c.aclose()


@pytest.fixture
async def browser(make_browser):
    return await make_browser()


async def last_link(to: str, contains: str = "") -> str:
    mails = await DevMail.find(DevMail.to == to.lower()).sort("-created_at").to_list()
    for m in mails:
        if contains in m.link:
            return m.link
    raise AssertionError(f"no mail to {to} with {contains!r}")


def token_from(link: str) -> str:
    return re.search(r"token=([^&]+)", link).group(1)


async def signup_verified(b: Browser, email: str, company: str = "Acme", name: str = "Ada Owner") -> dict:
    r = await b.post("/auth/signup", {"name": name, "email": email, "company": company, "password": PASSWORD})
    assert r.status_code == 200, r.text
    link = await last_link(email, "/verify-email")
    r = await b.post("/auth/email/verify", {"token": token_from(link)})
    assert r.json()["data"]["result"] == "verified"
    r = await b.post("/auth/login", {"email": email, "password": PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["data"]
