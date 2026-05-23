import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { DashboardDataProvider } from "../context/DashboardDataContext";
import App from "../App";
import LoginPage from "./LoginPage";
import RegisterPage from "./RegisterPage";
import SetupOrgPage from "./SetupOrgPage";
import ScanPage from "./ScanPage";
import ReconcilePage from "./ReconcilePage";

/** Dashboard is always reachable at /. Scan/Reconcile pages handle missing workshop themselves. */
export function AppRoutes() {
  return (
    <BrowserRouter>
      <DashboardDataProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/setup" element={<SetupOrgPage />} />
          <Route path="/scan" element={<ScanPage />} />
          <Route path="/reconcile" element={<ReconcilePage />} />
          <Route path="/" element={<App />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </DashboardDataProvider>
    </BrowserRouter>
  );
}
