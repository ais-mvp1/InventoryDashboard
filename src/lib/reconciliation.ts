import type { PartRow } from "../types";

export type ReconciliationResult = {
  expectedPartCodes: string[];
  receivedCodes: string[];
  installedCodes: string[];
  missingReceived: string[];
  extraReceived: string[];
  missingInstalledVsExpected: string[];
  /** Received but never marked installed (by part code string match only) */
  receivedNotInstalled: string[];
};

function norm(s: string): string {
  return s.trim().toLowerCase();
}

/** Unique normalized part codes from parts detail rows */
export function expectedPartCodesFromParts(parts: PartRow[]): string[] {
  const set = new Set<string>();
  for (const p of parts) {
    const c = p.partCode?.trim();
    if (c) set.add(norm(c));
  }
  return [...set].sort();
}

export function buildReconciliation(
  parts: PartRow[],
  receivedPartCodes: string[],
  installedPartCodes: string[]
): ReconciliationResult {
  const expected = expectedPartCodesFromParts(parts);
  const rec = [...new Set(receivedPartCodes.map((x) => norm(x)).filter(Boolean))].sort();
  const ins = [...new Set(installedPartCodes.map((x) => norm(x)).filter(Boolean))].sort();
  const expSet = new Set(expected);

  const missingReceived = expected.filter((e) => !rec.includes(e));
  const extraReceived = rec.filter((r) => !expSet.has(r));

  const missingInstalledVsExpected = expected.filter((e) => !ins.includes(e));
  const receivedNotInstalled = rec.filter((r) => !ins.includes(r));

  return {
    expectedPartCodes: expected,
    receivedCodes: rec,
    installedCodes: ins,
    missingReceived,
    extraReceived,
    missingInstalledVsExpected,
    receivedNotInstalled,
  };
}
