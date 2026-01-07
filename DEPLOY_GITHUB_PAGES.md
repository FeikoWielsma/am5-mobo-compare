# Deploying to GitHub Pages

To host this project on your `github.io` page, follow these steps:

### 1. Generate Static Files
Run the following commands in your terminal to export the data and build the HTML files:
```powershell
$env:PYTHONPATH="."
python scripts/export_data.py
python scripts/build_static.py
```

### 2. Verify Output
You should now have the following new files in your root directory:
- `index.html` (Static version of the home page)
- `compare.html` (Static version of the comparison page)
- `static/data/mobos.json` (Full motherboard database)
- `static/data/structure.json` (Category headers)
- `static/data/lan_lookup.json` (LAN speed dictionary)

### 3. Automatic Deployment (GitHub Actions)
I've already set up a GitHub Actions workflow for you! 

Every time you `git push origin main`, GitHub will automatically:
1. Run a deployment runner.
2. Package your `index.html`, `compare.html`, and `static/` folder.
3. Host it live on your GitHub Pages site.

**Note:** Since the Excel file is too large for GitHub, the build currently relies on you committing the updated `static/data/*.json` files whenever you change the source data.

### 4. Direct Manual Push (Optional)
...

Your site will be live at `https://[username].github.io/[repo-name]/` in a few minutes!
