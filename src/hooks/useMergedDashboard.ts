import { useCallback, useEffect, useMemo, useState } from "react";
import type { DashboardPayload, StoredBatch } from "../types";
import { clearAllBatches, deleteBatch, getAllBatches, upsertBatch } from "../lib/batchesDb";
import { mergeDashboardView } from "../lib/mergeDashboard";
import { parseWorkbook } from "../lib/parseWorkbook";

export function useMergedDashboard() {
  const [uploads, setUploads] = useState<StoredBatch[]>([]);
  const [bundled, setBundled] = useState<DashboardPayload | null>(null);
  const [idbReady, setIdbReady] = useState(false);
  const [includeBundled, setIncludeBundled] = useState(true);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAllBatches()
      .then((b) => {
        if (!cancelled) setUploads(b);
      })
      .catch(() => {
        /* ignore IDB errors; UI still works from bundled JSON */
      })
      .finally(() => {
        if (!cancelled) setIdbReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/data.json");
        if (!res.ok) return;
        const json = (await res.json()) as DashboardPayload;
        if (!cancelled) setBundled(json);
      } catch {
        /* optional snapshot */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const data = useMemo(
    () => mergeDashboardView(uploads, bundled, includeBundled),
    [uploads, bundled, includeBundled]
  );

  const refreshUploads = useCallback(async () => {
    setUploads(await getAllBatches());
  }, []);

  const addFile = useCallback(
    async (file: File) => {
      setUploadError(null);
      if (!/\.xlsx$/i.test(file.name)) {
        setUploadError("Please choose an Excel .xlsx file.");
        return;
      }
      try {
        const buf = await file.arrayBuffer();
        const parsed = parseWorkbook(buf, file.name);
        const batch: StoredBatch = { ...parsed, id: crypto.randomUUID() };
        await upsertBatch(batch);
        await refreshUploads();
      } catch (e) {
        setUploadError(e instanceof Error ? e.message : "Could not read that workbook.");
      }
    },
    [refreshUploads]
  );

  const removeUpload = useCallback(
    async (id: string) => {
      await deleteBatch(id);
      await refreshUploads();
    },
    [refreshUploads]
  );

  const clearUploads = useCallback(async () => {
    await clearAllBatches();
    await refreshUploads();
  }, [refreshUploads]);

  return {
    data,
    loading: !idbReady,
    uploads,
    hasBundledSnapshot: !!bundled,
    includeBundled,
    setIncludeBundled,
    addFile,
    removeUpload,
    clearUploads,
    uploadError,
    clearUploadError: () => setUploadError(null),
  };
}
