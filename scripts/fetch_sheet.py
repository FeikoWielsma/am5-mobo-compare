"""
Download the latest AM5 motherboard spreadsheet from Google Sheets.

Run from project root:
    python scripts/fetch_sheet.py

Saves the file to the project root where the loader expects it.
"""

import time
import requests

# Keep in sync with loaders/config.py
EXCEL_FILE = "AM5 Motherboards Sheet (X870_X670_B850_B650_B840_A620).xlsx"

SHEET_ID = "1NQHkDEcgDPm34Mns3C93K6SJoBnua-x9O-y_6hv8sPs"
DOWNLOAD_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=xlsx"

MAX_RETRIES = 5


def fetch_sheet(dest: str = EXCEL_FILE) -> None:
    for attempt in range(1, MAX_RETRIES + 1):
        print(f"Downloading sheet from Google Sheets (attempt {attempt}/{MAX_RETRIES})...")
        try:
            with requests.get(DOWNLOAD_URL, timeout=120, stream=True) as response:
                response.raise_for_status()
                total = 0
                with open(dest, "wb") as f:
                    for chunk in response.iter_content(chunk_size=65536):
                        f.write(chunk)
                        total += len(chunk)
            print(f"Saved {total / 1024:.0f} KB to {dest}")
            return
        except Exception as e:
            print(f"Attempt {attempt} failed: {e}")
            if attempt < MAX_RETRIES:
                time.sleep(5 * attempt)

    raise RuntimeError(f"Failed to download sheet after {MAX_RETRIES} attempts")


if __name__ == "__main__":
    fetch_sheet()
