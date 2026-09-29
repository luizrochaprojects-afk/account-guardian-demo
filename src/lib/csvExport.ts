/**
 * Convert an array of records into a CSV string and trigger a browser download.
 * Values are coerced to strings; arrays become "a; b; c"; null/undefined become "".
 */
function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s: string;
  if (Array.isArray(value)) s = value.map(v => (v == null ? "" : String(v))).join("; ");
  else if (value instanceof Date) s = value.toISOString();
  else if (typeof value === "object") s = JSON.stringify(value);
  else s = String(value);
  // Escape per RFC 4180: wrap in quotes when value contains comma, quote, or newline.
  if (/[",\r\n]/.test(s)) {
    s = `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function buildCsv(rows: Array<Record<string, unknown>>, columns: string[]): string {
  const header = columns.map(escapeCell).join(",");
  const body = rows
    .map(row => columns.map(col => escapeCell(row[col])).join(","))
    .join("\r\n");
  return body ? `${header}\r\n${body}` : header;
}

export function downloadCsv(filename: string, csv: string) {
  // Prepend BOM so Excel detects UTF-8 correctly.
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoke so download has time to start.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Slugify a view name into a safe filename fragment. */
export function slugifyForFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60) || "view";
}