import type { LookupContext } from "./parts/lookup-context"
import { resolveBomLine } from "./parts/resolve-bom-line"
import type { BomLine, JlcpcbQuote, PricedBomLine } from "./types"

/**
 * Price every BOM line. Lines are looked up one at a time because jlcsearch
 * rejects bursts. The input lines are not modified.
 */
export const lookupJlcParts = async (
  bom: BomLine[],
  ctx: LookupContext,
): Promise<{
  pricedBom: PricedBomLine[]
  unresolvedBomLines: JlcpcbQuote["excludedBomLines"]
  warnings: string[]
}> => {
  const pricedBom: PricedBomLine[] = []
  const unresolvedBomLines: JlcpcbQuote["excludedBomLines"] = []
  const warnings: string[] = []
  for (const line of bom) {
    const resolution = await resolveBomLine(line, ctx)
    if (resolution.status === "unresolved") {
      unresolvedBomLines.push({ line, reason: resolution.reason })
      continue
    }
    pricedBom.push(resolution.line)
    const { part, matchMethod, designators } = resolution.line
    if (matchMethod === "passive_spec") {
      warnings.push(
        `${designators.join(",")}: no part number given, matched "${line.comment}" to ${part.lcsc} (${part.mfr})`,
      )
    }
  }
  return { pricedBom, unresolvedBomLines, warnings }
}
