import Papa from "papaparse"

/** A header-row column name, e.g. "Designator" */
type CsvColumnName = string

/** One CSV record, keyed by column name */
export type CsvRow = Partial<Record<CsvColumnName, string>>

export const parseCsvRows = (csvText: string): CsvRow[] => {
  // JLCPCB's BOM and pick-and-place files are comma-separated. Saying so
  // keeps a one-column file from failing delimiter detection.
  const parsed = Papa.parse<CsvRow>(csvText.trim(), {
    header: true,
    skipEmptyLines: true,
    delimiter: ",",
  })
  const fatalError = parsed.errors.find(
    (error) => error.type !== "FieldMismatch",
  )
  if (fatalError) {
    throw new Error(
      `Could not read CSV (row ${fatalError.row}): ${fatalError.message}`,
    )
  }
  const { data: csvRows } = parsed
  return csvRows
}
