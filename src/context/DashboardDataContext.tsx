import { createContext, useContext, type ReactNode } from "react";
import { useMergedDashboard } from "../hooks/useMergedDashboard";

type Value = ReturnType<typeof useMergedDashboard>;

const DashboardDataContext = createContext<Value | null>(null);

/** Single source for merged Excel + optional snapshot (shared by Dashboard and Reconciliation). */
export function DashboardDataProvider({ children }: { children: ReactNode }) {
  const value = useMergedDashboard();
  return <DashboardDataContext.Provider value={value}>{children}</DashboardDataContext.Provider>;
}

export function useOrgInventory(): Value {
  const ctx = useContext(DashboardDataContext);
  if (!ctx) throw new Error("useOrgInventory must be used within DashboardDataProvider");
  return ctx;
}
