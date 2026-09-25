# The Madras Biryani - Campus Cloud Kitchen System

A fast, lightweight, and professional campus food ordering and kitchen dispatch management system designed for hostel startups.

---

## 🍛 Features Overview

### 1. Customer Ordering Portal (`/`)
- **Branded Design**: Designed with the authentic Madras ochre/terracotta palette and "LATE NIGHT CAMPUS CRAVINGS" branding matching the logo.
- **Portion Selection**: Signature Chicken Dum Biryani (500g hearty portion) for **₹150** with interactive `+` and `-` quantity selectors.
- **Campus Delivery Fields**:
  - Name
  - 10-digit phone number with automatic formatting
  - Campus hostel selection from customizable dropdown
  - Room / Block number for easy hostel delivery
  - Special delivery notes (optional)
- **Payment Method**: Default **"Pay on Delivery (Cash or UPI)"** clearly displayed.
- **Confirmation Modal**: Order summary preview popup before final placement.
- **Instant Digital Receipt**:
  - Download as high-resolution PNG image directly to phone/PC.
  - Print or Save as PDF.
  - Direct WhatsApp link to kitchen team with prefilled order details.
- **Real-Time Shop Status**: Checks operational hours and emergency store status; informs customer if ordering is currently paused.

---

### 2. Kitchen & Admin Operations Portal (`/admin`)
- **🔔 Live Orders (Home)**:
  - Real-time updates with pleasant sound chime alert when new orders arrive.
  - Quick action: **"✅ Mark as Completed"** moves the order immediately to the Completed section.
  - One-click **"📞 Call"** and **"💬 WhatsApp"** buttons for riders.
- **✅ Completed Today Section**:
  - Shows orders fulfilled **TODAY** (Indian Standard Time calendar day).
  - Displays **Today's Revenue (₹)**, **Total Orders Completed**, and **Total Biryani Packs/Weight (kg)**.
  - **Automatic Midnight Reset**: When the calendar advances to the next day, this daily section automatically starts clean at 0.
- **📊 All Orders & Analytics Section**:
  - Filter orders by: **All Time**, **This Month**, **This Week (7 Days)**, **Today**.
  - Search by Order Code, Student Name, Phone, or Hostel.
  - Live metric recalculation (Total Filtered Revenue, Total Orders, Average Order Value).
  - **Export to CSV**: Download an Excel-friendly CSV spreadsheet of all orders with one click.
- **⚙️ Shop Timings & Status Controls**:
  - **Master Switch**: Emergency **"Close Shop Entirely"** toggle (for exams, holidays, or when sold out).
  - **Operating Hours**: Configure Start Time (e.g. 7:00 PM / `19:00`) and End Time (e.g. 1:00 AM / `01:00`). Supports cross-midnight shifts.
  - **Pricing & Menu**: Easily change portion price or kitchen contact number.
  - **Hostel Dropdown Manager**: Add or remove campus hostels dynamically.

---

## 🗄️ Database Recommendation for Hosting on Render

### Why SQLite Locally vs PostgreSQL on Render:
1. **On your local laptop**: The app automatically uses **SQLite** (`madras_biryani.db`). Zero installation or database server needed. It runs immediately.
2. **On Render Web Service**: Free web servers have **ephemeral disks** (files on disk are reset whenever the server restarts or deploys code).
3. **The Solution**: 
   - Use **PostgreSQL** on Render! Render provides a **free managed PostgreSQL database** (or you can use [Neon.tech](https://neon.tech) / [Supabase](https://supabase.com)).
   - When you attach the database to your Web Service on Render, it injects the `DATABASE_URL` environment variable.
   - **This codebase is already dual-configured!** If `DATABASE_URL` exists in the environment, it uses PostgreSQL automatically; otherwise, it uses SQLite.

---

## 🚀 How to Run Locally

1. Open your terminal in this directory:
   ```bash
   cd c:\Users\ajith\OneDrive\Documents\madras
   ```

2. (Optional) Create and activate a virtual environment:
   ```bash
   python -m venv venv
   .\venv\Scripts\activate
   ```

3. Install requirements:
   ```bash
   pip install -r requirements.txt
   ```

4. Start the application:
   ```bash
   python app.py
   ```

5. Open your browser:
   - **Customer Ordering Page**: [http://localhost:5000](http://localhost:5000)
   - **Admin / Kitchen Portal**: [http://localhost:5000/admin](http://localhost:5000/admin)

---

## 🌐 How to Deploy to Render (Step-by-Step)

### Method 1: Render Web Service + Free Postgres (Recommended)

1. **Push your code to GitHub**:
   - Create a GitHub repository (e.g., `the-madras-biryani`).
   - Push these files to GitHub.

2. **Create a Database on Render**:
   - Go to [dashboard.render.com](https://dashboard.render.com).
   - Click **New +** -> **PostgreSQL**.
   - Name it: `madras-biryani-db`.
   - Select the **Free** tier and click **Create Database**.
   - Copy the **Internal Database URL** (e.g., `postgres://biryani_admin:...@dpg-.../madras_biryani`).

3. **Deploy Web Service**:
   - Click **New +** -> **Web Service**.
   - Connect your GitHub repository.
   - Settings:
     - **Name**: `the-madras-biryani`
     - **Runtime**: `Python 3`
     - **Build Command**: `pip install -r requirements.txt`
     - **Start Command**: `gunicorn app:app`
     - **Plan**: `Free`
   - Under **Environment Variables**, add:
     - `DATABASE_URL`: paste your PostgreSQL Internal Database URL.
     - `SECRET_KEY`: any random secure string.
   - Click **Deploy Web Service**!

Your customer website will be live at `https://the-madras-biryani.onrender.com`!

---

## 📁 File Structure

```
madras/
├── app.py                  # Flask backend & API routes
├── database.py             # Database models (dual SQLite & PostgreSQL support)
├── requirements.txt        # Python dependencies
├── Procfile                # Gunicorn process config for Render
├── render.yaml             # 1-click Render blueprint config
├── static/
│   ├── css/
│   │   ├── style.css       # Customer UI styling (Madras terracotta & night theme)
│   │   └── admin.css       # Clean kitchen dashboard styling
│   ├── js/
│   │   ├── app.js          # Customer logic, validation, canvas receipt download
│   │   └── admin.js        # Admin live polling, audio chimes, timings management
│   └── images/
│       ├── logo.jpeg       # Brand logo
│       └── chicken.png     # Authentic biryani photo
└── templates/
    ├── index.html          # Mobile & PC customer ordering page
    ├── admin.html          # Kitchen dispatch & analytics dashboard
    └── receipt.html        # Standalone printable invoice
```
