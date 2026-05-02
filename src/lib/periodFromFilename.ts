const MONTH_PREFIX: Record<string, string> = {
  jan: "January",
  feb: "February",
  mar: "March",
  apr: "April",
  may: "May",
  jun: "June",
  jul: "July",
  aug: "August",
  sep: "September",
  oct: "October",
  nov: "November",
  dec: "December",
};

/** Best-effort label from filenames like Parts_Tracker_Apr2026.xlsx or Parts_May_2026.xlsx */
export function inferPeriodLabel(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/i, "").replace(/[_]+/g, " ");
  const monYear = base.match(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*[-]?\s*(20\d{2})\b/i
  );
  if (monYear) {
    const key = monYear[1].toLowerCase().slice(0, 3);
    const monthName = MONTH_PREFIX[key] ?? monYear[1];
    return `${monthName} ${monYear[2]}`;
  }
  const isoish = base.match(/\b(20\d{2})[-/](\d{2})\b/);
  if (isoish) return `${isoish[1]}-${isoish[2]}`;
  const dmy = base.match(/\b(\d{2})[-/](20\d{2})\b/);
  if (dmy) return `${dmy[2]}-${dmy[1]}`;
  const t = base.trim();
  return t.length > 0 ? t : "Imported workbook";
}
