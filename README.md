# AM5 Motherboard Database & Comparison Tool 🚀

A powerful, interactive web application to browse, filter, and compare AMD AM5 motherboards. Designed to handle complex hardware specifications with a high-fidelity comparison engine and a unified data scoring system.

![Flask](https://img.shields.io/badge/flask-%23000.svg?style=for-the-badge&logo=flask&logoColor=white)
![SQLAlchemy](https://img.shields.io/badge/sqlalchemy-%23d71f00.svg?style=for-the-badge&logo=sqlalchemy&logoColor=white)
![Pandas](https://img.shields.io/badge/pandas-%23150458.svg?style=for-the-badge&logo=pandas&logoColor=white)
![Render](https://img.shields.io/badge/Render-%2346E3B7.svg?style=for-the-badge&logo=render&logoColor=white)

---

## ✨ Features

### 🔍 Advanced Search & Filtering
- **Fuzzy Search**: Find models instantly by brand, model name, or chipset.
- **Dynamic Filters**: Narrow down results by Chipset (X870E, B650, etc.) and Form Factor (ATX, ITX, mATX).
- **Unified Scorecard**: Click any model to see a summarized breakdown of LAN speed, VRM quality, Audio codecs, and Wireless capabilities.

### 📊 Precision Comparison Engine
- **Side-by-Side Analysis**: Compare up to 10 motherboards simultaneously with a persistent header.
- **Scorecard Summary**: A curated top section showing the most critical specs for quick decision-making.
- **Smart Highlighting**: 
    - **Hide Identical**: Quickly filter out rows where all compared models have the same spec.
    - **Highlight Diffs**: Visually identify variations between motherboard features.
- **Dynamic Update**: Add or remove models from the comparison view in real-time without full page reloads.

### 📥 High-Complexity Ingestion
- **Excel Orchestration**: Sophisticated parser that transforms a massive **170MB+** multi-level Excel workbook into a structured SQLite database.
- **Rich Text Preservation**: Automatically converts partially bolded Excel cells into HTML for the frontend.
- **Smart Scoring**: Server-side logic to normalize LAN controller speeds and feature tiers.

---

## 🛠 Tech Stack

- **Backend**: Python 3.x, Flask, SQLAlchemy
- **Data Ingestion**: Pandas, OpenPyXL
- **Database**: SQLite (Committed for efficient production deployment)
- **Frontend**: Vanilla JavaScript (ES6+), Bootstrap 5, Bootstrap Icons
- **Deployment**: Production-ready with Gunicorn and Render support

---

## 🚀 Getting Started

### Local Development

1. **Clone the repository**:
   ```bash
   git clone https://github.com/yourusername/mobo-parse.git
   cd mobo-parse
   ```

2. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Initialize the database (optional)**:
   The repository includes a pre-populated `mobo.db`. To rebuild it from the Excel sheet:
   ```bash
   python scripts/init_db.py
   ```

4. **Run the app**:
   ```bash
   python app.py
   ```
   Visit `http://localhost:5000` in your browser.

---

## 🌐 Deployment to Render

This project is optimized for **Render's Free Tier**:

1. Create a new **Web Service** on [Render](https://dashboard.render.com).
2. Connect your GitHub repository.
3. Render will automatically detect the:
    - **Environment**: Python
    - **Install Command**: `pip install -r requirements.txt`
    - **Start Command**: `gunicorn app:app` (via `Procfile`)
4. Set the `PORT` environment variable if needed (optional).

---

## 📝 License

This project is intended for enthusiasts and builders. Data is sourced from public specifications and community spreadsheets. 

Actually Razortek: Do whatever the fuck you want with it I do not give a shit, sorry for vibecoding.
