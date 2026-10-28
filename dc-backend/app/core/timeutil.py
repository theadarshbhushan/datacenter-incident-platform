"""UTC time helpers. The database stores naive UTC datetimes; the API speaks ISO-8601 with a trailing Z."""
from datetime import datetime, timedelta, timezone
from typing import Optional


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def to_naive_utc(dt: datetime) -> datetime:
    return dt.astimezone(timezone.utc).replace(tzinfo=None) if dt.tzinfo else dt


def iso(dt: Optional[datetime]) -> Optional[str]:
    """Same format as JavaScript's Date.toISOString()."""
    if dt is None:
        return None
    dt = to_naive_utc(dt)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}Z"


def parse_iso(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    return to_naive_utc(datetime.fromisoformat(value.replace("Z", "+00:00")))


def floor_to(dt: datetime, seconds: int) -> datetime:
    epoch = int(dt.replace(tzinfo=timezone.utc).timestamp())
    return datetime.fromtimestamp(epoch - epoch % seconds, tz=timezone.utc).replace(tzinfo=None)


__all__ = ["utcnow", "to_naive_utc", "iso", "parse_iso", "floor_to", "timedelta"]
