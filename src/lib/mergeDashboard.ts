import type { DashboardPayload, InstallRow, PartRow, StoredBatch } from "../types";

export const BUNDLED_BATCH_ID = "__bundled__";

function tagParts(rows: PartRow[], batchId: string, uploadLabel: string): PartRow[] {
  return rows.map((p) => ({ ...p, batchId, uploadLabel }));
}

function tagInstalls(rows: InstallRow[], batchId: string, uploadLabel: string): InstallRow[] {
  return rows.map((i) => ({ ...i, batchId, uploadLabel }));
}

export function mergeDashboardView(
  uploads: StoredBatch[],
  bundled: DashboardPayload | null,
  includeBundled: boolean
): DashboardPayload | null {
  const parts: PartRow[] = [];
  const installs: InstallRow[] = [];
  const names: string[] = [];

  if (includeBundled && bundled) {
    names.push(bundled.meta.sourceFile);
    parts.push(...tagParts(bundled.partsDetail, BUNDLED_BATCH_ID, bundled.meta.periodLabel));
    installs.push(
      ...tagInstalls(bundled.installations, BUNDLED_BATCH_ID, bundled.meta.periodLabel)
    );
  }

  const sorted = [...uploads].sort((a, b) =>
    a.meta.exportedAt.localeCompare(b.meta.exportedAt)
  );
  for (const b of sorted) {
    names.push(b.meta.sourceFile);
    parts.push(...tagParts(b.partsDetail, b.id, b.meta.periodLabel));
    installs.push(...tagInstalls(b.installations, b.id, b.meta.periodLabel));
  }

  if (parts.length === 0 && installs.length === 0) return null;

  const periodLabel =
    sorted.length === 0 && bundled && includeBundled
      ? bundled.meta.periodLabel
      : sorted.length > 0
        ? `${sorted.length} monthly file${sorted.length > 1 ? "s" : ""}`
        : "Combined";

  return {
    meta: {
      sourceFile: names.length ? names.join(" · ") : "—",
      exportedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
      periodLabel,
    },
    partsDetail: parts,
    installations: installs,
  };
}
