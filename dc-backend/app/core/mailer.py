import asyncio
import smtplib
from email.message import EmailMessage

from loguru import logger

from app.core.config import settings


def _send_smtp(to: str, subject: str, body: str) -> None:
    msg = EmailMessage()
    msg["From"] = settings.EMAIL_FROM
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as s:
        if settings.SMTP_STARTTLS:
            s.starttls()
        if settings.SMTP_USER:
            s.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        s.send_message(msg)


async def send_email(to: str, subject: str, body: str, link: str | None = None) -> bool:
    """
    Returns True only when the message was handed to a real mail server.
    With the console backend nothing is delivered: the message is logged (without the secret link
    outside development) and, in development, stored for the developer mailbox.
    """
    full_link = f"{settings.FRONTEND_URL.rstrip('/')}{link}" if link else None
    text = body + (f"\n\n{full_link}" if full_link else "")
    if settings.EMAIL_BACKEND == "smtp" and settings.SMTP_HOST:
        try:
            await asyncio.to_thread(_send_smtp, to, subject, text)
            return True
        except Exception as e:  # never leak SMTP details to clients
            logger.error(f"SMTP delivery failed to {to}: {e}")
            return False
    if settings.is_development:
        from app.models.account import DevMail

        await DevMail(to=to, subject=subject, body=body, link=link or "").insert()
        logger.info(f"[console email] to={to} subject={subject!r} link={full_link}")
    else:
        logger.warning(f"[console email] EMAIL_BACKEND is not configured; message to {to} ({subject!r}) was not sent")
    return False
