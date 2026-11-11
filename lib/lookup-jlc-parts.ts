import { lookupRetry } from "./jlcpcb-price-table"
import type { LookupContext } from "./parts/lookup-context"
import {
  type BomLineResolution,
  resolveBomLine,
} from "./parts/resolve-bom-line"
import type { BomLine, JlcpcbQuote, PricedBomLine } from "./types"

/**
 * Resolve every line with a few lookups in flight at once. Each lookup is
 * mostly waiting on jlcsearch, so this cuts the time roughly by the number
 * of concurrent lookups. Results keep the BOM's order.
 */
const resolveBomLines = async (
  bom: BomLine[],
  ctx: LookupContext,
): Promise<BomLineResolution[]> => {
  const resolutions: BomLineResolution[] = []
  let nextIndex = 0
  let completedLines = 0
  const workerCount = Math.min(lookupRetry.concurrentLookups, bom.length)
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < bom.length) {
        const index = nextIndex++
        const line = bom[index]
        if (!line) continue
        resolutions[index] = await resolveBomLine(line, ctx)
        completedLines++
        ctx.onProgress?.({ completedLines, totalLines: bom.length })
      }
    }),
  )
  return resolutions
}

/**
 * Price every BOM line from jlcsearch. The input lines are not modified.
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
  for (const resolution of await resolveBomLines(bom, ctx)) {
    if (resolution.status === "unresolved") {
      unresolvedBomLines.push({
        line: resolution.line,
        reason: resolution.reason,
      })
      continue
    }
    pricedBom.push(resolution.line)
    const { part, matchMethod, designators, comment } = resolution.line
    if (matchMethod === "passive_spec") {
      warnings.push(
        `${designators.join(",")}: no part number given, matched "${comment}" to ${part.lcsc} (${part.mfr})`,
      )
    }
  }
  return { pricedBom, unresolvedBomLines, warnings }
}
