import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useOrgInventory } from "../context/DashboardDataContext";
import { buildReconciliation } from "../lib/reconciliation";
import { partCodeFromQr } from "../lib/parseQrPart";
import { fetchScanEvents } from "../lib/supabase/inventoryApi";

export default function ReconcilePage() {
  const { cloudEnabled, session, organization } = useAuth();
  const { data, loading: dataLoading } = useOrgInventory();
  const [scanLoading, setScanLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [receivedCodes, setReceivedCodes] = useState<string[]>([]);
  const [installedCodes, setInstalledCodes] = useState<string[]>([]);

  useEffect(() => {
    if (!cloudEnabled || !session || !organization) {
      setScanLoading(false);
      return;
    }
    let cancel = false;
    setScanLoading(true);
    fetchScanEvents(organization.id)
      .then((rows) => {
        if (cancel) return;
        const norm = (s: string) => s.trim().toLowerCase();
        const rec = rows
          .filter((r) => r.event_type === "received")
          .map((r) => norm(r.part_code || partCodeFromQr(r.qr_raw) || r.qr_raw))
          .filter(Boolean);
        const ins = rows
          .filter((r) => r.event_type === "installed")
          .map((r) => norm(r.part_code || partCodeFromQr(r.qr_raw) || r.qr_raw))
          .filter(Boolean);
        setReceivedCodes(rec);
        setInstalledCodes(ins);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load scans"))
      .finally(() => {
        if (!cancel) setScanLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [cloudEnabled, session, organization?.id]);

  const report = useMemo(() => {
    if (!data) return null;
    return buildReconciliation(data.partsDetail, receivedCodes, installedCodes);
  }, [data, receivedCodes, installedCodes]);

  if (!cloudEnabled) {
    return (
      <div className="mx-auto max-w-lg p-8 text-center">
        <p className="text-slate-700">Reconciliation with scans requires Supabase.</p>
        <Link className="mt-4 inline-block text-sky-600 underline" to="/">
          Dashboard
        </Link>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="mx-auto max-w-lg p-8 text-center">
        <p className="text-slate-700">Sign in to view scan reconciliation.</p>
        <Link className="mt-4 inline-block text-sky-600 underline" to="/login">
          Sign in
        </Link>
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="mx-auto max-w-lg p-8 text-center">
        <p className="text-slate-700">Select a workshop.</p>
        <Link className="mt-4 inline-block text-sky-600 underline" to="/setup">
          Setup
        </Link>
      </div>
    );
  }

  const loading = dataLoading || scanLoading;

  return (
    <div className="min-h-screen bg-surface-100 px-4 py-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-surface-900">Reconciliation</h1>
            <p className="mt-1 text-sm text-slate-600">
              Compares merged Excel <strong>part codes</strong> with QR scan events (normalized).
              Refine matching rules as your labels evolve.
            </p>
          </div>
          <Link className="text-sm font-medium text-sky-600 underline" to="/">
            Dashboard
          </Link>
        </div>

        {error ? (
          <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        {loading ? (
          <p className="text-sm text-slate-600">Loading…</p>
        ) : !data ? (
          <p className="text-sm text-slate-600">Upload monthly Excel on the dashboard first.</p>
        ) : !report ? null : (
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
              <h2 className="font-display text-sm font-semibold text-slate-800">Missing receive</h2>
              <p className="mt-1 text-xs text-slate-500">
                On Excel but no matching &quot;received&quot; scan
              </p>
              <ul className="mt-3 max-h-64 list-inside list-disc overflow-auto text-sm text-slate-800">
                {report.missingReceived.length === 0 ? (
                  <li className="list-none text-emerald-700">None</li>
                ) : (
                  report.missingReceived.map((c) => <li key={c}>{c}</li>)
                )}
              </ul>
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
              <h2 className="font-display text-sm font-semibold text-slate-800">Extra receive</h2>
              <p className="mt-1 text-xs text-slate-500">Scanned received but not on Excel list</p>
              <ul className="mt-3 max-h-64 list-inside list-disc overflow-auto text-sm text-slate-800">
                {report.extraReceived.length === 0 ? (
                  <li className="list-none text-emerald-700">None</li>
                ) : (
                  report.extraReceived.map((c) => <li key={c}>{c}</li>)
                )}
              </ul>
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
              <h2 className="font-display text-sm font-semibold text-slate-800">
                Received, not installed
              </h2>
              <p className="mt-1 text-xs text-slate-500">By part-code string match only</p>
              <ul className="mt-3 max-h-64 list-inside list-disc overflow-auto text-sm text-slate-800">
                {report.receivedNotInstalled.length === 0 ? (
                  <li className="list-none text-emerald-700">None</li>
                ) : (
                  report.receivedNotInstalled.map((c) => <li key={c}>{c}</li>)
                )}
              </ul>
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
              <h2 className="font-display text-sm font-semibold text-slate-800">Summary</h2>
              <dl className="mt-3 space-y-2 text-sm text-slate-700">
                <div className="flex justify-between">
                  <dt>Excel part codes</dt>
                  <dd className="font-semibold">{report.expectedPartCodes.length}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Received scans</dt>
                  <dd className="font-semibold">{report.receivedCodes.length}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Installed scans</dt>
                  <dd className="font-semibold">{report.installedCodes.length}</dd>
                </div>
              </dl>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
