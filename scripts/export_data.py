"""
Reads Parts_Tracker_Apr2026.xlsx (or path from argv) and writes public/data.json
for the dashboard. Re-run after updating the workbook: npm run data
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_XLSX = ROOT / "Parts_Tracker_Apr2026.xlsx"
OUT = ROOT / "public" / "data.json"


def clean_cell(v):
    if pd.isna(v):
        return None
    if isinstance(v, float) and v == int(v):
        return int(v)
    s = str(v).strip()
    if s in ("", "�", "—", "-"):
        return None
    return s


def parse_date(v):
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    if hasattr(v, "strftime"):
        return v.strftime("%Y-%m-%d")
    s = clean_cell(v)
    if not s:
        return None
    try:
        dt = pd.to_datetime(s, errors="coerce")
        if pd.isna(dt):
            return None
        return dt.strftime("%Y-%m-%d")
    except Exception:
        return None


def to_float(v):
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def main():
    xlsx = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_XLSX
    if not xlsx.is_file():
        print(f"Missing file: {xlsx}", file=sys.stderr)
        sys.exit(1)

    xl = pd.ExcelFile(xlsx)
    parts = pd.read_excel(xl, "Parts Detail", header=1)
    install = pd.read_excel(xl, "Install Tracker", header=2)

    # Forward-fill truck sections in install tracker
    install["Truck / Trailer"] = install["Truck / Trailer"].ffill()

    parts_rows = []
    for _, row in parts.iterrows():
        parts_rows.append(
            {
                "partCode": clean_cell(row.get("Part Code")),
                "description": clean_cell(row.get("Description")),
                "vendor": clean_cell(row.get("Vendor")),
                "billNumber": clean_cell(row.get("Bill #")),
                "purchaseDate": parse_date(row.get("Purchase Date")),
                "qtyPurchased": to_float(row.get("Qty Purchased")),
                "unitCost": to_float(row.get("Unit Cost")),
                "totalCost": to_float(row.get("Total Cost")),
                "qtySold": to_float(row.get("Qty Sold")),
                "saleDates": clean_cell(row.get("Sale Date(s)")),
                "invoiceNumbers": clean_cell(row.get("Invoice #(s)")),
                "truckTrailer": clean_cell(row.get("Truck / Trailer")),
                "revenue": to_float(row.get("Revenue")),
                "status": clean_cell(row.get("Status")),
            }
        )

    install_rows = []
    for _, row in install.iterrows():
        pc = clean_cell(row.get("Part Code"))
        if not pc:
            continue
        install_rows.append(
            {
                "truckTrailer": clean_cell(row.get("Truck / Trailer")),
                "partCode": pc,
                "description": clean_cell(row.get("Description")),
                "vendor": clean_cell(row.get("Vendor")),
                "billNumber": clean_cell(row.get("Bill #")),
                "purchaseDate": parse_date(row.get("Purchase Date")),
                "installDate": parse_date(row.get("Install Date")),
                "invoiceNumber": to_float(row.get("Invoice #")),
                "unitCost": to_float(row.get("Unit Cost")),
            }
        )

    # Period hint from filename or first sheet title
    period_label = "April 2026"
    m = re.search(r"Apr(\d{4})?", xlsx.name, re.I)
    if m:
        period_label = f"April {m.group(1) or '2026'}"

    payload = {
        "meta": {
            "sourceFile": xlsx.name,
            "exportedAt": pd.Timestamp.now("UTC").strftime("%Y-%m-%dT%H:%M:%SZ"),
            "periodLabel": period_label,
        },
        "partsDetail": parts_rows,
        "installations": install_rows,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)

    print(f"Wrote {OUT} ({len(parts_rows)} parts, {len(install_rows)} installs)")


if __name__ == "__main__":
    main()
