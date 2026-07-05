"""Lightweight startup tasks: additive schema migrations + admin provisioning.

`Base.metadata.create_all` creates missing *tables* but never alters existing
ones, so when we add a column to a model we bring the live DB forward here with a
small idempotent `ALTER TABLE`. This works for both SQLite (dev) and PostgreSQL
(prod) without pulling in a full migration tool.
"""
from __future__ import annotations

import logging

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

from .config import settings
from .database import SessionLocal
from .models import User
from .security import hash_password

log = logging.getLogger("bootstrap")


def run_migrations(engine: Engine) -> None:
    """Add columns introduced after a table already exists in the target DB."""
    inspector = inspect(engine)
    if "users" not in inspector.get_table_names():
        return  # fresh DB; create_all already built it with every column

    user_columns = {c["name"] for c in inspector.get_columns("users")}
    false_default = "0" if engine.dialect.name == "sqlite" else "FALSE"
    true_default = "1" if engine.dialect.name == "sqlite" else "TRUE"

    if "is_admin" not in user_columns:
        with engine.begin() as conn:
            conn.execute(text(f"ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT {false_default}"))
        log.info("Migration: added users.is_admin")

    if "show_email" not in user_columns:
        with engine.begin() as conn:
            conn.execute(text(f"ALTER TABLE users ADD COLUMN show_email BOOLEAN NOT NULL DEFAULT {true_default}"))
        log.info("Migration: added users.show_email")

    if "avatar_url" not in user_columns:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE users ADD COLUMN avatar_url TEXT"))
        log.info("Migration: added users.avatar_url")


def ensure_admin() -> None:
    """Create (or update) the admin account from ADMIN_EMAIL / ADMIN_PASSWORD.

    Skipped entirely when ADMIN_PASSWORD is empty, so the secret never has to
    live in source control — set it in the deployment environment instead.
    """
    if not settings.admin_password:
        log.info("ADMIN_PASSWORD not set — skipping admin provisioning")
        return

    db = SessionLocal()
    try:
        admin = db.query(User).filter(User.email == settings.admin_email).first()
        if admin is None:
            admin = User(
                email=settings.admin_email,
                display_name="Administrator",
                hashed_password=hash_password(settings.admin_password),
                avatar_color="#0ea5e9",
                is_verified=True,
                is_admin=True,
            )
            db.add(admin)
            log.info("Provisioned admin user %s", settings.admin_email)
        else:
            # Keep the configured credentials authoritative.
            admin.hashed_password = hash_password(settings.admin_password)
            admin.is_admin = True
            admin.is_verified = True
            log.info("Updated admin user %s", settings.admin_email)
        db.commit()
    finally:
        db.close()
