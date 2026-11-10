import type { BomLine, LcscPartNumber } from "../types"
import { getPassiveLookup } from "./get-passive-lookup"
import { parseCsvRows } from "./parse-csv-rows"

/** Part number, or comment + footprint for rows without one */
type BomGroupKey = string

const LCSC_PART_NUMBER = /^C\d+$/i

/**
 * Group the rows of a JLCPCB BOM CSV into lines. Rows sharing a part number
 * (or, lacking one, the same comment and footprint) share a line.
 */
export const getBomLinesFromCsv = (bomCsv: string): BomLine[] => {
  const linesByGroup = new Map<BomGroupKey, BomLine>()
  for (const bomRow of parseCsvRows(bomCsv)) {
    const designators = (bomRow.Designator ?? "")
      .split(/[,\s]+/)
      .filter(Boolean)
    if (designators.length === 0) continue
    const partNumber = (
      bomRow["JLCPCB Part #"] ??
      bomRow["LCSC Part #"] ??
      bomRow.LCSC ??
      ""
    ).trim()
    const comment = bomRow.Comment || bomRow.Value || ""
    const groupKey: BomGroupKey = partNumber || `${comment}:${bomRow.Footprint}`
    const existingLine = linesByGroup.get(groupKey)
    if (existingLine) {
      linesByGroup.set(groupKey, {
        ...existingLine,
        designators: [...existingLine.designators, ...designators],
        quantity: existingLine.quantity + designators.length,
      })
      continue
    }
    const requestedJlcPartNumber: LcscPartNumber | undefined =
      LCSC_PART_NUMBER.test(partNumber) ? partNumber.toUpperCase() : undefined
    linesByGroup.set(groupKey, {
      designators,
      quantity: designators.length,
      comment,
      requestedJlcPartNumber,
      passiveLookup: requestedJlcPartNumber
        ? undefined
        : getPassiveLookup(bomRow),
    })
  }
  return [...linesByGroup.values()]
}
