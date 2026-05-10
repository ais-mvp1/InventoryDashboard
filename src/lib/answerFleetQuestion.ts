import type { InstallRow, PartRow } from "../types";
import {
  formatDate,
  formatMoney,
  formatYearMonthLabel,
  monthKey,
  monthKeyFromAny,
  rowMatchesEquipmentFilter,
  splitEquipment,
} from "./parseEquipment";

const STOP = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "been",
  "but",
  "by",
  "can",
  "data",
  "did",
  "do",
  "does",
  "file",
  "for",
  "from",
  "get",
  "got",
  "had",
  "has",
  "have",
  "how",
  "i",
  "in",
  "is",
  "it",
  "its",
  "just",
  "last",
  "me",
  "most",
  "my",
  "not",
  "of",
  "on",
  "or",
  "our",
  "out",
  "per",
  "see",
  "show",
  "so",
  "some",
  "tell",
  "than",
  "that",
  "the",
  "this",
  "to",
  "truck",
  "trucks",
  "trailer",
  "trailers",
  "unit",
  "units",
  "us",
  "was",
  "we",
  "were",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "with",
  "you",
  "your",
  "about",
  "any",
  "there",
  "they",
  "them",
  "into",
  "will",
  "would",
  "could",
  "should",
  "each",
  "every",
  "month",
  "months",
  "year",
  "recent",
  "first",
  "find",
  "give",
  "list",
  "lookup",
  "need",
  "please",
  "maybe",
  "also",
  "only",
  "all",
  "both",
]);

/** Words that rarely help row matching (too generic for parts text). */
const GENERIC_MATCH = new Set([
  "change",
  "changed",
  "install",
  "installed",
  "installation",
  "repair",
  "repairs",
  "repaired",
  "work",
  "done",
  "job",
  "service",
]);

/** Calendar month names → 1–12 (for stripping from keyword matching when used as a date). */
const MONTH_NAME_TO_NUM: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

/** Strip tokens that usually describe the question, not row content. */
const INTENT_NOISE = new Set([
  "much",
  "many",
  "total",
  "revenue",
  "cost",
  "costs",
  "price",
  "prices",
  "sale",
  "sales",
  "stock",
  "purchase",
  "pay",
  "paid",
  "spend",
  "spent",
  "money",
  "dollar",
  "dollars",
]);

export type FleetAnswer = {
  summary: string;
  /** Rows used for the narrative (installs + possibly parts). */
  citedInstalls: InstallRow[];
  citedParts: PartRow[];
  equipmentUsed: string | null;
  keywordsUsed: string[];
  searchedParts: boolean;
};

function tokenizeQuestion(raw: string): string[] {
  return raw
    .toLowerCase()
    .replace(/[#]/g, " ")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);
}

/** Prefer equipment ids near fleet vocabulary; otherwise first plausible digit token. */
function extractEquipmentHint(q: string): string | null {
  const lower = q.toLowerCase();
  const tkMatch = q.match(/\btk#?\s*(\d{2,6})\b/i);
  if (tkMatch) return tkMatch[1];

  const numbers = [...q.matchAll(/\b(\d{2,6})\b/g)].map((m) => m[1]);
  if (numbers.length === 0) return null;

  const truckIdx = lower.search(/\b(truck|trailer|unit|tk|rig|vehicle)\b/);
  let best: string | null = null;
  let bestDist = Infinity;
  for (const n of numbers) {
    const idx = q.indexOf(n);
    if (idx < 0) continue;
    if (truckIdx >= 0) {
      const d = Math.abs(idx - truckIdx);
      if (d < bestDist) {
        bestDist = d;
        best = n;
      }
    }
  }
  if (best) return best;
  return numbers[0] ?? null;
}

function extractKeywords(q: string): string[] {
  const tokens = tokenizeQuestion(q);
  const out: string[] = [];
  for (const t of tokens) {
    if (/^\d+$/.test(t)) continue;
    if (t.length < 3) continue;
    if (STOP.has(t)) continue;
    if (GENERIC_MATCH.has(t)) continue;
    if (INTENT_NOISE.has(t)) continue;
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

/** Remove month-name tokens so they are not required to appear in part descriptions. */
function stripMonthTokens(keywords: string[]): string[] {
  return keywords.filter((k) => MONTH_NAME_TO_NUM[k] == null);
}

function wantsPartsIntent(q: string): boolean {
  const lower = q.toLowerCase();
  return (
    /\b(cost|costs|price|prices|revenue|sell|sold|sale|sales|stock|purchase|purchased|pay|paid|spend|spent|money|dollar)\b/.test(
      lower
    ) || /\bhow much\b/.test(lower)
  );
}

function wantsWhenIntent(q: string): boolean {
  const lower = q.toLowerCase();
  return /\b(when|date|day|time)\b/.test(lower);
}

/** User is asking about work / installs, not only dollars. */
function wantsInstallFocus(q: string): boolean {
  const lower = q.toLowerCase();
  return (
    wantsWhenIntent(q) ||
    /\b(install|installed|installation|repair|repairs|repaired|service|warranty|changed|break|fix|fixed|clutch|brake|tire|oil)\b/.test(
      lower
    )
  );
}

/** Plain-language “list / which units” style questions. */
function wantsListIntent(q: string): boolean {
  const lower = q.toLowerCase();
  return /\b(list|show\s+all|all\s+trucks|which\s+trucks|every\s+truck|every\s+unit)\b/.test(lower);
}

function extractMonthFilter(q: string, now: Date): { ym: string; label: string } | null {
  const lower = q.toLowerCase();

  if (/\bthis\s+month\b/.test(lower) || /\bcurrent\s+month\b/.test(lower)) {
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    const ym = `${y}-${String(m).padStart(2, "0")}`;
    return { ym, label: formatYearMonthLabel(ym) };
  }

  if (/\blast\s+month\b/.test(lower)) {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const ym = `${y}-${String(m).padStart(2, "0")}`;
    return { ym, label: formatYearMonthLabel(ym) };
  }

  const monthRe =
    /\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)\b/;
  const mm = lower.match(monthRe);
  if (!mm) return null;

  const monthNum = MONTH_NAME_TO_NUM[mm[1]];
  if (!monthNum) return null;

  const yearMatch = q.match(/\b(20\d{2})\b/);
  let year: number;
  if (yearMatch) {
    year = parseInt(yearMatch[1], 10);
  } else {
    const cy = now.getFullYear();
    const cm = now.getMonth() + 1;
    if (monthNum === cm) year = cy;
    else if (monthNum < cm) year = cy;
    else year = cy - 1;
  }

  const ym = `${year}-${String(monthNum).padStart(2, "0")}`;
  return { ym, label: formatYearMonthLabel(ym) };
}

function rowText(row: InstallRow | PartRow): string {
  const d = "description" in row ? row.description : null;
  const p = row.partCode;
  const v = "vendor" in row ? row.vendor : null;
  return `${d ?? ""} ${p ?? ""} ${v ?? ""}`.toLowerCase();
}

function normPartCode(code: string | null | undefined): string {
  return String(code ?? "")
    .toUpperCase()
    .replace(/\s+/g, "");
}

/**
 * Business rule: oil change = oil filter **or** fuel filter **or** DELO / CHV line item
 * (e.g. part **257004990CHV**).
 */
export function matchesOilChangeConcept(row: InstallRow | PartRow): boolean {
  const hay = rowText(row);
  const code = normPartCode(row.partCode);

  if (hay.includes("oil filter")) return true;
  if (hay.includes("fuel filter")) return true;
  if (code.includes("257004990CHV") || hay.includes("257004990chv")) return true;
  if (/\bdelo\b/.test(hay) && (hay.includes("oil") || hay.includes("filter") || code.includes("257004990")))
    return true;

  return false;
}

function detectOilChangeIntent(q: string): boolean {
  const lower = q.toLowerCase();
  if (/\boil\s*(change|changed|chg)\b/.test(lower)) return true;
  if (/\boil\s+was\s+chang(ed)?\b/.test(lower)) return true;
  if (/\boil\s+was\s+change\b/.test(lower)) return true;
  if (/\boil\s+was\s+changed\b/.test(lower)) return true;
  if (/\bchanged\s+(the\s+)?oil\b/.test(lower)) return true;
  if (/\boil\s+change\b/.test(lower)) return true;
  if (/\boil\b/.test(lower) && /\b(list|which)\s+(all\s+)?trucks\b/.test(lower)) return true;
  return false;
}

function matchesKeywords(
  row: InstallRow | PartRow,
  keywords: string[],
  mode: "all" | "any"
): boolean {
  if (keywords.length === 0) return true;
  const hay = rowText(row);
  if (mode === "all") return keywords.every((k) => hay.includes(k));
  return keywords.some((k) => hay.includes(k));
}

function sortInstallsByDateDesc(rows: InstallRow[]): InstallRow[] {
  return [...rows].sort((a, b) => (b.installDate ?? "").localeCompare(a.installDate ?? ""));
}

function distinctTruckLabels(rows: InstallRow[]): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    for (const t of splitEquipment(r.truckTrailer ?? null)) {
      if (t.trim()) set.add(t.trim());
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function installMatchesMonth(row: InstallRow, ym: string): boolean {
  const k = monthKey(row.installDate) ?? monthKey(row.purchaseDate);
  return k === ym;
}

function partMatchesMonth(row: PartRow, ym: string): boolean {
  const k =
    monthKey(row.purchaseDate) ??
    monthKeyFromAny(row.saleDates ?? undefined);
  return k === ym;
}

export function answerFleetQuestion(
  question: string,
  installations: InstallRow[],
  parts: PartRow[],
  options?: { now?: Date }
): FleetAnswer {
  const q = question.trim();
  const now = options?.now ?? new Date();

  if (!q) {
    return {
      summary: "Ask a question about trucks, parts, or install dates using your uploaded Excel data.",
      citedInstalls: [],
      citedParts: [],
      equipmentUsed: null,
      keywordsUsed: [],
      searchedParts: false,
    };
  }

  const monthFilter = extractMonthFilter(q, now);
  const ym = monthFilter?.ym ?? null;
  const monthLabel = monthFilter?.label ?? null;

  const equipmentUsed = extractEquipmentHint(q);
  const oilChangeIntent = detectOilChangeIntent(q);
  let rawKeywords = extractKeywords(q);
  rawKeywords = stripMonthTokens(rawKeywords);

  const searchedParts = wantsPartsIntent(q);
  const installFocus = wantsInstallFocus(q);
  const listIntent = wantsListIntent(q);
  const preferWhen = wantsWhenIntent(q) || rawKeywords.length > 0;

  let inst = installations;
  if (equipmentUsed) {
    inst = inst.filter((i) => rowMatchesEquipmentFilter(i.truckTrailer, equipmentUsed));
  }

  let keywordsUsed: string[] = rawKeywords;
  let mode: "all" | "any" = "all";
  let matched: InstallRow[];

  if (oilChangeIntent) {
    keywordsUsed = [
      "oil change (oil filter / fuel filter / 257004990CHV·DELO)",
    ];
    matched = inst.filter((i) => matchesOilChangeConcept(i));
  } else {
    matched = inst.filter((i) => matchesKeywords(i, keywordsUsed, mode));
    if (matched.length === 0 && keywordsUsed.length > 1) {
      mode = "any";
      matched = inst.filter((i) => matchesKeywords(i, keywordsUsed, mode));
    }
    if (matched.length === 0 && keywordsUsed.length === 0 && equipmentUsed) {
      matched = inst;
    }
  }

  if (ym) {
    matched = matched.filter((i) => installMatchesMonth(i, ym));
  }

  if (searchedParts && !installFocus && keywordsUsed.length === 0 && !oilChangeIntent) {
    matched = [];
  }

  const sortedInstalls = sortInstallsByDateDesc(matched);
  let citedInstalls = sortedInstalls;

  let partsFiltered: PartRow[] = [];
  if (searchedParts) {
    let pRows = parts;
    if (equipmentUsed) {
      pRows = pRows.filter((p) => rowMatchesEquipmentFilter(p.truckTrailer, equipmentUsed));
    }
    if (oilChangeIntent) {
      partsFiltered = pRows.filter((p) => matchesOilChangeConcept(p));
    } else {
      let pm = pRows.filter((p) => matchesKeywords(p, keywordsUsed, "all"));
      if (pm.length === 0 && keywordsUsed.length > 1) {
        pm = pRows.filter((p) => matchesKeywords(p, keywordsUsed, "any"));
      }
      if (pm.length === 0 && keywordsUsed.length === 0 && equipmentUsed) {
        pm = pRows;
      }
      partsFiltered = pm;
    }
    if (ym) {
      partsFiltered = partsFiltered.filter((p) => partMatchesMonth(p, ym));
    }
    partsFiltered = [...partsFiltered].sort((a, b) =>
      (b.purchaseDate ?? "").localeCompare(a.purchaseDate ?? "")
    );
  }

  const citedParts = partsFiltered;

  const lines: string[] = [];
  const scope: string[] = [];
  if (equipmentUsed) scope.push(`equipment matching **${equipmentUsed}**`);
  if (oilChangeIntent) scope.push(`**Oil change** rows (oil filter, fuel filter, part **257004990CHV** / DELO)`);
  if (keywordsUsed.length && !oilChangeIntent) scope.push(`keywords: ${keywordsUsed.join(", ")}`);
  if (monthLabel) scope.push(`calendar month **${monthLabel}**`);
  if (scope.length) lines.push(`Interpreted: ${scope.join(" · ")}.`);

  if (sortedInstalls.length === 0 && (!searchedParts || partsFiltered.length === 0)) {
    lines.push(
      "No matching rows in your merged data. Try another unit number, a shorter part word (e.g. **clutch**), or check that the right monthly files are included in **Scope**."
    );
    return {
      summary: lines.join("\n\n"),
      citedInstalls: [],
      citedParts: [],
      equipmentUsed,
      keywordsUsed,
      searchedParts,
    };
  }

  if (sortedInstalls.length > 0) {
    const trucks = distinctTruckLabels(sortedInstalls);
    if ((listIntent || oilChangeIntent) && trucks.length > 0 && sortedInstalls.length >= 1) {
      lines.push(
        `**${trucks.length}** distinct unit(s) with matching install lines${monthLabel ? ` in **${monthLabel}**` : ""}: ${trucks.slice(0, 40).join(", ")}${trucks.length > 40 ? "…" : ""}.`
      );
    }

    const top = sortedInstalls[0];
    if (!listIntent && preferWhen && top.installDate && !oilChangeIntent) {
      lines.push(
        `Latest matching install: **${formatDate(top.installDate)}** — ${top.description ?? "—"} (${top.truckTrailer ?? "equipment n/a"}) · Bill ${top.billNumber ?? "—"}`
      );
      if (sortedInstalls.length > 1) {
        lines.push(`Found **${sortedInstalls.length}** install lines (newest first below).`);
      }
    } else if (!listIntent && sortedInstalls.length === 1 && !oilChangeIntent) {
      const r = sortedInstalls[0];
      lines.push(
        `**${formatDate(r.installDate)}** · ${r.description ?? "—"} · ${r.truckTrailer ?? "—"} · Bill ${r.billNumber ?? "—"}`
      );
    } else {
      lines.push(
        `**${sortedInstalls.length}** install line(s) (sorted by install date, newest first).`
      );
    }
  }

  if (searchedParts && partsFiltered.length > 0) {
    const p = partsFiltered[0];
    lines.push(
      `Parts line: **${p.description ?? p.partCode ?? "—"}** — revenue ${formatMoney(p.revenue)} · total cost ${formatMoney(p.totalCost)} · ${p.truckTrailer ?? "—"}`
    );
    if (partsFiltered.length > 1) {
      lines.push(`**${partsFiltered.length}** part rows match (see table).`);
    }
  } else if (searchedParts && partsFiltered.length === 0) {
    lines.push("No matching rows in the parts detail for this question.");
  }

  return {
    summary: lines.join("\n\n"),
    citedInstalls,
    citedParts,
    equipmentUsed,
    keywordsUsed,
    searchedParts,
  };
}
