import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import type { DashboardPayload, StoredBatch } from "../types";
import { clearAllBatches, deleteBatch, getAllBatches, upsertBatch } from "../lib/batchesDb";
import { mergeDashboardView } from "../lib/mergeDashboard";
import { parseWorkbook } from "../lib/parseWorkbook";
import {
  clearDataBatches,
  deleteDataBatch,
  fetchDataBatches,
  upsertDataBatch,
} from "../lib/supabase/inventoryApi";

export function useMergedDashboard() {
  const { cloudEnabled, session, organization, authLoading } = useAuth();
  const useCloud = Boolean(cloudEnabled && session?.user && organization);

  const [localUploads, setLocalUploads] = useState<StoredBatch[]>([]);
  const [idbReady, setIdbReady] = useState(false);
  const [cloudUploads, setCloudUploads] = useState<StoredBatch[]>([]);
  const [cloudReady, setCloudReady] = useState(false);

  const [bundled, setBundled] = useState<DashboardPayload | null>(null);
  const [includeBundled, setIncludeBundled] = useState(true);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    if (useCloud) return;
    let cancelled = false;
    getAllBatches()
      .then((b) => {
        if (!cancelled) setLocalUploads(b);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIdbReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [useCloud]);

  useEffect(() => {
    if (!useCloud || !organization) {
      setCloudUploads([]);
      setCloudReady(true);
      return;
    }
    let cancelled = false;
    setCloudReady(false);
    fetchDataBatches(organization.id)
      .then((b) => {
        if (!cancelled) setCloudUploads(b);
      })
      .catch(() => {
        if (!cancelled) setCloudUploads([]);
      })
      .finally(() => {
        if (!cancelled) setCloudReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [useCloud, organization?.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/data.json");
        if (!res.ok) return;
        const json = (await res.json()) as DashboardPayload;
        if (!cancelled) setBundled(json);
      } catch {
        /* optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const uploads = useCloud ? cloudUploads : localUploads;

  const data = useMemo(
    () => mergeDashboardView(uploads, bundled, includeBundled),
    [uploads, bundled, includeBundled]
  );

  const refreshUploads = useCallback(async () => {
    if (useCloud && organization) {
      setCloudUploads(await fetchDataBatches(organization.id));
    } else {
      setLocalUploads(await getAllBatches());
    }
  }, [useCloud, organization?.id]);

  const addFile = useCallback(
    async (file: File) => {
      setUploadError(null);
      if (!/\.xlsx$/i.test(file.name)) {
        setUploadError("Please choose an Excel .xlsx file.");
        return;
      }
      try {
        const buf = await file.arrayBuffer();
        const parsed = await parseWorkbook(buf, file.name);
        const batch: StoredBatch = { ...parsed, id: crypto.randomUUID() };
        if (useCloud && organization) {
          await upsertDataBatch(organization.id, batch);
          await refreshUploads();
        } else {
          await upsertBatch(batch);
          await refreshUploads();
        }
      } catch (e) {
        setUploadError(e instanceof Error ? e.message : "Could not read that workbook.");
      }
    },
    [useCloud, organization, refreshUploads]
  );

  const removeUpload = useCallback(
    async (id: string) => {
      if (useCloud && organization) {
        await deleteDataBatch(organization.id, id);
        await refreshUploads();
      } else {
        await deleteBatch(id);
        await refreshUploads();
      }
    },
    [useCloud, organization, refreshUploads]
  );

  const clearUploads = useCallback(async () => {
    if (useCloud && organization) {
      await clearDataBatches(organization.id);
      await refreshUploads();
    } else {
      await clearAllBatches();
      await refreshUploads();
    }
  }, [useCloud, organization, refreshUploads]);

  const loading = authLoading || (useCloud ? !cloudReady : !idbReady);

  return {
    data,
    loading,
    uploads,
    dataSource: useCloud ? ("cloud" as const) : ("local" as const),
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
