import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";
import { useAuth } from "../context/AuthContext";
import { insertScanEvent } from "../lib/supabase/inventoryApi";
import { partCodeFromQr } from "../lib/parseQrPart";

type Mode = "received" | "installed";

export default function ScanPage() {
  const { cloudEnabled, session, organization } = useAuth();
  const [mode, setMode] = useState<Mode>("received");
  const [truck, setTruck] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  const stopScanner = useCallback(async () => {
    const s = scannerRef.current;
    scannerRef.current = null;
    if (s) {
      try {
        await s.stop();
      } catch {
        /* */
      }
    }
    setRunning(false);
  }, []);

  useEffect(() => {
    return () => {
      void stopScanner();
    };
  }, [stopScanner]);

  const startScanner = async () => {
    if (!organization) return;
    setMessage(null);
    await stopScanner();
    setRunning(true);
    const regionId = "qr-reader-inner";
    const html5 = new Html5Qrcode(regionId, { verbose: false });
    scannerRef.current = html5;
    try {
      await html5.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 280, height: 280 } },
        async (text) => {
          try {
            const part = partCodeFromQr(text);
            await insertScanEvent(
              organization.id,
              mode,
              text,
              part,
              truck.trim() ? truck.trim() : null
            );
            setMessage("Recorded successfully.");
            if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(60);
            await stopScanner();
          } catch (e) {
            setMessage(e instanceof Error ? e.message : "Could not save scan.");
            await stopScanner();
          }
        },
        () => {}
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Camera failed to start.");
      await stopScanner();
    }
  };

  if (!cloudEnabled) {
    return (
      <div className="mx-auto max-w-lg p-8 text-center">
        <p className="text-slate-700">QR scanning requires cloud configuration (Supabase).</p>
        <Link className="mt-4 inline-block text-sky-600 underline" to="/">
          Dashboard
        </Link>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="mx-auto max-w-lg p-8 text-center">
        <p className="text-slate-700">Sign in to record scans for your workshop.</p>
        <Link className="mt-4 inline-block text-sky-600 underline" to="/login">
          Sign in
        </Link>
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="mx-auto max-w-lg p-8 text-center">
        <p className="text-slate-700">Create or select a workshop first.</p>
        <Link className="mt-4 inline-block text-sky-600 underline" to="/setup">
          Workshop setup
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-100 px-4 py-8">
      <div className="mx-auto max-w-lg">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="font-display text-2xl font-bold text-surface-900">Scan</h1>
          <Link className="text-sm font-medium text-sky-600 underline" to="/">
            Dashboard
          </Link>
        </div>
        <p className="mb-4 text-sm text-slate-600">
          Choose what this scan means, optionally set truck/trailer, then start the camera. One
          barcode is saved per start (then camera stops).
        </p>

        <div className="mb-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMode("received")}
            className={`rounded-xl py-3 text-sm font-semibold ${
              mode === "received"
                ? "bg-emerald-600 text-white"
                : "bg-white text-slate-700 ring-1 ring-slate-200"
            }`}
          >
            Received on site
          </button>
          <button
            type="button"
            onClick={() => setMode("installed")}
            className={`rounded-xl py-3 text-sm font-semibold ${
              mode === "installed"
                ? "bg-sky-600 text-white"
                : "bg-white text-slate-700 ring-1 ring-slate-200"
            }`}
          >
            Installed
          </button>
        </div>

        <label className="mb-4 block">
          <span className="text-xs font-medium text-slate-500">Truck / trailer (optional)</span>
          <input
            value={truck}
            onChange={(e) => setTruck(e.target.value)}
            placeholder="e.g. TK# 565"
            disabled={running}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-sky-500/30 focus:ring-2"
          />
        </label>

        <div
          id="qr-reader-inner"
          className="mx-auto mb-4 min-h-[280px] w-full max-w-sm overflow-hidden rounded-2xl bg-black/90"
        />

        <div className="flex flex-wrap gap-2">
          {!running ? (
            <button
              type="button"
              onClick={() => void startScanner()}
              className="flex-1 rounded-xl bg-surface-900 py-3 text-sm font-semibold text-white"
            >
              Start camera
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void stopScanner()}
              className="flex-1 rounded-xl border border-slate-300 bg-white py-3 text-sm font-semibold text-slate-800"
            >
              Stop
            </button>
          )}
        </div>

        {message ? (
          <p className="mt-4 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800">
            {message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
