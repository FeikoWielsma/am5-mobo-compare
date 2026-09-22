# AM5 Motherboard Database & Comparison Tool 🚀

A powerful, interactive web application to browse, filter, and compare AMD AM5 motherboards. Designed to handle complex hardware specifications with a high-fidelity comparison engine and a unified data scoring system.

![Flask](https://img.shields.io/badge/flask-%23000.svg?style=for-the-badge&logo=flask&logoColor=white)
![SQLAlchemy](https://img.shields.io/badge/sqlalchemy-%23d71f00.svg?style=for-the-badge&logo=sqlalchemy&logoColor=white)
![Pandas](https://img.shields.io/badge/pandas-%23150458.svg?style=for-the-badge&logo=pandas&logoColor=white)
![Cloud Run](https://img.shields.io/badge/Cloud%20Run-%234285F4.svg?style=for-the-badge&logo=googlecloud&logoColor=white)

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
- **Deployment**: Gunicorn in Docker, on GCP Cloud Run (prod) and a self-hosted server (staging)

---

## 🚀 Getting Started

### Local Development

The repository uses **Git LFS** for the source spreadsheet, so make sure
`git lfs install` has been run before cloning.

1. **Clone the repository**:
   ```bash
   git clone https://github.com/FeikoWielsma/am5-mobo-compare.git
   cd am5-mobo-compare
   ```

2. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Build the database** (required on first run, ~30s):
   ```bash
   python scripts/init_db.py
   ```
   This parses the committed spreadsheet into `mobo.db` and extracts the rear
   I/O images into `static/img/io/`. Both are generated artifacts and are not
   committed — re-run this whenever the spreadsheet changes.

4. **Run the app**:
   ```bash
   python app.py
   ```
   Visit `http://localhost:5000` in your browser.

### Running the tests

```bash
python -m playwright install chromium   # once, for the browser tests
python -m pytest
```

The suite starts its own Flask server, so nothing needs to be running first.

---

## 🌐 Deployment

The production Docker image serves the SvelteKit site with Caddy. The build
generates its JSON catalog and rear I/O images from the Git LFS spreadsheet,
and packages the committed motherboard PCB WebP images.

| Env | URL | How it deploys |
| --- | --- | --- |
| **Prod** | https://am5mobo.razortek.nl | GCP Cloud Run, service `app`, project `central-perk-259621`, region `us-central1`. GitHub `main` pushes trigger Cloud Build and deploy automatically. |
| **Staging** | https://am5mobo.feikowielsma.nl | Forgejo CI (`.forgejo/workflows/build.yml`) builds on push to the `staging` branch, pushes to the Forgejo registry; Watchtower pulls it. |
| **Dev** | https://am5mobo-dev.feikowielsma.nl | Built on the home server from a local checkout. |

### Deploying to prod

Pushing `main` to GitHub starts the production build. The Docker build resolves
the public Git LFS workbook when Cloud Build checks out only its pointer, then
builds the catalog and verifies the finished assets before deployment.

For a manual deployment from a local checkout:

```bash
gcloud run deploy app \
  --source . \
  --project central-perk-259621 \
  --region us-central1
```

The manual command uploads the local checkout. Run it with Git LFS installed
and the full spreadsheet downloaded.

The Docker build runs `scripts/build_data.py` and verifies that the built site
contains its JSON catalog and every image referenced by that catalog. Staging
additionally runs `scripts/fetch_sheet.py` to pull the latest data from Google
Sheets before building.

Motherboard IDs are derived from the board's **brand and model**
(`loaders/ids.py`), so refreshing the spreadsheet no longer disturbs them and
`/compare?ids=...` links keep working. They were previously
`{sheet}_{rowindex}_{model}`, which renumbered every board below an inserted
row.

> ⚠️ Links shared **before August 2026** use the old positional IDs and will
> not resolve. There is no mapping back — the old IDs depended on a row order
> that isn't recorded anywhere.

---

## 📝 License

This project is intended for enthusiasts and builders. Data is sourced from public specifications and community spreadsheets. 

Actually Razortek: Do whatever the fuck you want with it I do not give a shit, sorry for vibecoding.
