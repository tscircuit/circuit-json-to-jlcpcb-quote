import type {
  AssemblyOption,
  BoardFeatures,
  JlcpcbQuoteOptions,
  PricedBomLine,
  QuoteLineItem,
} from "../types"
import { roundToCents } from "./create-quote-line-item"
import { estimateAssemblyFees } from "./estimate-assembly-fees"
import { estimatePartsCost } from "./estimate-parts-cost"
import { getEconomicUnavailableReasons } from "./select-assembly-type"

export const sumLineItems = (
  lineItems: QuoteLineItem[],
  field: "cost" | "lowCost" | "highCost",
) => roundToCents(lineItems.reduce((total, item) => total + item[field], 0))

/**
 * Price one PCBA service for the order: its fees plus the parts. A service
 * JLCPCB does not offer for the board comes back with the reason and no
 * prices.
 */
export const estimateAssemblyOption = (order: {
  assembly: AssemblyOption["assembly"]
  features: BoardFeatures
  bom: PricedBomLine[]
  assembledQuantity: number
  options: JlcpcbQuoteOptions
}): AssemblyOption => {
  const unavailableReasons =
    order.assembly === "economic" ? getEconomicUnavailableReasons(order) : []
  if (unavailableReasons.length > 0) {
    return {
      assembly: order.assembly,
      unavailableReasons,
      lineItems: [],
      total: 0,
      lowTotal: 0,
      highTotal: 0,
      perBoard: 0,
      warnings: [],
    }
  }
  const parts = estimatePartsCost(order)
  const lineItems = [...estimateAssemblyFees(order), ...parts.lineItems]
  const total = sumLineItems(lineItems, "cost")
  return {
    assembly: order.assembly,
    unavailableReasons: [],
    lineItems,
    total,
    lowTotal: sumLineItems(lineItems, "lowCost"),
    highTotal: sumLineItems(lineItems, "highCost"),
    perBoard: roundToCents(total / order.assembledQuantity),
    warnings: parts.warnings,
  }
}
