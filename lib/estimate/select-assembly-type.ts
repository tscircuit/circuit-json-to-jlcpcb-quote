import { assemblyPrices } from "../jlcpcb-price-table"
import type {
  AssemblyType,
  BoardFeatures,
  JlcpcbQuoteOptions,
  PricedBomLine,
} from "../types"

/**
 * Decide which PCBA service the order uses. "auto" picks Economic when the
 * board allows it: one populated side, rigid, and few enough layers.
 */
export const selectAssemblyType = (order: {
  features: BoardFeatures
  bom: PricedBomLine[]
  requestedAssembly: JlcpcbQuoteOptions["assembly"]
}): { assembly: AssemblyType; warnings: string[] } => {
  const { features, bom } = order
  const requestedAssembly = order.requestedAssembly ?? "auto"
  if (requestedAssembly === "none" || bom.length === 0) {
    return { assembly: "none", warnings: [] }
  }
  const isDoubleSided = features.sidesWithComponents.length > 1
  const isFlex = features.material === "flex"
  if (requestedAssembly === "auto") {
    const needsStandard =
      isDoubleSided ||
      isFlex ||
      features.numLayers > assemblyPrices.economic.maxLayers
    return { assembly: needsStandard ? "standard" : "economic", warnings: [] }
  }
  if (requestedAssembly === "economic" && isFlex) {
    throw new Error("Economic PCBA is not offered for flex boards")
  }
  if (requestedAssembly === "economic" && isDoubleSided) {
    return {
      assembly: "economic",
      warnings: [
        "Economic PCBA assembles one side only; bottom-side parts need Standard PCBA",
      ],
    }
  }
  return { assembly: requestedAssembly, warnings: [] }
}
