import type { DashboardPayload, InstallRow, PartRow } from "../types";
import { inferPeriodLabel } from "./periodFromFilename";

function cleanCell(v: unknown): string | number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isNaN(v)) return null;
  if (typeof v === "string") {
    const s = v.replace(/\uFFFD/g, "").trim();
    if (s === "" || s === "—" || s === "-") return null;
    return s;
  }
  if (typeof v === "number") {
    if (Number.isInteger(v) || Math.abs(v - Math.round(v)) < 1e-9) return Math.round(v);
    return v;
  }
  const s = String(v).replace(/\uFFFD/g, "").trim();
  return s === "" ? null : s;
}

function cleanString(v: unknown): string | null {
  const c = cleanCell(v);
  if (c === null) return null;
  return typeof c === "number" ? String(c) : c;
}

function parseDateCell(v: unknown, xlsx: typeof import("xlsx")): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === "number") {
    const d = xlsx.SSF.parse_date_code(v);
    if (d && d.y != null && d.m != null && d.d != null) {
      return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
    }
    return null;
  }
  const s = cleanString(v);
  if (!s) return null;
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10);
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const mm = mdy[1].padStart(2, "0");
    const dd = mdy[2].padStart(2, "0");
    return `${mdy[3]}-${mm}-${dd}`;
  }
  return null;
}

function toFloat(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  const s = cleanString(v);
  if (!s) return null;
  const n = parseFloat(s.replace(/[$,]/g, ""));
  return Number.isNaN(n) ? null : n;
}

function normHeader(h: unknown): string {
  return String(h ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function colIndex(headers: unknown[], ...aliases: string[]): number {
  const want = aliases.map((a) => normHeader(a));
  for (let i = 0; i < headers.length; i++) {
    const n = normHeader(headers[i]);
    if (want.includes(n)) return i;
  }
  return -1;
}

function getSheetRows(sheet: import("xlsx").WorkSheet, xlsx: typeof import("xlsx")): unknown[][] {
  return xlsx.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    raw: true,
  }) as unknown[][];
}

function getCell(row: unknown[], idx: number): unknown {
  if (idx < 0 || idx >= row.length) return null;
  return row[idx] ?? null;
}

export async function parseWorkbook(
  buffer: ArrayBuffer,
  fileName: string
): Promise<DashboardPayload> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const partsName =
    wb.SheetNames.find((n) => n.trim().toLowerCase() === "parts detail") ?? "Parts Detail";
  const installName =
    wb.SheetNames.find((n) => n.trim().toLowerCase() === "install tracker") ??
    "Install Tracker";

  if (!wb.Sheets[partsName]) {
    throw new Error(`Missing sheet "Parts Detail" (found: ${wb.SheetNames.join(", ")})`);
  }
  if (!wb.Sheets[installName]) {
    throw new Error(`Missing sheet "Install Tracker" (found: ${wb.SheetNames.join(", ")})`);
  }

  const partsSheet = wb.Sheets[partsName];
  const installSheet = wb.Sheets[installName];

  const partsMatrix = getSheetRows(partsSheet, XLSX);
  if (partsMatrix.length < 3) {
    throw new Error('"Parts Detail" has no data rows.');
  }

  const pHeaderRow = partsMatrix[1] ?? [];
  const pci = colIndex(pHeaderRow, "Part Code");
  const di = colIndex(pHeaderRow, "Description");
  const vi = colIndex(pHeaderRow, "Vendor");
  const bi = colIndex(pHeaderRow, "Bill #", "Bill");
  const pdi = colIndex(pHeaderRow, "Purchase Date");
  const qpi = colIndex(pHeaderRow, "Qty Purchased");
  const uci = colIndex(pHeaderRow, "Unit Cost");
  const tci = colIndex(pHeaderRow, "Total Cost");
  const qsi = colIndex(pHeaderRow, "Qty Sold");
  const sdi = colIndex(pHeaderRow, "Sale Date(s)", "Sale Date");
  const iii = colIndex(pHeaderRow, "Invoice #(s)", "Invoice #");
  const tti = colIndex(pHeaderRow, "Truck / Trailer", "Truck/Trailer");
  const ri = colIndex(pHeaderRow, "Revenue");
  const sti = colIndex(pHeaderRow, "Status");

  if (pci < 0) throw new Error('Could not find "Part Code" column in Parts Detail.');

  const partsDetail: PartRow[] = [];
  for (let r = 2; r < partsMatrix.length; r++) {
    const row = partsMatrix[r] ?? [];
    const invRaw = cleanCell(getCell(row, iii));
    partsDetail.push({
      partCode: cleanString(getCell(row, pci)),
      description: cleanString(getCell(row, di)),
      vendor: cleanString(getCell(row, vi)),
      billNumber: cleanString(getCell(row, bi)),
      purchaseDate: parseDateCell(getCell(row, pdi), XLSX),
      qtyPurchased: toFloat(getCell(row, qpi)),
      unitCost: toFloat(getCell(row, uci)),
      totalCost: toFloat(getCell(row, tci)),
      qtySold: toFloat(getCell(row, qsi)),
      saleDates: cleanString(getCell(row, sdi)),
      invoiceNumbers: invRaw === null ? null : String(invRaw),
      truckTrailer: cleanString(getCell(row, tti)),
      revenue: toFloat(getCell(row, ri)),
      status: cleanString(getCell(row, sti)),
    });
  }

  const installMatrix = getSheetRows(installSheet, XLSX);
  if (installMatrix.length < 4) {
    throw new Error('"Install Tracker" has no data rows.');
  }

  const iHeaderRow = installMatrix[2] ?? [];
  const iti = colIndex(iHeaderRow, "Truck / Trailer", "Truck/Trailer");
  const ipci = colIndex(iHeaderRow, "Part Code");
  const idi = colIndex(iHeaderRow, "Description");
  const ivi = colIndex(iHeaderRow, "Vendor");
  const ibi = colIndex(iHeaderRow, "Bill #", "Bill");
  const ipdi = colIndex(iHeaderRow, "Purchase Date");
  const iindi = colIndex(iHeaderRow, "Install Date");
  const iinv = colIndex(iHeaderRow, "Invoice #");
  const iuci = colIndex(iHeaderRow, "Unit Cost");

  if (iti < 0 || ipci < 0) {
    throw new Error('Could not find required columns in Install Tracker ("Truck / Trailer", "Part Code").');
  }

  const installations: InstallRow[] = [];
  let lastTruck: string | null = null;

  for (let r = 3; r < installMatrix.length; r++) {
    const row = installMatrix[r] ?? [];
    const rawTruck = cleanString(getCell(row, iti));
    if (rawTruck) lastTruck = rawTruck;
    const pc = cleanString(getCell(row, ipci));
    if (!pc) continue;

    installations.push({
      truckTrailer: lastTruck,
      partCode: pc,
      description: cleanString(getCell(row, idi)),
      vendor: cleanString(getCell(row, ivi)),
      billNumber: cleanString(getCell(row, ibi)),
      purchaseDate: parseDateCell(getCell(row, ipdi), XLSX),
      installDate: parseDateCell(getCell(row, iindi), XLSX),
      invoiceNumber: toFloat(getCell(row, iinv)),
      unitCost: toFloat(getCell(row, iuci)),
    });
  }

  const exportedAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const periodLabel = inferPeriodLabel(fileName);

  return {
    meta: {
      sourceFile: fileName,
      exportedAt,
      periodLabel,
    },
    partsDetail,
    installations,
  };
}
