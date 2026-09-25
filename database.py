import os
import json
from datetime import datetime, time, timedelta, timezone
from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime, Boolean, desc
from sqlalchemy.orm import declarative_base, sessionmaker, scoped_session

def get_now_ist():
    """Return current datetime in Indian Standard Time (IST) as naive datetime for universal DB compatibility."""
    return datetime.utcnow() + timedelta(hours=5, minutes=30)

# Database Configuration
# Works seamlessly locally with SQLite, or on Render with PostgreSQL via DATABASE_URL
DATABASE_URL = os.environ.get("DATABASE_URL")
if DATABASE_URL:
    # Render provides postgres:// which SQLAlchemy 1.4+ expects as postgresql://
    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
else:
    # Default to local SQLite database file
    db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "madras_biryani.db")
    DATABASE_URL = f"sqlite:///{db_path}"

engine = create_engine(
    DATABASE_URL,
    echo=False,
    # SQLite specific connect args
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {}
)

SessionLocal = scoped_session(sessionmaker(autocommit=False, autoflush=False, bind=engine))
Base = declarative_base()


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    order_code = Column(String(20), unique=True, index=True)  # e.g., MB-1001
    customer_name = Column(String(100), nullable=False)
    phone = Column(String(20), nullable=False)
    hostel = Column(String(100), nullable=False)
    room_number = Column(String(50), nullable=True, default="")
    quantity = Column(Integer, default=1, nullable=False)
    unit_price = Column(Integer, default=150, nullable=False)
    total_price = Column(Integer, default=150, nullable=False)
    notes = Column(Text, nullable=True)
    payment_method = Column(String(50), default="Cash / UPI on Delivery")
    status = Column(String(20), default="pending")  # pending, preparing, out_for_delivery, completed, cancelled
    created_at = Column(DateTime, default=get_now_ist)
    completed_at = Column(DateTime, nullable=True)

    def to_dict(self):
        created_str = self.created_at.strftime("%I:%M %p, %d %b %Y") if self.created_at else ""
        completed_str = self.completed_at.strftime("%I:%M %p, %d %b %Y") if self.completed_at else ""
        return {
            "id": self.id,
            "order_code": self.order_code,
            "customer_name": self.customer_name,
            "phone": self.phone,
            "hostel": self.hostel,
            "room_number": self.room_number,
            "quantity": self.quantity,
            "unit_price": self.unit_price,
            "total_price": self.total_price,
            "notes": self.notes or "",
            "payment_method": self.payment_method,
            "status": self.status,
            "created_at": created_str,
            "created_at_raw": self.created_at.isoformat() if self.created_at else "",
            "completed_at": completed_str,
        }


class Setting(Base):
    __tablename__ = "settings"

    key = Column(String(50), primary_key=True)
    value = Column(Text, nullable=False)


# Initialize Database Tables & Default Settings
def init_db():
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    try:
        # Default settings if not already present
        default_settings = {
            "is_shop_open_manual": "true",        # Team can manually close anytime
            "opening_time": "19:00",               # 7:00 PM (24h format)
            "closing_time": "01:00",               # 1:00 AM (past midnight)
            "item_name": "Signature Chicken Dum Biryani",
            "item_weight": "500g",
            "item_price": "150",
            "admin_pin": "1234",
            "shop_phone": "9876543210",
            "custom_banner": "🔥 Authentic Madras Dum Biryani • Served hot with boiled egg, raita & salan!",
            "hostels": json.dumps([
                "BH-1",
                "BH-2",
                "BH-3",
                "BH-4",
                "BH-5",
                "BH-6",
                "BH-7",
                "BH-8",
                "GH-1",
                "GH-2",
                "GH-3",
                "GH-4",
                "GH-5",
                "GH-6",
                "GH-7",
                "GH-8",
                "GH-9",
                "GH-10",
                "Maharana Pratap Hostel",
                "Other"
            ])
        }

        for key, val in default_settings.items():
            existing = session.query(Setting).filter_by(key=key).first()
            if not existing:
                session.add(Setting(key=key, value=val))
        session.commit()
    finally:
        session.close()


def get_setting(key, default=None):
    session = SessionLocal()
    try:
        item = session.query(Setting).filter_by(key=key).first()
        return item.value if item else default
    finally:
        session.close()


def set_setting(key, value):
    session = SessionLocal()
    try:
        item = session.query(Setting).filter_by(key=key).first()
        if item:
            item.value = str(value)
        else:
            item = Setting(key=key, value=str(value))
            session.add(item)
        session.commit()
        return True
    finally:
        session.close()


def is_time_between(now_time, start_time, end_time):
    """
    Check if now_time is within start_time and end_time.
    Supports overnight schedules e.g., 19:00 (7 PM) to 01:00 (1 AM).
    """
    if start_time <= end_time:
        return start_time <= now_time <= end_time
    else:
        # Crosses midnight (e.g. 19:00 to 01:00)
        return now_time >= start_time or now_time <= end_time


def check_shop_status():
    """
    Determines if shop is currently open taking both manual override and timings into account.
    """
    manual_open = get_setting("is_shop_open_manual", "true").lower() == "true"
    open_str = get_setting("opening_time", "19:00")
    close_str = get_setting("closing_time", "01:00")
    banner = get_setting("custom_banner", "")

    # Format human readable times (e.g. 7:00 PM - 1:00 AM)
    def to_ampm(time_str):
        try:
            t = datetime.strptime(time_str, "%H:%M")
            return t.strftime("%I:%M %p").lstrip("0")
        except Exception:
            return time_str

    timing_display = f"{to_ampm(open_str)} – {to_ampm(close_str)}"

    if not manual_open:
        return {
            "is_open": False,
            "reason": "manually_closed",
            "message": "We are currently closed for orders. Please check back later!",
            "opening_time": open_str,
            "closing_time": close_str,
            "timing_display": timing_display,
            "manual_open": False,
            "banner": banner
        }

    # Check operational hours in IST
    now = get_now_ist().time()
    try:
        start_parts = [int(p) for p in open_str.split(":")]
        end_parts = [int(p) for p in close_str.split(":")]
        start_t = time(start_parts[0], start_parts[1])
        end_t = time(end_parts[0], end_parts[1])
        within_hours = is_time_between(now, start_t, end_t)
    except Exception:
        within_hours = True

    if not within_hours:
        return {
            "is_open": False,
            "reason": "outside_hours",
            "message": f"Online ordering is closed right now. We take orders from {timing_display}.",
            "opening_time": open_str,
            "closing_time": close_str,
            "timing_display": timing_display,
            "manual_open": True,
            "banner": banner
        }

    return {
        "is_open": True,
        "reason": "open",
        "message": f"Taking orders right now! Open {timing_display}.",
        "opening_time": open_str,
        "closing_time": close_str,
        "timing_display": timing_display,
        "manual_open": True,
        "banner": banner
    }


def generate_order_code(session):
    """Generate friendly sequential order code like MB-1001."""
    count = session.query(Order).count()
    return f"MB-{1000 + count + 1}"
