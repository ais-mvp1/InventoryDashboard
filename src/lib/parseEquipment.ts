/** Split combined truck/trailer cells like "TK# 574, TK# 567" into tokens */
export function splitEquipment(raw: string | null | undefined): string[] {
  if (!raw || typeof raw !== "string") return [];
  const s = raw.trim();
  if (!s) return [];
  return s
    .split(/[,;]\s*/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/** All distinct equipment labels from strings that may list multiple units */
export function collectEquipmentLabels(rows: { truckTrailer?: string | null }[]): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    for (const t of splitEquipment(r.truckTrailer ?? null)) {
      set.add(t);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/** True if selected equipment appears in a possibly combined cell (exact token). */
export function rowMatchesEquipment(
  truckCell: string | null | undefined,
  selected: string | null
): boolean {
  if (!selected) return true;
  const parts = splitEquipment(truckCell ?? null);
  if (parts.length === 0) return selected === "Unassigned";
  return parts.includes(selected);
}

/**
 * Equipment filter: exact list token, substring on label (e.g. "565" → "TK# 565"),
 * or digit-only match so typing 565 matches combined rows.
 */
export function rowMatchesEquipmentFilter(
  truckCell: string | null | undefined,
  filter: string | null
): boolean {
  if (!filter || !filter.trim()) return true;
  const q = filter.trim();
  const lower = q.toLowerCase();
  const raw = (truckCell ?? "").toLowerCase();
  if (raw.includes(lower)) return true;

  const parts = splitEquipment(truckCell ?? null);
  if (parts.some((p) => p.toLowerCase() === lower)) return true;
  if (parts.some((p) => p.toLowerCase().includes(lower))) return true;

  const qDigits = q.replace(/\D/g, "");
  if (qDigits.length >= 2) {
    for (const p of parts) {
      const pd = p.replace(/\D/g, "");
      if (pd.includes(qDigits)) return true;
    }
    const rawDigits = raw.replace(/\D/g, "");
    if (rawDigits.includes(qDigits)) return true;
  }

  return false;
}

/** "2026-01" → "January 2026" for dropdowns */
export function formatYearMonthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  if (!y || !m || m.length < 2) return ym;
  const d = new Date(`${y}-${m.slice(0, 2)}-01T12:00:00`);
  if (Number.isNaN(d.getTime())) return ym;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long" });
}

export function monthKey(isoDate: string | null | undefined): string | null {
  if (!isoDate) return null;
  const d = isoDate.slice(0, 10);
  if (d.length >= 7 && /^\d{4}-\d{2}/.test(d)) return d.slice(0, 7);
  return monthKeyFromAny(isoDate);
}

/** ISO dates or M/D/YYYY (first date if comma-separated) */
export function monthKeyFromAny(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  const first = raw.split(/[,;]/)[0]?.trim() ?? "";
  if (/^\d{4}-\d{2}-\d{2}/.test(first)) return first.slice(0, 7);
  const m = first.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const mm = m[1].padStart(2, "0");
    const yyyy = m[3];
    return `${yyyy}-${mm}`;
  }
  return null;
}

export function formatMoney(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso + (iso.length === 10 ? "T12:00:00" : ""));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Approximate months between two ISO date strings */
export function monthsBetween(fromIso: string | null, toIso: string | null): number | null {
  if (!fromIso || !toIso) return null;
  const a = new Date(fromIso.slice(0, 10) + "T12:00:00");
  const b = new Date(toIso.slice(0, 10) + "T12:00:00");
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) months -= 1;
  return Math.max(0, months);
}
