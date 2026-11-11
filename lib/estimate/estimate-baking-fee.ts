import { additionalFeePrices } from "../jlcpcb-price-table"
import type { AdditionalFee, PricedBomLine } from "../types"
import { createAdditionalFee } from "./create-quote-line-item"

/** Parts JLCPCB is likely to ask to bake before assembly */
export const getLikelyMoistureSensitiveLines = (
  bom: PricedBomLine[],
): PricedBomLine[] =>
  bom.filter((line) =>
    additionalFeePrices.componentBaking.likelyMoistureSensitiveCategory.test(
      line.part.description,
    ),
  )

/**
 * The baking fee JLCPCB asks for, by email after the order is placed, when an
 * assembled part is moisture-sensitive. It is counted, so the quote does not
 * come out low, but the low end of its range is 0 because the rule only knows
 * the part category, not the part's moisture-sensitivity level.
 */
export const estimateBakingFee = (bom: PricedBomLine[]): AdditionalFee[] => {
  const lines = getLikelyMoistureSensitiveLines(bom)
  if (lines.length === 0) return []
  const { pricePerUniquePart } = additionalFeePrices.componentBaking
  const parts = lines
    .map(
      (line) =>
        `${line.designators.join(",")} (${line.part.lcsc} ${line.part.mfr})`,
    )
    .join("; ")
  return [
    createAdditionalFee({
      key: "component_baking",
      label: `Component baking (${lines.length} parts)`,
      cost: lines.length * pricePerUniquePart,
      lowCost: 0,
      confidence: "heuristic",
      reason: `${lines.length} parts are of a kind JLCPCB treats as moisture-sensitive (LEDs with a built-in IC, modules): ${parts}. JLCPCB asks to bake each such part for 48 hours at $${pricePerUniquePart} per part.`,
      howToAvoid:
        "Use parts that are not moisture-sensitive (check the MSL in the datasheet; MSL 1 needs no baking), or decline baking when JLCPCB asks, at the risk of damaged parts.",
    }),
  ]
}
