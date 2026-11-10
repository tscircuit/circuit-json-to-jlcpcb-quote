import type { BoardFeatures } from "../types"
import type { DrillHit } from "./parse-excellon-drill"
import { fabricationFileRules } from "../jlcpcb-price-table"
import type { GerberSummary } from "./summarize-gerber"

/**
 * The via most likely to draw a small-via charge: the smallest hole, and
 * among those the smallest pad. The pad is the round flash on the top copper
 * layer at the hole's position.
 */
export const getSmallestVia = ({
  viaHits,
  topCopper,
}: {
  viaHits: DrillHit[]
  topCopper: GerberSummary
}): BoardFeatures["smallestVia"] => {
  let smallestVia: BoardFeatures["smallestVia"] = null
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
    const isSmaller =
      !smallestVia ||
      viaHit.diameterMm < smallestVia.holeDiameterMm ||
      (viaHit.diameterMm === smallestVia.holeDiameterMm &&
        padDiameterMm < smallestVia.padDiameterMm)
    if (isSmaller) {
      smallestVia = { holeDiameterMm: viaHit.diameterMm, padDiameterMm }
    }
  }
  return smallestVia
}
