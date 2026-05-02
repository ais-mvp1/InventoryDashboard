type Props = {
  title: string;
  value: string;
  hint?: string;
  accent?: "sky" | "emerald" | "amber" | "slate";
};

const accentClass: Record<NonNullable<Props["accent"]>, string> = {
  sky: "from-sky-500/15 to-sky-600/5 border-sky-200/80",
  emerald: "from-emerald-500/15 to-emerald-600/5 border-emerald-200/80",
  amber: "from-amber-500/15 to-amber-600/5 border-amber-200/80",
  slate: "from-slate-500/10 to-slate-600/5 border-slate-200/80",
};

export function KPICard({ title, value, hint, accent = "slate" }: Props) {
  return (
    <div
      className={`rounded-2xl border bg-gradient-to-br p-5 shadow-card ${accentClass[accent]}`}
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</p>
      <p className="font-display mt-2 text-2xl font-semibold tracking-tight text-surface-900">
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}
