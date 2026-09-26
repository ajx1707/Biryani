import os
import shutil
import csv
import json
import io
import time
import threading
import urllib.request
import urllib.error
from functools import wraps
from datetime import datetime, timedelta
from flask import Flask, render_template, request, jsonify, send_file, Response, redirect, url_for, session
from database import (
    init_db, SessionLocal, Order, Setting,
    get_setting, set_setting, check_shop_status,
    get_now_ist, generate_order_code,
    verify_admin_password, get_admin_password
)

# Initialize Flask application
app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "madras-biryani-campus-secret-key-2025")

# Ensure static directories and assets are ready
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_IMG_DIR = os.path.join(BASE_DIR, "static", "images")
os.makedirs(STATIC_IMG_DIR, exist_ok=True)

# Auto-copy provided assets to static/images/ if in root
for img_name in ["logo.jpeg", "chicken.png"]:
    src = os.path.join(BASE_DIR, img_name)
    dst = os.path.join(STATIC_IMG_DIR, img_name)
    if os.path.exists(src) and not os.path.exists(dst):
        try:
            shutil.copy(src, dst)
        except Exception as e:
            print(f"Notice: could not copy {img_name}: {e}")

def get_logo_bg_color():
    """Sample exact background color from logo.jpeg for 100% seamless blending."""
    for img_path in [
        os.path.join(STATIC_IMG_DIR, "logo.jpeg"),
        os.path.join(BASE_DIR, "logo.jpeg")
    ]:
        if os.path.exists(img_path):
            try:
                from PIL import Image
                with Image.open(img_path) as im:
                    rgb_im = im.convert("RGB")
                    # Sample corner pixel
                    pixel = rgb_im.getpixel((10, 10))
                    return f"#{pixel[0]:02x}{pixel[1]:02x}{pixel[2]:02x}"
            except Exception as e:
                print(f"Notice: could not sample logo color: {e}")
    return "#804318"

LOGO_BG_COLOR = get_logo_bg_color()

# Initialize database tables and default values
init_db()


# -------------------------------------------------------------
# Customer Facing Routes
# -------------------------------------------------------------

@app.route("/")
def index():
    """Customer ordering page."""
    status_info = check_shop_status()
    DEFAULT_CAMPUS_HOSTELS = [
        "BH-1", "BH-2", "BH-3", "BH-4", "BH-5", "BH-6", "BH-7", "BH-8",
        "GH-1", "GH-2", "GH-3", "GH-4", "GH-5", "GH-6", "GH-7", "GH-8", "GH-9", "GH-10",
        "Maharana Pratap Hostel", "Other"
    ]
    try:
        raw_hostels = get_setting("hostels", "[]")
        hostels = json.loads(raw_hostels)
        # Update if empty or still containing old default names (e.g. Krishna Hostel or Brahmaputra)
        if not hostels or "BH-1" not in hostels:
            hostels = DEFAULT_CAMPUS_HOSTELS
            set_setting("hostels", json.dumps(DEFAULT_CAMPUS_HOSTELS))
    except Exception:
        hostels = DEFAULT_CAMPUS_HOSTELS

    item_name = get_setting("item_name", "Signature Chicken Dum Biryani")
    item_weight = get_setting("item_weight", "500g")
    item_price = int(get_setting("item_price", 150))
    shop_phone = get_setting("shop_phone", "9876543210")
    banner = get_setting("custom_banner", "🔥 Authentic Madras Dum Biryani • Served hot with boiled egg, raita & salan!")

    return render_template(
        "index.html",
        logo_bg_color=LOGO_BG_COLOR,
        status=status_info,
        hostels=hostels,
        item_name=item_name,
        item_weight=item_weight,
        item_price=item_price,
        shop_phone=shop_phone,
        banner=banner
    )


@app.route("/logo.jpeg")
def serve_root_logo():
    """Direct route for logo image."""
    return send_file(os.path.join(BASE_DIR, "logo.jpeg"), mimetype="image/jpeg")


@app.route("/chicken.png")
def serve_root_chicken():
    """Direct route for biryani image."""
    return send_file(os.path.join(BASE_DIR, "chicken.png"), mimetype="image/png")


@app.route("/ping")
@app.route("/health")
def ping_keep_alive():
    """Ultra-lightweight keep-alive endpoint for cron pings and self-checks."""
    return jsonify({
        "status": "healthy",
        "service": "the-madras-biryani",
        "timestamp": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
    }), 200


def _start_self_keep_alive():
    """
    Layer 1: Built-in Internal Self-KeepAlive (Zero Risk of Blocking)
    Runs in a background daemon thread on Render. Every 9 minutes, it pings its
    own public URL with a real Google Chrome User-Agent.
    Because the ping originates directly from Render's own IP back to its own domain,
    Cloudflare considers it 100% trusted internal traffic and never blocks it.
    """
    external_url = os.environ.get("RENDER_EXTERNAL_URL") or os.environ.get("APP_URL")
    if not external_url:
        print("[KeepAlive] Notice: RENDER_EXTERNAL_URL not set (running locally). Self-ping skipped.")
        return

    health_url = f"{external_url.rstrip('/')}/health"
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept": "application/json, text/html, */*",
    }

    def ping_loop():
        # Wait 30 seconds after server boot before initial ping
        time.sleep(30)
        print(f"[KeepAlive] Self-ping background daemon started. Target: {health_url}")
        while True:
            try:
                req = urllib.request.Request(health_url, headers=headers)
                with urllib.request.urlopen(req, timeout=25) as resp:
                    print(f"[KeepAlive] Internal self-ping SUCCESS (HTTP {resp.getcode()}) at {datetime.utcnow().strftime('%H:%M:%S UTC')}")
            except Exception as e:
                print(f"[KeepAlive] Internal self-ping notice: {e}")

            # Sleep 9 minutes (540 seconds) — safely under Render's 15-minute inactivity idle timer
            time.sleep(540)

    t = threading.Thread(target=ping_loop, daemon=True, name="RenderSelfKeepAliveThread")
    t.start()


# Launch internal self-keepalive on startup
_start_self_keep_alive()


@app.route("/api/shop-status", methods=["GET"])
def get_shop_status():
    """Return real-time shop status (open/closed, hours, message)."""
    return jsonify(check_shop_status())


@app.route("/api/order", methods=["POST"])
def place_order():
    """Handle new customer order submission."""
    status_info = check_shop_status()
    if not status_info["is_open"]:
        return jsonify({
            "success": False,
            "error": status_info["message"] or "Shop is currently closed for orders."
        }), 400

    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    phone = (data.get("phone") or "").strip()
    hostel = (data.get("hostel") or "").strip()
    room_number = (data.get("room") or "").strip()
    notes = (data.get("notes") or "").strip()

    try:
        quantity = int(data.get("quantity", 1))
        if quantity < 1:
            quantity = 1
    except (ValueError, TypeError):
        quantity = 1

    # Validation
    if not name:
        return jsonify({"success": False, "error": "Please enter your name."}), 400
    if not phone or len(phone) < 10:
        return jsonify({"success": False, "error": "Please provide a valid 10-digit mobile number."}), 400
    if not hostel:
        return jsonify({"success": False, "error": "Please select your hostel from the dropdown."}), 400

    unit_price = int(get_setting("item_price", 150))
    total_price = quantity * unit_price

    db = SessionLocal()
    try:
        code = generate_order_code(db)
        new_order = Order(
            order_code=code,
            customer_name=name,
            phone=phone,
            hostel=hostel,
            room_number=room_number,
            quantity=quantity,
            unit_price=unit_price,
            total_price=total_price,
            notes=notes,
            payment_method="Cash / UPI on Delivery",
            status="pending",
            created_at=get_now_ist()
        )
        db.add(new_order)
        db.commit()
        db.refresh(new_order)
        order_dict = new_order.to_dict()
        return jsonify({
            "success": True,
            "message": "Order placed successfully!",
            "order": order_dict
        })
    except Exception as e:
        db.rollback()
        return jsonify({"success": False, "error": f"Failed to place order: {str(e)}"}), 500
    finally:
        db.close()


@app.route("/receipt/<order_code>")
def view_receipt(order_code):
    """View receipt page for printing or mobile download."""
    db = SessionLocal()
    try:
        order = db.query(Order).filter_by(order_code=order_code).first()
        if not order:
            return "Order not found", 404
        shop_phone = get_setting("shop_phone", "9876543210")
        item_name = get_setting("item_name", "Signature Chicken Dum Biryani")
        item_weight = get_setting("item_weight", "500g")
        return render_template(
            "receipt.html",
            order=order.to_dict(),
            shop_phone=shop_phone,
            item_name=item_name,
            item_weight=item_weight
        )
    finally:
        db.close()


@app.route("/api/order/<order_code>")
def get_order_by_code(order_code):
    """Get single order JSON for receipt generator modal."""
    db = SessionLocal()
    try:
        order = db.query(Order).filter_by(order_code=order_code).first()
        if not order:
            return jsonify({"success": False, "error": "Order not found"}), 404
        return jsonify({"success": True, "order": order.to_dict()})
    finally:
        db.close()


# -------------------------------------------------------------
# Admin Authentication & Team Operations Routes
# -------------------------------------------------------------

def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get("admin_logged_in"):
            return jsonify({"success": False, "error": "Unauthorized. Please log in to admin console."}), 401
        return f(*args, **kwargs)
    return decorated_function


@app.route("/admin")
def admin_page():
    """Admin portal dashboard - requires login."""
    if not session.get("admin_logged_in"):
        return render_template("admin_login.html")
    return render_template("admin.html")


@app.route("/api/admin/login", methods=["POST"])
def admin_login():
    """Verify admin password and create session."""
    data = request.get_json() or {}
    password = str(data.get("password", "")).strip()

    if verify_admin_password(password):
        session["admin_logged_in"] = True
        session.permanent = True
        return jsonify({"success": True})
    return jsonify({"success": False, "error": "Incorrect password. Access denied."}), 401


@app.route("/admin/logout")
@app.route("/api/admin/logout", methods=["GET", "POST"])
def admin_logout():
    """Log out admin console session."""
    session.pop("admin_logged_in", None)
    return redirect(url_for("admin_page"))


@app.route("/api/admin/change-password", methods=["POST"])
@admin_required
def admin_change_password():
    """Change admin password in database."""
    data = request.get_json() or {}
    current_pass = str(data.get("current_password", "")).strip()
    new_pass = str(data.get("new_password", "")).strip()

    if not verify_admin_password(current_pass):
        return jsonify({"success": False, "error": "Current password is incorrect."}), 400

    if len(new_pass) < 4:
        return jsonify({"success": False, "error": "New password must be at least 4 characters long."}), 400

    set_setting("admin_password", new_pass)
    return jsonify({"success": True, "message": "Password updated successfully!"})


@app.route("/api/admin/orders/active", methods=["GET"])
@admin_required
def get_active_orders():
    """Get live pending & in-progress orders."""
    db = SessionLocal()
    try:
        orders = (
            db.query(Order)
            .filter(Order.status.in_(["pending", "preparing", "out_for_delivery"]))
            .order_by(Order.id.desc())
            .all()
        )
        return jsonify({"success": True, "orders": [o.to_dict() for o in orders]})
    finally:
        db.close()


@app.route("/api/admin/orders/completed-today", methods=["GET"])
@admin_required
def get_completed_today():
    """
    Get all orders marked completed TODAY (IST calendar day).
    At midnight, this automatically resets/empties for the next day.
    """
    now_ist = get_now_ist()
    # Today starts at 00:00:00 IST
    today_start = datetime(now_ist.year, now_ist.month, now_ist.day, 0, 0, 0)
    today_end = datetime(now_ist.year, now_ist.month, now_ist.day, 23, 59, 59)

    db = SessionLocal()
    try:
        orders = (
            db.query(Order)
            .filter(
                Order.status == "completed",
                Order.completed_at >= today_start,
                Order.completed_at <= today_end
            )
            .order_by(Order.completed_at.desc())
            .all()
        )

        today_revenue = sum(o.total_price for o in orders)
        today_count = len(orders)
        today_portions = sum(o.quantity for o in orders)

        return jsonify({
            "success": True,
            "date": now_ist.strftime("%d %B %Y"),
            "revenue": today_revenue,
            "orders_count": today_count,
            "portions_count": today_portions,
            "orders": [o.to_dict() for o in orders]
        })
    finally:
        db.close()


@app.route("/api/admin/orders/all", methods=["GET"])
@admin_required
def get_all_orders():
    """
    Get all orders with filter options:
    filter = 'today' | 'week' | 'month' | 'all'
    """
    filter_type = request.args.get("filter", "all").lower()
    search = request.args.get("search", "").strip().lower()

    now_ist = get_now_ist()
    db = SessionLocal()
    try:
        query = db.query(Order)

        if filter_type == "today":
            today_start = datetime(now_ist.year, now_ist.month, now_ist.day, 0, 0, 0)
            query = query.filter(Order.created_at >= today_start)
        elif filter_type == "week":
            # Last 7 days
            week_start = datetime(now_ist.year, now_ist.month, now_ist.day, 0, 0, 0) - timedelta(days=7)
            query = query.filter(Order.created_at >= week_start)
        elif filter_type == "month":
            # Current calendar month start
            month_start = datetime(now_ist.year, now_ist.month, 1, 0, 0, 0)
            query = query.filter(Order.created_at >= month_start)

        orders = query.order_by(Order.id.desc()).all()

        # Apply search if provided
        filtered = []
        for o in orders:
            if search:
                matched = (
                    search in (o.order_code or "").lower() or
                    search in (o.customer_name or "").lower() or
                    search in (o.phone or "").lower() or
                    search in (o.hostel or "").lower() or
                    search in (o.room_number or "").lower()
                )
                if not matched:
                    continue
            filtered.append(o)

        total_rev = sum(o.total_price for o in filtered if o.status == "completed")
        total_orders = len(filtered)
        total_qty = sum(o.quantity for o in filtered)
        aov = round(total_rev / total_orders, 1) if total_orders > 0 else 0

        return jsonify({
            "success": True,
            "filter": filter_type,
            "total_revenue": total_rev,
            "total_orders": total_orders,
            "total_portions": total_qty,
            "aov": aov,
            "orders": [o.to_dict() for o in filtered]
        })
    finally:
        db.close()


@app.route("/api/admin/orders/<int:order_id>/status", methods=["POST"])
@admin_required
def update_order_status(order_id):
    """Update order status (e.g., mark as completed, cancelled)."""
    data = request.get_json() or {}
    new_status = data.get("status")
    if not new_status:
        return jsonify({"success": False, "error": "Status is required"}), 400

    db = SessionLocal()
    try:
        order = db.query(Order).filter_by(id=order_id).first()
        if not order:
            return jsonify({"success": False, "error": "Order not found"}), 404

        order.status = new_status
        if new_status == "completed":
            order.completed_at = get_now_ist()
        elif new_status == "pending":
            order.completed_at = None

        db.commit()
        return jsonify({"success": True, "order": order.to_dict()})
    except Exception as e:
        db.rollback()
        return jsonify({"success": False, "error": str(e)}), 500
    finally:
        db.close()


@app.route("/api/admin/settings", methods=["GET", "POST"])
@admin_required
def admin_settings():
    """Get or update shop settings & operational hours."""
    if request.method == "POST":
        data = request.get_json() or {}

        if "is_shop_open_manual" in data:
            set_setting("is_shop_open_manual", "true" if data["is_shop_open_manual"] else "false")
        if "opening_time" in data:
            set_setting("opening_time", data["opening_time"])
        if "closing_time" in data:
            set_setting("closing_time", data["closing_time"])
        if "item_price" in data:
            try:
                price = int(data["item_price"])
                set_setting("item_price", price)
            except ValueError:
                pass
        if "custom_banner" in data:
            set_setting("custom_banner", data["custom_banner"].strip())
        if "shop_phone" in data:
            set_setting("shop_phone", data["shop_phone"].strip())
        if "admin_pin" in data and data["admin_pin"]:
            set_setting("admin_pin", str(data["admin_pin"]).strip())
        if "hostels" in data and isinstance(data["hostels"], list):
            set_setting("hostels", json.dumps(data["hostels"]))

        return jsonify({
            "success": True,
            "message": "Settings updated successfully!",
            "status": check_shop_status()
        })

    # GET settings
    try:
        hostels = json.loads(get_setting("hostels", "[]"))
    except Exception:
        hostels = []

    return jsonify({
        "success": True,
        "is_shop_open_manual": get_setting("is_shop_open_manual", "true").lower() == "true",
        "opening_time": get_setting("opening_time", "19:00"),
        "closing_time": get_setting("closing_time", "01:00"),
        "item_name": get_setting("item_name", "Signature Chicken Dum Biryani"),
        "item_weight": get_setting("item_weight", "500g"),
        "item_price": int(get_setting("item_price", 150)),
        "shop_phone": get_setting("shop_phone", "9876543210"),
        "custom_banner": get_setting("custom_banner", ""),
        "hostels": hostels,
        "status": check_shop_status()
    })


@app.route("/api/admin/export-csv")
@admin_required
def export_csv():
    """Download clean CSV of all orders."""
    db = SessionLocal()
    try:
        orders = db.query(Order).order_by(Order.id.desc()).all()
        si = io.StringIO()
        writer = csv.writer(si)
        writer.writerow([
            "Order ID", "Date Placed", "Customer Name", "Phone",
            "Hostel", "Room / Block", "Quantity (500g)", "Unit Price (INR)",
            "Total Price (INR)", "Payment Method", "Status", "Notes", "Completed Time"
        ])
        for o in orders:
            writer.writerow([
                o.order_code,
                o.created_at.strftime("%Y-%m-%d %H:%M:%S") if o.created_at else "",
                o.customer_name,
                o.phone,
                o.hostel,
                o.room_number,
                o.quantity,
                o.unit_price,
                o.total_price,
                o.payment_method,
                o.status,
                o.notes or "",
                o.completed_at.strftime("%Y-%m-%d %H:%M:%S") if o.completed_at else ""
            ])
        output = si.getvalue()
        return Response(
            output,
            mimetype="text/csv",
            headers={"Content-Disposition": f"attachment;filename=madras_biryani_orders_{get_now_ist().strftime('%Y%m%d')}.csv"}
        )
    finally:
        db.close()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
