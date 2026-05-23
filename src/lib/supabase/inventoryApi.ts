import type { DashboardPayload, StoredBatch } from "../../types";
import { getSupabase } from "./client";

type DataBatchRow = {
  id: string;
  organization_id: string;
  source_filename: string;
  period_label: string;
  exported_at: string;
  payload: DashboardPayload;
  created_at: string;
  created_by: string | null;
};

export async function fetchDataBatches(organizationId: string): Promise<StoredBatch[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("data_batches")
    .select("id, source_filename, period_label, exported_at, payload")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  const rows = (data ?? []) as Pick<
    DataBatchRow,
    "id" | "source_filename" | "period_label" | "exported_at" | "payload"
  >[];

  return rows.map((r) => {
    const p = r.payload as DashboardPayload;
    const uploadLabel = r.period_label;
    const bid = r.id;
    return {
      id: r.id,
      meta: {
        ...p.meta,
        sourceFile: r.source_filename,
        periodLabel: r.period_label,
        exportedAt: r.exported_at,
      },
      partsDetail: p.partsDetail.map((row) => ({
        ...row,
        batchId: bid,
        uploadLabel,
      })),
      installations: p.installations.map((row) => ({
        ...row,
        batchId: bid,
        uploadLabel,
      })),
    } satisfies StoredBatch;
  });
}

export async function upsertDataBatch(
  organizationId: string,
  batch: StoredBatch
): Promise<void> {
  const supabase = getSupabase();
  const payload: DashboardPayload = {
    meta: {
      sourceFile: batch.meta.sourceFile,
      exportedAt: batch.meta.exportedAt,
      periodLabel: batch.meta.periodLabel,
    },
    partsDetail: batch.partsDetail,
    installations: batch.installations,
  };

  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id ?? null;

  const { error } = await supabase.from("data_batches").upsert(
    {
      id: batch.id,
      organization_id: organizationId,
      source_filename: batch.meta.sourceFile,
      period_label: batch.meta.periodLabel,
      exported_at: batch.meta.exportedAt,
      payload,
      created_by: uid,
    },
    { onConflict: "organization_id,source_filename" }
  );
  if (error) throw error;
}

export async function deleteDataBatch(organizationId: string, batchId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("data_batches")
    .delete()
    .eq("organization_id", organizationId)
    .eq("id", batchId);
  if (error) throw error;
}

export async function clearDataBatches(organizationId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from("data_batches").delete().eq("organization_id", organizationId);
  if (error) throw error;
}

export type ScanEventType = "received" | "installed";

export async function insertScanEvent(
  organizationId: string,
  eventType: ScanEventType,
  qrRaw: string,
  partCode: string | null,
  truckTrailer: string | null
): Promise<void> {
  const supabase = getSupabase();
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id ?? null;
  const { error } = await supabase.from("scan_events").insert({
    organization_id: organizationId,
    event_type: eventType,
    qr_raw: qrRaw,
    part_code: partCode,
    truck_trailer: truckTrailer,
    created_by: uid,
  });
  if (error) throw error;
}

export type ScanEventRow = {
  id: string;
  event_type: ScanEventType;
  qr_raw: string;
  part_code: string | null;
  truck_trailer: string | null;
  created_at: string;
};

export async function fetchScanEvents(organizationId: string, limit = 2000): Promise<ScanEventRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("scan_events")
    .select("id, event_type, qr_raw, part_code, truck_trailer, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ScanEventRow[];
}

export type OrgRow = { id: string; name: string; slug: string; role: string };

export async function fetchMyOrganizations(): Promise<OrgRow[]> {
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("organization_members")
    .select("role, organizations ( id, name, slug )")
    .eq("user_id", user.id);

  if (error) throw error;

  const out: OrgRow[] = [];
  for (const row of data ?? []) {
    const o = row.organizations as { id: string; name: string; slug: string } | null;
    if (o)
      out.push({
        id: o.id,
        name: o.name,
        slug: o.slug,
        role: row.role as string,
      });
  }
  return out;
}
