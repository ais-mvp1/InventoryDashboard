/**
 * Derive a part-code candidate from QR text (raw label, URL last segment, trim).
 */
export function partCodeFromQr(qrRaw: string): string | null {
  const t = qrRaw.trim();
  if (!t) return null;
  try {
    const u = new URL(t);
    const last = u.pathname.split("/").filter(Boolean).pop();
    if (last) return decodeURIComponent(last).trim() || null;
  } catch {
    /* not a URL */
  }
  return t.length > 0 ? t : null;
}
