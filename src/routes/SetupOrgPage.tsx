import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function SetupOrgPage() {
  const {
    cloudEnabled,
    session,
    organizations,
    createOrganization,
    authLoading,
    orgLoading,
    orgLoadError,
    refreshOrganizations,
  } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!cloudEnabled) {
    return <Navigate to="/" replace />;
  }

  if (!authLoading && !session) {
    return <Navigate to="/login" replace />;
  }

  if (!authLoading && organizations.length > 0) {
    return <Navigate to="/" replace />;
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { error: err } = await createOrganization(name.trim());
      if (err) {
        setError(err);
        return;
      }
      navigate("/", { replace: true });
    } finally {
      setSubmitting(false);
    }
  };

  const busy = submitting || orgLoading;

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-100 p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-card">
        <h1 className="font-display text-xl font-bold text-surface-900">Create workshop</h1>
        <p className="mt-1 text-sm text-slate-600">
          Required for cloud scan and shared Excel storage. You can still open the full dashboard
          without a workshop (local uploads in this browser).
        </p>
        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <label className="block">
            <span className="text-xs font-medium text-slate-500">Workshop name</span>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
              placeholder="e.g. NTL Sacramento"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none ring-sky-500/30 focus:ring-2 disabled:opacity-60"
            />
          </label>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {orgLoadError && !error ? (
            <p className="text-sm text-amber-800">{orgLoadError}</p>
          ) : null}
          <button
            type="submit"
            disabled={busy || authLoading}
            className="w-full rounded-xl bg-sky-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {submitting ? "Creating…" : orgLoading ? "Loading workshops…" : "Create workshop"}
          </button>
        </form>
        <div className="mt-4 flex flex-col gap-2 text-center text-sm">
          <button
            type="button"
            disabled={orgLoading}
            onClick={() => void refreshOrganizations()}
            className="text-sky-600 underline disabled:opacity-50"
          >
            Refresh workshop list
          </button>
          <Link className="font-medium text-surface-900 underline" to="/">
            Open full dashboard (no workshop required)
          </Link>
          <Link className="text-slate-500 underline" to="/login">
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
