export type CsvValue = string | number;

export function serializeBranchTrendCsv(rows: ReadonlyArray<ReadonlyArray<CsvValue>>): string {
  const csvCell = (value: CsvValue): string => {
    const text = String(value);
    const safeText = typeof value === "string" && /^[=+@\-\t\r]/.test(text)
      ? `'${text}`
      : text;
    return `"${safeText.replaceAll('"', '""')}"`;
  };

  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
