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

### 3. Push to GitHub
Commit and push these files along with your `static/css` and `static/js` folders:
```bash
git add index.html compare.html static/
git commit -m "Deploy static site"
git push origin main
```

### 4. Enable GitHub Pages
1. Go to your repository on GitHub.
2. Settings > Pages.
3. Under "Build and deployment", set Source to "Deploy from a branch".
4. Select "main" and folder "/ (root)".
5. Click Save.

Your site will be live at `https://[username].github.io/[repo-name]/` in a few minutes!
