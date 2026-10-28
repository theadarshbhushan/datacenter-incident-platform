"""
Sliding-window rate limiter.

In-memory and per process: correct for a single uvicorn worker and for development. For several
workers or hosts, move the store to a shared backend such as Redis so limits are shared.
"""
import math
import time
from collections import defaultdict, deque
from typing import Deque, Dict

from app.core.errors import ApiException

_hits: Dict[str, Deque[float]] = defaultdict(deque)


def _window(key: str, window_s: float) -> Deque[float]:
    now = time.monotonic()
    q = _hits[key]
    while q and now - q[0] > window_s:
        q.popleft()
    return q


def hit(key: str, limit: int, window_s: float, message: str = "Too many attempts.") -> None:
    """Record an attempt and raise 429 if the limit is exceeded."""
    q = _window(key, window_s)
    if len(q) >= limit:
        retry = max(1, math.ceil((window_s - (time.monotonic() - q[0])) / 60))
        raise ApiException(429, f"{message} Try again in {retry} minute{'s' if retry != 1 else ''}.", "rate_limited")
    q.append(time.monotonic())


def check(key: str, limit: int, window_s: float, message: str) -> None:
    """Raise 429 if the key is already at its limit, without recording an attempt."""
    if len(_window(key, window_s)) >= limit:
        raise ApiException(429, message, "rate_limited")


def record(key: str, window_s: float) -> None:
    _window(key, window_s).append(time.monotonic())


def clear(key: str) -> None:
    _hits.pop(key, None)


def reset_all() -> None:
    _hits.clear()
