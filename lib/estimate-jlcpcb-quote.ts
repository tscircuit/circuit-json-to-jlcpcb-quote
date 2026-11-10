import { roundToCents } from "./estimate/create-quote-line-item"
import { estimateAssemblyFees } from "./estimate/estimate-assembly-fees"
import { estimateBarePcb } from "./estimate/estimate-bare-pcb"
import { estimatePartsCost } from "./estimate/estimate-parts-cost"
import { estimateReviewCharges } from "./estimate/estimate-review-charges"
import { selectAssemblyType } from "./estimate/select-assembly-type"
import { JLCPCB_PRICE_TABLE_VERSION, orderDefaults } from "./jlcpcb-price-table"
import type {
  BoardFeatures,
  JlcpcbQuote,
  JlcpcbQuoteOptions,
  PricedBomLine,
  QuoteLineItem,
} from "./types"

const sumCosts = (
  lineItems: QuoteLineItem[],
  field: "cost" | "lowCost" | "highCost",
) => roundToCents(lineItems.reduce((total, item) => total + item[field], 0))

/**
 * Price a board from its features and priced BOM. Pure: no network, so real
 * orders can be replayed against it in tests.
 */
export const estimateJlcpcbQuote = (order: {
  features: BoardFeatures
  bom: PricedBomLine[]
  options?: JlcpcbQuoteOptions
  excludedBomLines?: JlcpcbQuote["excludedBomLines"]
  warnings?: string[]
}): JlcpcbQuote => {
  const { features, bom } = order
  const options = order.options ?? {}
  const quantity = options.quantity ?? orderDefaults.quantity
  const surfaceFinish = options.surfaceFinish ?? orderDefaults.surfaceFinish

  const barePcb = estimateBarePcb({
    features,
    quantity,
    surfaceFinish,
    confirmProductionFile: options.confirmProductionFile !== false,
  })
  const reviewCharges = estimateReviewCharges({
    features,
    quantity,
    boardCost: barePcb.boardCost,
  })
  const lineItems = [...barePcb.lineItems, ...reviewCharges.lineItems]
  const warnings = [
    ...(order.warnings ?? []),
    ...barePcb.warnings,
    ...reviewCharges.warnings,
  ]

  const selection = selectAssemblyType({
    features,
    bom,
    requestedAssembly: options.assembly,
  })
  warnings.push(...selection.warnings)
  const assembledQuantity =
    selection.assembly === "none"
      ? 0
      : (options.assembledQuantity ?? orderDefaults.assembledQuantity)
  if (selection.assembly !== "none") {
    const parts = estimatePartsCost({ bom, assembledQuantity })
    lineItems.push(
      ...estimateAssemblyFees({
        features,
        bom,
        assembly: selection.assembly,
        assembledQuantity,
        options,
      }),
      ...parts.lineItems,
    )
    warnings.push(...parts.warnings)
  }

  const pcbLineItems = lineItems.filter(
    (item) => item.category === "pcb" || item.category === "review_charge",
  )
  const assemblyLineItems = lineItems.filter(
    (item) => item.category === "assembly" || item.category === "components",
  )
  return {
    currency: "USD",
    priceTableVersion: JLCPCB_PRICE_TABLE_VERSION,
    order: {
      quantity,
      assembledQuantity,
      assembly: selection.assembly,
      surfaceFinish,
    },
    features,
    lineItems,
    bom: selection.assembly === "none" ? [] : bom,
    excludedBomLines: order.excludedBomLines ?? [],
    pcbTotal: sumCosts(pcbLineItems, "cost"),
    assemblyTotal: sumCosts(assemblyLineItems, "cost"),
    total: sumCosts(lineItems, "cost"),
    lowTotal: sumCosts(lineItems, "lowCost"),
    highTotal: sumCosts(lineItems, "highCost"),
    warnings,
  }
}
