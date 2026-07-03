"""Seed the database with demo users, a friendship, and sample content.

Run from the backend/ directory:  python seed.py
Creates two verified demo accounts you can log in with immediately:

    alice@demo.dev / password123
    bob@demo.dev   / password123
"""
from __future__ import annotations

from datetime import date, timedelta

from app.database import Base, SessionLocal, engine
from app.models import Message, Schedule, StickyNote, User
from app.security import hash_password
from app.services import create_friendship


def run() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if db.query(User).filter(User.email == "alice@demo.dev").first():
            print("Demo data already present. Skipping.")
            return

        alice = User(
            email="alice@demo.dev",
            display_name="Alice Rivera",
            hashed_password=hash_password("password123"),
            avatar_color="#6366f1",
            is_verified=True,
        )
        bob = User(
            email="bob@demo.dev",
            display_name="Bob Nguyen",
            hashed_password=hash_password("password123"),
            avatar_color="#ec4899",
            is_verified=True,
        )
        db.add_all([alice, bob])
        db.flush()

        friendship = create_friendship(db, alice.id, bob.id)
        dashboard = friendship.dashboard

        db.add_all(
            [
                Message(friendship_id=friendship.id, sender_id=alice.id, body="Hey Bob! Set up our shared board 🎉", is_read=True),
                Message(friendship_id=friendship.id, sender_id=bob.id, body="Awesome — added a couple sticky notes.", is_read=True),
            ]
        )

        db.add_all(
            [
                StickyNote(dashboard_id=dashboard.id, author_id=alice.id, content="Kickoff call agenda ✅", color="#fde68a", pos_x=60, pos_y=60),
                StickyNote(dashboard_id=dashboard.id, author_id=bob.id, content="Send invoice to Acme Corp", color="#bbf7d0", pos_x=320, pos_y=120),
                StickyNote(dashboard_id=dashboard.id, author_id=alice.id, content="Design review Friday", color="#fecaca", pos_x=180, pos_y=260),
            ]
        )

        today = date.today()
        db.add_all(
            [
                Schedule(dashboard_id=dashboard.id, author_id=alice.id, date=today.isoformat(), time="09:30", client="Acme Corp", task="Kickoff call", status="done"),
                Schedule(dashboard_id=dashboard.id, author_id=bob.id, date=today.isoformat(), time="14:00", client="Globex", task="Requirements review", status="in_progress"),
                Schedule(dashboard_id=dashboard.id, author_id=alice.id, date=(today + timedelta(days=1)).isoformat(), time="11:00", client="Acme Corp", task="Design handoff", status="planned"),
                Schedule(dashboard_id=dashboard.id, author_id=bob.id, date=(today + timedelta(days=2)).isoformat(), time="16:30", client="Initech", task="Demo prep", status="planned"),
            ]
        )

        db.commit()
        print("Seeded demo data.")
        print("  alice@demo.dev / password123")
        print("  bob@demo.dev   / password123")
    finally:
        db.close()


if __name__ == "__main__":
    run()
