export interface CsvColumn {
  key: string;
  label: string;
}

const escapeCell = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'string' ? value : String(value);
  // Prefix a guard quote so a leading =, +, -, @, tab or CR can't be read as a
  // formula by the spreadsheet app that opens this CSV.
  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(guarded) ? `"${guarded.replaceAll('"', '""')}"` : guarded;
};

export const toCsv = (rows: Record<string, unknown>[], columns: CsvColumn[]): string =>
  [
    columns.map((c) => escapeCell(c.label)).join(','),
    ...rows.map((r) => columns.map((c) => escapeCell(r[c.key])).join(',')),
  ].join('\r\n');

export const downloadCsv = (fileName: string, csv: string) => {
  // Leading BOM so spreadsheet apps detect UTF-8.
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};
