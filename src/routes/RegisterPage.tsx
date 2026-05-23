import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function RegisterPage() {
  const { cloudEnabled, signUp, authLoading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!cloudEnabled) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <p className="text-slate-700">Registration requires cloud configuration.</p>
        <Link className="mt-4 inline-block text-sky-600 underline" to="/">
          Back to dashboard
        </Link>
      </div>
    );
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const { error: err } = await signUp(email.trim(), password);
    if (err) {
      setError(err);
      return;
    }
    navigate("/setup", { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-100 p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-card">
        <h1 className="font-display text-xl font-bold text-surface-900">Create account</h1>
        <p className="mt-1 text-sm text-slate-600">Next step: name your workshop</p>
        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <label className="block">
            <span className="text-xs font-medium text-slate-500">Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none ring-sky-500/30 focus:ring-2"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-500">Password</span>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none ring-sky-500/30 focus:ring-2"
            />
          </label>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="submit"
            disabled={authLoading}
            className="w-full rounded-xl bg-surface-900 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {authLoading ? "Please wait…" : "Create account"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-600">
          Already have an account?{" "}
          <Link className="font-medium text-sky-600 underline" to="/login">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
