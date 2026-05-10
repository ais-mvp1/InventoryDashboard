import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import type { InstallRow, PartRow } from "../types";
import { answerFleetQuestion } from "../lib/answerFleetQuestion";
import { formatDate, formatMoney } from "../lib/parseEquipment";

type Msg =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; installs: InstallRow[]; parts: PartRow[] };

function renderBold(text: string): ReactNode {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((p, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold text-slate-900">
        {p}
      </strong>
    ) : (
      <span key={i}>{p}</span>
    )
  );
}

const EXAMPLES = [
  "When was the clutch change for 605?",
  "List all trucks where oil change was done in April",
  "Which trucks had an oil change this month?",
];

type Props = {
  installations: InstallRow[];
  parts: PartRow[];
  showPeriodColumn: boolean;
};

export function FleetChat({ installations, parts, showPeriodColumn }: Props) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>(() => [
    {
      role: "assistant",
      text: "Ask about **install dates**, **unit numbers** (605, TK# 565), or parts. **Oil change** is treated as oil filter, fuel filter, or part **257004990CHV** / DELO — combine with **April**, **this month**, or **last month**. Everything runs locally on your merged uploads.",
      installs: [],
      parts: [],
    },
  ]);
  const bottomRef = useRef<HTMLDivElement>(null);

  const canAsk = useMemo(() => installations.length + parts.length > 0, [installations, parts]);

  const send = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text) return;
      const ans = answerFleetQuestion(text, installations, parts);
      setMessages((m) => [
        ...m,
        { role: "user", text },
        {
          role: "assistant",
          text: ans.summary,
          installs: ans.citedInstalls,
          parts: ans.citedParts,
        },
      ]);
      setInput("");
      queueMicrotask(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
    },
    [installations, parts]
  );

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card">
      <div className="border-b border-slate-100 px-4 py-3 sm:px-6">
        <h2 className="font-display text-lg font-semibold text-slate-900">Ask your data</h2>
        <p className="text-sm text-slate-600">
          Natural-language questions run against merged installs and (when you ask about cost or
          revenue) parts detail — no cloud API; everything stays in this browser.
        </p>
      </div>

      <div className="flex max-h-[min(70vh,560px)] flex-col">
        <div className="min-h-[200px] flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
          {messages.map((msg, idx) =>
            msg.role === "user" ? (
              <div key={idx} className="flex justify-end">
                <div className="max-w-[90%] rounded-2xl rounded-br-md bg-sky-600 px-4 py-2 text-sm text-white shadow-sm">
                  {msg.text}
                </div>
              </div>
            ) : (
              <div key={idx} className="flex justify-start">
                <div className="max-w-[95%] rounded-2xl rounded-bl-md border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-800 shadow-sm">
                  <p className="whitespace-pre-wrap leading-relaxed">{renderBold(msg.text)}</p>
                  {msg.installs.length > 0 ? (
                    <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
                      <table className="w-full min-w-[640px] text-left text-xs">
                        <thead className="bg-slate-50 text-slate-600">
                          <tr>
                            <th className="px-3 py-2 font-medium">Equipment</th>
                            {showPeriodColumn ? (
                              <th className="px-3 py-2 font-medium">Period</th>
                            ) : null}
                            <th className="px-3 py-2 font-medium">Part</th>
                            <th className="px-3 py-2 font-medium">Install date</th>
                            <th className="px-3 py-2 font-medium">Bill #</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {msg.installs.slice(0, 25).map((r, i) => (
                            <tr key={`${r.batchId}-${r.partCode}-${r.installDate}-${i}`}>
                              <td className="px-3 py-2 text-slate-700">{r.truckTrailer ?? "—"}</td>
                              {showPeriodColumn ? (
                                <td className="px-3 py-2 text-slate-500">{r.uploadLabel ?? "—"}</td>
                              ) : null}
                              <td className="px-3 py-2">
                                <span className="font-mono">{r.partCode}</span>
                                <span className="ml-1 text-slate-600">{r.description}</span>
                              </td>
                              <td className="px-3 py-2">{formatDate(r.installDate)}</td>
                              <td className="px-3 py-2 font-mono text-slate-600">{r.billNumber}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {msg.installs.length > 25 ? (
                        <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
                          Showing 25 of {msg.installs.length} rows.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {msg.parts.length > 0 ? (
                    <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
                      <table className="w-full min-w-[560px] text-left text-xs">
                        <thead className="bg-slate-50 text-slate-600">
                          <tr>
                            <th className="px-3 py-2 font-medium">Part</th>
                            {showPeriodColumn ? (
                              <th className="px-3 py-2 font-medium">Period</th>
                            ) : null}
                            <th className="px-3 py-2 font-medium">Truck</th>
                            <th className="px-3 py-2 font-medium">Revenue</th>
                            <th className="px-3 py-2 font-medium">Total cost</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {msg.parts.slice(0, 25).map((p, i) => (
                            <tr key={`${p.batchId}-${p.partCode}-${i}`}>
                              <td className="px-3 py-2">
                                <span className="font-mono">{p.partCode}</span>
                                <span className="ml-1 text-slate-600">{p.description}</span>
                              </td>
                              {showPeriodColumn ? (
                                <td className="px-3 py-2 text-slate-500">{p.uploadLabel ?? "—"}</td>
                              ) : null}
                              <td className="px-3 py-2 text-slate-700">{p.truckTrailer ?? "—"}</td>
                              <td className="px-3 py-2">{formatMoney(p.revenue)}</td>
                              <td className="px-3 py-2">{formatMoney(p.totalCost)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
              </div>
            )
          )}
          <div ref={bottomRef} />
        </div>

        <div className="border-t border-slate-100 bg-slate-50/80 px-4 py-4 sm:px-6">
          {!canAsk ? (
            <p className="text-sm text-slate-600">Load data first — upload a monthly workbook.</p>
          ) : (
            <>
              <div className="mb-2 flex flex-wrap gap-2">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => {
                      setInput(ex);
                    }}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 transition hover:border-sky-300 hover:bg-sky-50"
                  >
                    {ex}
                  </button>
                ))}
              </div>
              <form
                className="flex flex-col gap-2 sm:flex-row sm:items-end"
                onSubmit={(e) => {
                  e.preventDefault();
                  send(input);
                }}
              >
                <label className="min-w-0 flex-1">
                  <span className="sr-only">Question</span>
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        send(input);
                      }
                    }}
                    rows={2}
                    placeholder="e.g. When was the clutch change for 605?"
                    className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-sky-500/30 placeholder:text-slate-400 focus:ring-2"
                  />
                </label>
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="shrink-0 rounded-xl bg-surface-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Ask
                </button>
              </form>
              <p className="mt-2 text-xs text-slate-500">
                Tip: include a unit number (e.g. 605) and a part word. Use{" "}
                <strong className="font-medium text-slate-600">Shift+Enter</strong> for a new line.
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
