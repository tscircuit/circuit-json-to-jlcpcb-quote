import { fabricationFileRules } from "../jlcpcb-price-table"
import type { ViaSize } from "../types"
import type { DrillHit } from "./parse-excellon-drill"
import type { GerberSummary } from "./summarize-gerber"

/**
 * Distinct drill/pad pairs, ordered by hole size and then pad size.
 * A via's pad is the round flash at the hole on the top copper layer.
 */
export const getViaSizes = ({
  viaHits,
  topCopper,
}: {
  viaHits: DrillHit[]
  topCopper: GerberSummary
}): ViaSize[] => {
  const viaSizes = new Map<string, ViaSize>()
  for (const viaHit of viaHits) {
    // Drill files carry fewer decimals than Gerbers, so match by distance.
    const padDiameterMm = topCopper.flashes.find(
      (flash) =>
        flash.diameterMm !== null &&
        Math.hypot(flash.x - viaHit.x, flash.y - viaHit.y) <=
          fabricationFileRules.viaPadPositionToleranceMm,
    )?.diameterMm
    if (!padDiameterMm) {
      throw new Error(
        `No round pad on the top copper layer for the ${viaHit.diameterMm}mm via at (${viaHit.x}, ${viaHit.y})`,
      )
    }
    const holeDiameterMm = viaHit.diameterMm
    viaSizes.set(`${holeDiameterMm}/${padDiameterMm}`, {
      holeDiameterMm,
      padDiameterMm,
    })
  }
  return [...viaSizes.values()].sort(
    (a, b) =>
      a.holeDiameterMm - b.holeDiameterMm || a.padDiameterMm - b.padDiameterMm,
  )
}
