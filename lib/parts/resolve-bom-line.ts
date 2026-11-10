import type { BomLine, LcscPartNumber, PricedBomLine } from "../types"
import { fetchFootprintJoints } from "./fetch-footprint-joints"
import { fetchJlcpcbPart } from "./fetch-jlcpcb-part"
import { fetchJlcsearchPart } from "./fetch-jlcsearch-part"
import { findPassiveOnJlcsearch } from "./find-passive-on-jlcsearch"
import type { LookupContext } from "./lookup-context"

export type BomLineResolution =
  | { status: "priced"; line: PricedBomLine }
  | { status: "unresolved"; line: BomLine; reason: string }

/**
 * Find the JLCPCB part for one BOM line, its price and its footprint's pad
 * counts. "unresolved" means the part genuinely cannot be priced (no part
 * number, not in the library, no footprint); network and format failures
 * throw.
 */
export const resolveBomLine = async (
  line: BomLine,
  ctx: LookupContext,
): Promise<BomLineResolution> => {
  let lcsc: LcscPartNumber | null = line.requestedJlcPartNumber ?? null
  let matchMethod: PricedBomLine["matchMethod"] = "jlc_part_number"
  if (!lcsc && line.passiveLookup) {
    lcsc = await findPassiveOnJlcsearch(line.passiveLookup, ctx)
    matchMethod = "passive_spec"
  }
  if (!lcsc) {
    return {
      status: "unresolved",
      line,
      reason: line.passiveLookup
        ? "no JLCPCB part with that rating and package"
        : "no JLCPCB part number",
    }
  }

  const part =
    ctx.partSource === "jlcpcb"
      ? await fetchJlcpcbPart(lcsc, ctx)
      : await fetchJlcsearchPart(lcsc, ctx)
  if (!part) {
    return {
      status: "unresolved",
      line,
      reason: `${lcsc} is not in the ${ctx.partSource} parts library`,
    }
  }
  const footprintJoints = await fetchFootprintJoints(lcsc, ctx)
  if (!footprintJoints) {
    return {
      status: "unresolved",
      line,
      reason: `${lcsc} has no footprint, so its solder joints are unknown`,
    }
  }
  return {
    status: "priced",
    line: { ...line, part, matchMethod, footprintJoints },
  }
}
