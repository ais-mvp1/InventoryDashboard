# Inventory Dashboard — Code Test Report

**Date:** 2026-05-15
**Scope:** Static analysis of all source files. No automated test suite exists; findings are based on manual code review.
**Stack:** React 18 + TypeScript + Vite + Supabase + IndexedDB + XLSX

---

## Executive Summary

| Severity | Count |
|---|---|
| Bug (incorrect behavior) | 5 |
| Missing feature / UI gap | 1 |
| Security concern | 2 |
| Performance issue | 1 |
| Minor / code quality | 7 |

---

## Bugs — Incorrect Behavior

### B-1 · Empty rows included in `partsDetail`

**File:** `src/lib/parseWorkbook.ts` lines 136–155

The install tracker loop skips rows where `partCode` is null (`if (!pc) continue`), but the parts-detail loop does not. Every row from index 2 onward — including blank separator rows, footer notes, or Excel spacers — gets pushed into `partsDetail`. These ghost rows show up in the inventory tables and inflate KPI counts.

```ts
// Install loop (correct — skips blank rows)
const pc = cleanString(getCell(row, ipci));
if (!pc) continue;

// Parts loop (missing this guard)
partsDetail.push({ partCode: cleanString(getCell(row, pci)), ... });
```

**Fix needed:** add `if (!cleanString(getCell(row, pci))) continue;` before the push.

---

### B-2 · Timezone off-by-one in `parseDateCell` for string dates

**File:** `src/lib/parseWorkbook.ts` lines 41–42

When a cell contains a string like `"1/15/2026"`, `Date.parse` is attempted first. On browsers that parse `M/D/YYYY` format (Safari, Chrome), it treats this as **local midnight**. The subsequent `.toISOString().slice(0, 10)` converts to UTC, which can roll back one day for users in UTC+ timezones (e.g., "2026-01-15" becomes "2026-01-14"). The M/D/YYYY explicit regex on line 43 would fix this, but it is only reached when `Date.parse` returns NaN — which it doesn't on Chrome/Safari for that format.

**Risk:** Wrong purchase dates in rows that use M/D/YYYY strings rather than numeric Excel serial dates.

---

### B-3 · QR URL parsing takes wrong path segment

**File:** `src/lib/parseQrPart.ts` line 9

```ts
const last = u.pathname.split("/").filter(Boolean).pop();
```

For a QR URL like `https://vendor.com/parts/FILTER-123/scan`, `pop()` returns `"scan"`, not `"FILTER-123"`. Any QR code URL where the part ID is not the final path segment silently produces an incorrect part code that will never match Excel data.

---

### B-4 · Month regex false-matches non-month words in filenames

**File:** `src/lib/periodFromFilename.ts` lines 19–24

The pattern `(jan|feb|mar|apr|may|...)[a-z]*` allows unlimited trailing letters. A file named `Parts_Maybe_2026.xlsx` would match `may` + `be` and infer period label `"May 2026"`. Since "may" is a common English word, filenames containing "maybe", "mayor", or "mayhem" followed by a year will misfired.

---

### B-5 · O(n²) array lookups in reconciliation

**File:** `src/lib/reconciliation.ts` lines 38–42

```ts
const missingReceived = expected.filter((e) => !rec.includes(e));           // O(n·m)
const missingInstalledVsExpected = expected.filter((e) => !ins.includes(e)); // O(n·m)
const receivedNotInstalled = rec.filter((r) => !ins.includes(r));           // O(n·m)
```

A `Set` is created for `expected` (line 36) and used for `extraReceived`, but the other three comparisons use `.includes()` on plain arrays. With hundreds of part codes and scan events this is slow; with thousands (large multi-month merges) it will noticeably freeze the UI.

**Fix:** create `const recSet = new Set(rec)` and `const insSet = new Set(ins)` and use `.has()`.

---

## Missing Feature / UI Gap

### M-1 · `missingInstalledVsExpected` never shown

**File:** `src/routes/ReconcilePage.tsx` lines 115–171
**Source:** `src/lib/reconciliation.ts` line 41

`buildReconciliation` computes and returns `missingInstalledVsExpected` (parts expected from Excel that have no matching "installed" scan), but `ReconcilePage` renders only three sections: "Missing receive", "Extra receive", and "Received, not installed". The fourth result — parts never scanned as installed — is silently discarded. This is arguably the most actionable field for tracking whether parts were actually fitted.

---

## Security Concerns

### S-1 · No MIME-type validation on file upload

**File:** `src/hooks/useMergedDashboard.ts` line 101

```ts
if (!/\.xlsx$/i.test(file.name)) { ... }
```

Only the filename extension is checked. A malicious or corrupt file can be renamed `.xlsx` and passed to `parseWorkbook`. A MIME-type check (`file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"`) and a file size cap would reduce the attack surface.

---

### S-2 · No size limit on uploaded workbooks

**File:** `src/hooks/useMergedDashboard.ts` lines 98–121

`file.arrayBuffer()` loads the entire file into memory with no size check. A 500 MB Excel file (or a zip bomb disguised as `.xlsx`) will attempt to consume all available browser heap memory, crashing the tab. A simple guard like the following would prevent this:

```ts
if (file.size > 50 * 1024 * 1024) {
  setUploadError("File too large (max 50 MB).");
  return;
}
```

---

## Minor / Code Quality

### Q-1 · `upsertDataBatch` changes the row `id` on re-upload

**File:** `src/lib/supabase/inventoryApi.ts` lines 73–84

The conflict key is `(organization_id, source_filename)`. When the same file is re-uploaded, Supabase updates the row including the `id` column to the new UUID. Any in-flight references to the previous UUID cached in React state silently point to a non-existent row.

---

### Q-2 · `setError` called after component unmount in `ReconcilePage`

**File:** `src/routes/ReconcilePage.tsx` line 39

```ts
.catch((e) => setError(e instanceof Error ? e.message : "Failed to load scans"))
.finally(() => { if (!cancel) setScanLoading(false); })
```

The `cancel` guard appears in `.finally()` but not in `.catch()`. If the fetch rejects after the user navigates away, `setError` is called on an unmounted component. Fix: wrap `.catch` with `if (!cancel) setError(...)`.

---

### Q-3 · Digit-only equipment search can over-match

**File:** `src/lib/parseEquipment.ts` lines 52–60

With `qDigits.length >= 2`, searching for truck "15" matches "TK# 157", "TK# 215", "TK# 1500", etc. The threshold is too low for fleet IDs that share common digit sequences. A stricter match (exact digit equality: `pd === qDigits`) or raising the threshold to `>= 3` would be more precise.

---

### Q-4 · Hardcoded part number in oil-change detection

**File:** `src/lib/answerFleetQuestion.ts` line 340

`matchesOilChangeConcept` hardcodes the part number `257004990CHV`. This works for one fleet's Delo oil but will silently miss oil changes for any other fleet using a different part code, and could produce false positives if another part shares that prefix.

---

### Q-5 · Merges sorted by upload time, not period date

**File:** `src/lib/mergeDashboard.ts` lines 30–32

```ts
const sorted = [...uploads].sort((a, b) =>
  a.meta.exportedAt.localeCompare(b.meta.exportedAt)
);
```

`exportedAt` is set to `new Date().toISOString()` at parse time (when the file was uploaded), not the period the file represents. If a user uploads March data after April data, March rows appear after April rows in the merged output.

---

### Q-6 · IndexedDB connections never closed

**File:** `src/lib/batchesDb.ts`

Every function calls `openDb()` and receives a `db` handle, but `db.close()` is never called. If the schema version is incremented later, open connections block the `versionchange` event and the upgrade will stall until all tabs are closed.

---

### Q-7 · No automated test coverage

The project has no test framework configured (no Jest, Vitest, or testing-library dependency). Every logic module in `src/lib/` is pure or near-pure and is directly testable. The most critical candidates for unit tests are:

- `parseWorkbook` — column mapping and date parsing
- `mergeDashboard` — deduplication and sort order
- `buildReconciliation` — set arithmetic correctness
- `answerFleetQuestion` — equipment extraction and month filter
- `inferPeriodLabel` — filename pattern matching
- `partCodeFromQr` — URL and plain-text cases

---

## Summary Table

| ID | File | Severity | Issue |
|---|---|---|---|
| B-1 | `src/lib/parseWorkbook.ts:136` | Bug | Empty rows not filtered from partsDetail |
| B-2 | `src/lib/parseWorkbook.ts:41` | Bug | Timezone off-by-one in string date parsing |
| B-3 | `src/lib/parseQrPart.ts:9` | Bug | Wrong URL path segment used as part code |
| B-4 | `src/lib/periodFromFilename.ts:19` | Bug | Month regex false-matches common words like "maybe" |
| B-5 | `src/lib/reconciliation.ts:38–42` | Bug + Perf | O(n²) array includes instead of Set lookups |
| M-1 | `src/routes/ReconcilePage.tsx` | Missing | `missingInstalledVsExpected` result never rendered |
| S-1 | `src/hooks/useMergedDashboard.ts:101` | Security | No MIME-type validation on file upload |
| S-2 | `src/hooks/useMergedDashboard.ts:98` | Security | No file size cap before loading into memory |
| Q-1 | `src/lib/supabase/inventoryApi.ts:73` | Minor | Row ID changes silently on Supabase re-upload |
| Q-2 | `src/routes/ReconcilePage.tsx:39` | Minor | `setError` not guarded by `cancel` flag |
| Q-3 | `src/lib/parseEquipment.ts:52` | Minor | 2-digit equipment search over-matches |
| Q-4 | `src/lib/answerFleetQuestion.ts:340` | Minor | Hardcoded part number for oil-change logic |
| Q-5 | `src/lib/mergeDashboard.ts:30` | Minor | Merges sorted by upload time, not period date |
| Q-6 | `src/lib/batchesDb.ts` | Minor | IndexedDB connections never closed |
| Q-7 | — | Minor | No automated test coverage exists |
