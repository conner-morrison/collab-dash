"""Transactional email via SendGrid.

If SENDGRID_API_KEY and EMAIL_FROM are configured, verification and password
reset emails are delivered through SendGrid. Otherwise the app falls back to
logging the link (development), so the flow still works without email setup.
"""
from __future__ import annotations

import logging

from .config import settings

log = logging.getLogger("mailer")


def _configured() -> bool:
    return bool(settings.sendgrid_api_key and settings.email_from)


def _button_email(heading: str, intro: str, cta_label: str, link: str) -> str:
    """A minimal, brand-styled HTML email with a single call-to-action button."""
    return f"""\
<div style="background:#f1f5f9;padding:32px 0;font-family:Inter,Arial,sans-serif;">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;
              overflow:hidden;border:1px solid #e2e8f0;">
    <div style="background:#4f46e5;padding:20px 24px;color:#fff;font-weight:600;font-size:16px;">
      {settings.app_name}
    </div>
    <div style="padding:28px 24px;color:#0f172a;">
      <h1 style="margin:0 0 12px;font-size:20px;">{heading}</h1>
      <p style="margin:0 0 24px;color:#475569;font-size:14px;line-height:1.6;">{intro}</p>
      <a href="{link}" style="display:inline-block;background:#4f46e5;color:#fff;
         text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:10px;">
        {cta_label}
      </a>
      <p style="margin:24px 0 0;color:#94a3b8;font-size:12px;line-height:1.6;">
        If the button doesn't work, copy this link into your browser:<br>
        <a href="{link}" style="color:#6366f1;word-break:break-all;">{link}</a>
      </p>
    </div>
  </div>
</div>"""


def _send(to: str, subject: str, html: str, *, link: str | None = None) -> None:
    if not _configured():
        # Dev fallback: log the link so the flow is still testable without SendGrid.
        log.info("[email:stub] to=%s subject=%s link=%s", to, subject, link)
        return
    try:
        from sendgrid import SendGridAPIClient
        from sendgrid.helpers.mail import Mail

        message = Mail(
            from_email=(settings.email_from, settings.email_from_name),
            to_emails=to,
            subject=subject,
            html_content=html,
        )
        response = SendGridAPIClient(settings.sendgrid_api_key).send(message)
        log.info("Sent '%s' to %s (SendGrid status %s)", subject, to, response.status_code)
    except Exception as exc:  # never let email failure break the request flow
        log.error("Failed to send email to %s: %s", to, exc)


def send_verification_email(to: str, token: str) -> None:
    link = f"{settings.frontend_origin}/verify?token={token}"
    html = _button_email(
        "Verify your email",
        f"Welcome to {settings.app_name}! Confirm your email address to activate your account.",
        "Verify email",
        link,
    )
    _send(to, f"Verify your email · {settings.app_name}", html, link=link)


def send_reset_email(to: str, token: str) -> None:
    link = f"{settings.frontend_origin}/reset-password?token={token}"
    html = _button_email(
        "Reset your password",
        "We received a request to reset your password. This link expires in 1 hour. "
        "If you didn't request it, you can safely ignore this email.",
        "Reset password",
        link,
    )
    _send(to, f"Reset your password · {settings.app_name}", html, link=link)
