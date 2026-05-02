/** Set when multiple monthly files are merged; used for filtering and display */
export type PartRow = {
  batchId?: string;
  /** Period label from the workbook (e.g. April 2026) */
  uploadLabel?: string;
  partCode: string | null;
  description: string | null;
  vendor: string | null;
  billNumber: string | null;
  purchaseDate: string | null;
  qtyPurchased: number | null;
  unitCost: number | null;
  totalCost: number | null;
  qtySold: number | null;
  saleDates: string | null;
  invoiceNumbers: string | null;
  truckTrailer: string | null;
  revenue: number | null;
  status: string | null;
};

export type InstallRow = {
  batchId?: string;
  uploadLabel?: string;
  truckTrailer: string | null;
  partCode: string | null;
  description: string | null;
  vendor: string | null;
  billNumber: string | null;
  purchaseDate: string | null;
  installDate: string | null;
  invoiceNumber: number | null;
  unitCost: number | null;
};

export type DashboardPayload = {
  meta: {
    sourceFile: string;
    exportedAt: string;
    periodLabel: string;
  };
  partsDetail: PartRow[];
  installations: InstallRow[];
};

/** Persisted upload (IndexedDB) */
export type StoredBatch = DashboardPayload & { id: string };
