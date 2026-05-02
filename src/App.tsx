import { useEffect, useMemo, useRef, useState } from "react";
import type { InstallRow, PartRow } from "./types";
import { useMergedDashboard } from "./hooks/useMergedDashboard";
import { BUNDLED_BATCH_ID } from "./lib/mergeDashboard";
import {
  collectEquipmentLabels,
  formatDate,
  formatMoney,
  monthKey,
  monthKeyFromAny,
  monthsBetween,
  rowMatchesEquipmentFilter,
  formatYearMonthLabel,
} from "./lib/parseEquipment";
import { KPICard } from "./components/KPICard";

type TabId = "overview" | "repairs" | "inventory" | "parts";

const tabs: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "repairs", label: "Repairs & installs" },
  { id: "inventory", label: "Inventory" },
  { id: "parts", label: "All parts" },
];

function matchesSearch(p: PartRow | InstallRow, q: string): boolean {
  if (!q.trim()) return true;
  const s = q.trim().toLowerCase();
  const fields = [
    p.partCode,
    "description" in p ? p.description : null,
    "vendor" in p ? p.vendor : null,
    "billNumber" in p ? p.billNumber : null,
  ];
  return fields.some((f) => (f ?? "").toLowerCase().includes(s));
}

export default function App() {
  const {
    data,
    loading,
    uploads,
    hasBundledSnapshot,
    includeBundled,
    setIncludeBundled,
    addFile,
    removeUpload,
    clearUploads,
    uploadError,
    clearUploadError,
  } = useMergedDashboard();
  const [equipment, setEquipment] = useState<string>("");
  const [month, setMonth] = useState<string>("");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<TabId>("overview");
  const [batchFilter, setBatchFilter] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const baseParts = useMemo(() => {
    if (!data) return [] as PartRow[];
    if (!batchFilter) return data.partsDetail;
    return data.partsDetail.filter((p) => p.batchId === batchFilter);
  }, [data, batchFilter]);

  const baseInstalls = useMemo(() => {
    if (!data) return [] as InstallRow[];
    if (!batchFilter) return data.installations;
    return data.installations.filter((i) => i.batchId === batchFilter);
  }, [data, batchFilter]);

  const showPeriodColumn = useMemo(() => {
    if (!data || batchFilter) return false;
    const labels = new Set(
      [...data.partsDetail, ...data.installations].map((r) => r.uploadLabel).filter(Boolean)
    );
    if (labels.size > 1) return true;
    if (equipment.trim() !== "" || search.trim() !== "") return true;
    return false;
  }, [data, batchFilter, equipment, search]);

  const equipmentOptions = useMemo(() => {
    if (!data) return [] as string[];
    const fromParts = collectEquipmentLabels(baseParts);
    const fromInst = collectEquipmentLabels(baseInstalls);
    const merged = new Set([...fromParts, ...fromInst]);
    return [...merged].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [data, baseParts, baseInstalls]);

  const monthOptions = useMemo(() => {
    if (!data) return [] as string[];
    const keys = new Set<string>();
    for (const p of baseParts) {
      const k =
        monthKey(p.purchaseDate) ??
        monthKeyFromAny(p.saleDates ?? undefined);
      if (k) keys.add(k);
    }
    for (const i of baseInstalls) {
      const k = monthKey(i.installDate) ?? monthKey(i.purchaseDate);
      if (k) keys.add(k);
    }
    return [...keys].sort().reverse();
  }, [data, baseParts, baseInstalls]);

  const filteredParts = useMemo(() => {
    return baseParts.filter((p) => {
      if (!rowMatchesEquipmentFilter(p.truckTrailer, equipment || null)) return false;
      if (month) {
        const m =
          monthKeyFromAny(p.saleDates ?? undefined) ??
          monthKey(p.purchaseDate);
        if (m !== month) return false;
      }
      return matchesSearch(p, search);
    });
  }, [baseParts, equipment, month, search]);

  const filteredInstalls = useMemo(() => {
    return baseInstalls.filter((i) => {
      if (!rowMatchesEquipmentFilter(i.truckTrailer, equipment || null)) return false;
      if (month) {
        const m = monthKey(i.installDate) ?? monthKey(i.purchaseDate);
        if (m !== month) return false;
      }
      return matchesSearch(i, search);
    });
  }, [baseInstalls, equipment, month, search]);

  useEffect(() => {
    if (!includeBundled && batchFilter === BUNDLED_BATCH_ID) setBatchFilter("");
  }, [includeBundled, batchFilter]);

  const kpis = useMemo(() => {
    const parts = filteredParts;
    const inst = filteredInstalls;
    const revenue = parts.reduce((s, p) => s + (p.revenue ?? 0), 0);
    const spend = parts.reduce((s, p) => s + (p.totalCost ?? 0), 0);
    const inStock = parts.filter((p) => p.status === "In Stock").length;
    const partial = parts.filter((p) => p.status === "Partial").length;
    const installed = parts.filter((p) => p.status === "Fully Installed").length;
    return {
      revenue,
      spend,
      inStock,
      partial,
      installed,
      installRows: inst.length,
      partLines: parts.length,
    };
  }, [filteredParts, filteredInstalls]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
          <p className="mt-4 text-sm text-slate-600">Loading dashboard…</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-surface-100 p-8">
        <div className="max-w-lg text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-sky-600">
            Fleet operations
          </p>
          <h1 className="font-display mt-2 text-3xl font-bold text-surface-900">
            Parts & inventory
          </h1>
          <p className="mt-3 text-sm text-slate-600">
            Add your monthly Excel tracker here. Each month’s file is saved in this browser and
            merged into one dashboard. Re-uploading the same file name replaces that month’s copy.
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void addFile(f);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="rounded-full bg-surface-900 px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-slate-800"
        >
          Upload monthly .xlsx
        </button>
        {hasBundledSnapshot ? (
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={includeBundled}
              onChange={(e) => setIncludeBundled(e.target.checked)}
              className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
            />
            Include packaged snapshot from this app (public/data.json)
          </label>
        ) : null}
        {uploadError ? (
          <p className="max-w-md rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
            {uploadError}{" "}
            <button type="button" className="underline" onClick={clearUploadError}>
              Dismiss
            </button>
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 sm:flex-row sm:items-end sm:justify-between lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-sky-600">
              Fleet operations
            </p>
            <h1 className="font-display text-2xl font-bold tracking-tight text-surface-900 sm:text-3xl">
              Parts & inventory
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {uploads.length > 0
                ? `${uploads.length} monthly file${uploads.length > 1 ? "s" : ""} saved in this browser`
                : data.meta.periodLabel}
              {hasBundledSnapshot && includeBundled ? " · includes packaged snapshot" : ""}
            </p>
            <p
              className="mt-0.5 max-w-2xl truncate text-xs text-slate-500"
              title={data.meta.sourceFile}
            >
              {data.meta.sourceFile}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  tab === t.id
                    ? "bg-surface-900 text-white shadow-md"
                    : "bg-surface-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
        {/* Filters */}
        <section className="mb-8 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card sm:p-6">
          <h2 className="font-display text-sm font-semibold text-slate-800">Filters</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-500">Truck / trailer</span>
              <input
                type="text"
                list="equipment-suggestions"
                value={equipment}
                onChange={(e) => setEquipment(e.target.value)}
                placeholder="e.g. TK# 565 or 565"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-sky-500/30 placeholder:text-slate-400 focus:ring-2"
              />
              <datalist id="equipment-suggestions">
                {equipmentOptions.map((e) => (
                  <option key={e} value={e} />
                ))}
              </datalist>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-500">Month</span>
              <select
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-sky-500/30 focus:ring-2"
              >
                <option value="">All months</option>
                {monthOptions.map((m) => (
                  <option key={m} value={m}>
                    {formatYearMonthLabel(m)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2 lg:col-span-2">
              <span className="text-xs font-medium text-slate-500">Product search</span>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Part code, description, vendor, bill #…"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-sky-500/30 placeholder:text-slate-400 focus:ring-2"
              />
            </label>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Type part of a unit ID (e.g. <strong>565</strong> matches <strong>TK# 565</strong>) or pick
            from suggestions. Month uses calendar month for installs on Repairs and sale/purchase
            dates on Parts. Use <strong>Repairs &amp; installs</strong> + truck + month for history;
            clear Month and search <strong>clutch</strong> to see every month that truck had that
            part (Period column shows which file/month snapshot).
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void addFile(f);
              e.target.value = "";
            }}
          />
          <div className="mt-6 border-t border-slate-100 pt-6">
            <p className="font-display text-xs font-semibold uppercase tracking-wide text-slate-500">
              Monthly Excel files
            </p>
            <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between">
              <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-slate-500">Scope</span>
                  <select
                    value={batchFilter}
                    onChange={(e) => setBatchFilter(e.target.value)}
                    className="min-w-[220px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-sky-500/30 focus:ring-2"
                  >
                    <option value="">All files (merged)</option>
                    {hasBundledSnapshot && includeBundled ? (
                      <option value={BUNDLED_BATCH_ID}>Packaged snapshot only</option>
                    ) : null}
                    {uploads.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.meta.periodLabel} — {u.meta.sourceFile}
                      </option>
                    ))}
                  </select>
                </label>
                {hasBundledSnapshot ? (
                  <label className="flex cursor-pointer items-center gap-2 self-center pt-0 text-sm text-slate-600 sm:pt-6">
                    <input
                      type="checkbox"
                      checked={includeBundled}
                      onChange={(e) => setIncludeBundled(e.target.checked)}
                      className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                    />
                    Include packaged snapshot
                  </label>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700"
                >
                  Add / replace monthly file…
                </button>
                {uploads.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        window.confirm(
                          "Remove all uploaded monthly files from this browser? The packaged snapshot is not removed."
                        )
                      )
                        void clearUploads();
                    }}
                    className="text-sm font-medium text-red-600 hover:underline"
                  >
                    Clear uploads
                  </button>
                ) : null}
              </div>
            </div>
            {uploadError ? (
              <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {uploadError}{" "}
                <button type="button" className="underline" onClick={clearUploadError}>
                  Dismiss
                </button>
              </p>
            ) : null}
            <p className="mt-3 text-xs text-slate-500">
              Same file name as an existing upload replaces that month’s copy. Data is stored only in
              this browser unless you export elsewhere.
            </p>
          </div>
        </section>

        {tab === "overview" && (
          <>
            <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KPICard
                accent="sky"
                title="Install / repair lines"
                value={String(kpis.installRows)}
                hint="Rows in install tracker (current filters)"
              />
              <KPICard
                accent="emerald"
                title="Revenue (filtered)"
                value={formatMoney(kpis.revenue)}
              />
              <KPICard
                accent="amber"
                title="Purchase total (filtered)"
                value={formatMoney(kpis.spend)}
              />
              <KPICard
                title="Part lines"
                value={String(kpis.partLines)}
                hint="Parts detail rows matching filters"
              />
            </section>
            <section className="mb-8 grid gap-4 lg:grid-cols-3">
              <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card lg:col-span-1">
                <h3 className="font-display text-sm font-semibold text-slate-800">Status mix</h3>
                <ul className="mt-4 space-y-3 text-sm">
                  <li className="flex justify-between">
                    <span className="text-slate-600">Fully installed</span>
                    <span className="font-semibold text-emerald-700">{kpis.installed}</span>
                  </li>
                  <li className="flex justify-between">
                    <span className="text-slate-600">In stock</span>
                    <span className="font-semibold text-sky-700">{kpis.inStock}</span>
                  </li>
                  <li className="flex justify-between">
                    <span className="text-slate-600">Partial</span>
                    <span className="font-semibold text-amber-700">{kpis.partial}</span>
                  </li>
                </ul>
              </div>
              <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card lg:col-span-2">
                <h3 className="font-display text-sm font-semibold text-slate-800">
                  Recent installs (top 8)
                </h3>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                        <th className="pb-2 pr-3 font-medium">Equipment</th>
                        {showPeriodColumn ? (
                          <th className="pb-2 pr-3 font-medium">Period</th>
                        ) : null}
                        <th className="pb-2 pr-3 font-medium">Part</th>
                        <th className="pb-2 pr-3 font-medium">Installed</th>
                        <th className="pb-2 font-medium">Warranty ref.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {[...filteredInstalls]
                        .sort((a, b) => (b.installDate ?? "").localeCompare(a.installDate ?? ""))
                        .slice(0, 8)
                        .map((r, i) => (
                          <tr
                            key={`${r.batchId ?? "row"}-${r.partCode}-${r.installDate}-${i}`}
                            className="text-slate-800"
                          >
                            <td className="py-2 pr-3 text-slate-600">{r.truckTrailer ?? "—"}</td>
                            {showPeriodColumn ? (
                              <td className="py-2 pr-3 text-xs text-slate-500">
                                {r.uploadLabel ?? "—"}
                              </td>
                            ) : null}
                            <td className="py-2 pr-3">
                              <span className="font-mono text-xs">{r.partCode}</span>
                              <span className="ml-2 text-slate-500">
                                {r.description?.slice(0, 40)}
                                {(r.description?.length ?? 0) > 40 ? "…" : ""}
                              </span>
                            </td>
                            <td className="py-2 pr-3">{formatDate(r.installDate)}</td>
                            <td className="py-2 text-xs text-slate-600">
                              Purchase {formatDate(r.purchaseDate)} · Bill {r.billNumber ?? "—"}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </>
        )}

        {tab === "repairs" && (
          <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card">
            <div className="border-b border-slate-100 px-4 py-3 sm:px-6">
              <h2 className="font-display text-lg font-semibold text-slate-900">
                Repairs & installs
              </h2>
              <p className="text-sm text-slate-600">
                Work tied to equipment with install date — use for warranty cross-check (purchase
                date / bill # vs vendor).
              </p>
            </div>
            <div className="max-h-[70vh] overflow-auto">
              <table className="w-full min-w-[960px] text-left text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur">
                  <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                    <th className="px-4 py-3 font-medium sm:px-6">Equipment</th>
                    {showPeriodColumn ? (
                      <th className="px-4 py-3 font-medium sm:px-6">Period</th>
                    ) : null}
                    <th className="px-4 py-3 font-medium sm:px-6">Part code</th>
                    <th className="px-4 py-3 font-medium sm:px-6">Description</th>
                    <th className="px-4 py-3 font-medium sm:px-6">Install date</th>
                    <th className="px-4 py-3 font-medium sm:px-6">Install month</th>
                    <th className="px-4 py-3 font-medium sm:px-6">Purchase date</th>
                    <th className="px-4 py-3 font-medium sm:px-6">Bill #</th>
                    <th className="px-4 py-3 font-medium sm:px-6">Months since install</th>
                    <th className="px-4 py-3 font-medium sm:px-6">Unit cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredInstalls
                    .slice()
                    .sort((a, b) => (b.installDate ?? "").localeCompare(a.installDate ?? ""))
                    .map((r, idx) => {
                      const mos = monthsBetween(r.installDate, todayIso);
                      return (
                        <tr key={`${r.batchId ?? "row"}-${r.partCode}-${r.installDate}-${idx}`} className="hover:bg-sky-50/40">
                          <td className="px-4 py-3 text-slate-700 sm:px-6">{r.truckTrailer}</td>
                          {showPeriodColumn ? (
                            <td className="px-4 py-3 text-xs text-slate-500 sm:px-6">
                              {r.uploadLabel ?? "—"}
                            </td>
                          ) : null}
                          <td className="px-4 py-3 font-mono text-xs text-slate-900 sm:px-6">
                            {r.partCode}
                          </td>
                          <td className="max-w-xs px-4 py-3 text-slate-700 sm:px-6">
                            {r.description}
                          </td>
                          <td className="px-4 py-3 text-slate-800 sm:px-6">
                            {formatDate(r.installDate)}
                          </td>
                          <td className="px-4 py-3 text-slate-700 sm:px-6">
                            {monthKey(r.installDate)
                              ? formatYearMonthLabel(monthKey(r.installDate)!)
                              : "—"}
                          </td>
                          <td className="px-4 py-3 text-slate-600 sm:px-6">
                            {formatDate(r.purchaseDate)}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-600 sm:px-6">
                            {r.billNumber}
                          </td>
                          <td className="px-4 py-3 text-slate-800 sm:px-6">
                            {mos != null ? `${mos} mo` : "—"}
                          </td>
                          <td className="px-4 py-3 sm:px-6">{formatMoney(r.unitCost)}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === "inventory" && (
          <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card">
            <div className="border-b border-slate-100 px-4 py-3 sm:px-6">
              <h2 className="font-display text-lg font-semibold text-slate-900">Inventory</h2>
              <p className="text-sm text-slate-600">
                Parts still in stock or partially used — filtered by your selections above.
              </p>
            </div>
            <div className="max-h-[70vh] overflow-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur">
                  <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                    <th className="px-4 py-3 font-medium sm:px-6">Part code</th>
                    {showPeriodColumn ? (
                      <th className="px-4 py-3 font-medium sm:px-6">Period</th>
                    ) : null}
                    <th className="px-4 py-3 font-medium sm:px-6">Description</th>
                    <th className="px-4 py-3 font-medium sm:px-6">Status</th>
                    <th className="px-4 py-3 font-medium sm:px-6">Qty purchased</th>
                    <th className="px-4 py-3 font-medium sm:px-6">Qty sold</th>
                    <th className="px-4 py-3 font-medium sm:px-6">Purchase date</th>
                    <th className="px-4 py-3 font-medium sm:px-6">Unit cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredParts
                    .filter((p) => p.status === "In Stock" || p.status === "Partial")
                    .map((p, idx) => (
                      <tr
                        key={`${p.batchId ?? "row"}-${p.partCode}-${idx}`}
                        className="hover:bg-emerald-50/40"
                      >
                        <td className="px-4 py-3 font-mono text-xs sm:px-6">{p.partCode}</td>
                        {showPeriodColumn ? (
                          <td className="px-4 py-3 text-xs text-slate-500 sm:px-6">
                            {p.uploadLabel ?? "—"}
                          </td>
                        ) : null}
                        <td className="max-w-xs px-4 py-3 text-slate-800 sm:px-6">
                          {p.description}
                        </td>
                        <td className="px-4 py-3 sm:px-6">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              p.status === "In Stock"
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-amber-100 text-amber-900"
                            }`}
                          >
                            {p.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 sm:px-6">{p.qtyPurchased ?? "—"}</td>
                        <td className="px-4 py-3 sm:px-6">{p.qtySold ?? "—"}</td>
                        <td className="px-4 py-3 text-slate-700 sm:px-6">
                          {formatDate(p.purchaseDate)}
                        </td>
                        <td className="px-4 py-3 sm:px-6">{formatMoney(p.unitCost)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === "parts" && (
          <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card">
            <div className="border-b border-slate-100 px-4 py-3 sm:px-6">
              <h2 className="font-display text-lg font-semibold text-slate-900">All parts</h2>
              <p className="text-sm text-slate-600">
                Purchases, sales, revenue, and assignment where applicable.
              </p>
            </div>
            <div className="max-h-[70vh] overflow-auto">
              <table className="w-full min-w-[1100px] text-left text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur">
                  <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                    <th className="px-4 py-3 font-medium sm:px-6">Part code</th>
                    {showPeriodColumn ? (
                      <th className="px-4 py-3 font-medium sm:px-6">Period</th>
                    ) : null}
                    <th className="px-4 py-3 font-medium sm:px-6">Description</th>
                    <th className="px-4 py-3 font-medium sm:px-6">Truck / trailer</th>
                    <th className="px-4 py-3 font-medium sm:px-6">Status</th>
                    <th className="px-4 py-3 font-medium sm:px-6">Sale date(s)</th>
                    <th className="px-4 py-3 font-medium sm:px-6">Revenue</th>
                    <th className="px-4 py-3 font-medium sm:px-6">Total cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredParts.map((p, idx) => (
                    <tr key={`${p.batchId ?? "row"}-${p.partCode}-${idx}`} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3 font-mono text-xs sm:px-6">{p.partCode}</td>
                      {showPeriodColumn ? (
                        <td className="px-4 py-3 text-xs text-slate-500 sm:px-6">
                          {p.uploadLabel ?? "—"}
                        </td>
                      ) : null}
                      <td className="max-w-xs px-4 py-3 text-slate-800 sm:px-6">
                        {p.description}
                      </td>
                      <td className="px-4 py-3 text-slate-700 sm:px-6">{p.truckTrailer ?? "—"}</td>
                      <td className="px-4 py-3 sm:px-6">{p.status ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-700 sm:px-6">{p.saleDates ?? "—"}</td>
                      <td className="px-4 py-3 sm:px-6">{formatMoney(p.revenue)}</td>
                      <td className="px-4 py-3 sm:px-6">{formatMoney(p.totalCost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>

      <footer className="border-t border-slate-200/80 bg-white/80 py-6 text-center text-xs text-slate-500">
        {uploads.length > 0
          ? `${uploads.length} monthly upload(s) stored in this browser · `
          : ""}
        Parts dashboard
      </footer>
    </div>
  );
}
