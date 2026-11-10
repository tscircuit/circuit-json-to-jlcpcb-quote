import { assemblyPrices } from "../jlcpcb-price-table"
import type {
  AssemblyType,
  BoardFeatures,
  JlcpcbQuoteOptions,
  PricedBomLine,
} from "../types"

/**
 * Why JLCPCB does not offer Economic PCBA for a board, or null when it does.
 * Economic PCBA assembles one side of a rigid board with few layers.
 */
export const getEconomicUnavailableReason = (
  features: BoardFeatures,
): string | null => {
  if (features.material === "flex") {
    return "Economic PCBA is not offered for flex boards"
  }
  if (features.sidesWithComponents.length > 1) {
    return "Economic PCBA assembles one side only and this board has parts on both sides"
  }
  if (features.numLayers > assemblyPrices.economic.maxLayers) {
    return `Economic PCBA is offered up to ${assemblyPrices.economic.maxLayers} layers`
  }
  return null
}

/**
 * Decide which PCBA service the order's totals are for. "auto" picks
 * Economic when the board allows it. Asking for Economic on a board that
 * cannot have it is an error.
 */
export const selectAssemblyType = (order: {
  features: BoardFeatures
  bom: PricedBomLine[]
  requestedAssembly: JlcpcbQuoteOptions["assembly"]
}): AssemblyType => {
  const requestedAssembly = order.requestedAssembly ?? "auto"
  if (requestedAssembly === "none" || order.bom.length === 0) return "none"
  const economicUnavailableReason = getEconomicUnavailableReason(order.features)
  if (requestedAssembly === "auto") {
    return economicUnavailableReason ? "standard" : "economic"
  }
  if (requestedAssembly === "economic" && economicUnavailableReason) {
    throw new Error(economicUnavailableReason)
  }
  return requestedAssembly
}
