import { estimatedPartBilling } from "../jlcpcb-price-table"
import type { JlcPart, PricedBomLine, QuoteSection } from "../types"
import { createQuoteLineItem } from "./create-quote-line-item"

/**
 * How many pieces JLCPCB bills. Basic parts are billed exactly as used.
 * Extended parts are billed with spares, up to a minimum quantity. When the
 * part source does not report those (jlcsearch), they are estimated from the
 * unit price.
 */
export const getBilledQuantity = (part: JlcPart, usedQuantity: number) => {
  if (part.isBasic) return usedQuantity
  if (part.billing) {
    return Math.max(
      usedQuantity + part.billing.spareQuantity,
      part.billing.minimumQuantity,
    )
  }
  if (part.unitPrice < estimatedPartBilling.cheapUnitPriceBelow) {
    return Math.max(
      usedQuantity + estimatedPartBilling.cheapSpareQuantity,
      estimatedPartBilling.cheapMinimumQuantity,
    )
  }
  if (part.unitPrice < estimatedPartBilling.midUnitPriceBelow) {
    return usedQuantity + estimatedPartBilling.midSpareQuantity
  }
  return usedQuantity
}

/** The price break that applies to a billed quantity. */
export const getUnitPriceForQuantity = (part: JlcPart, quantity: number) =>
  part.priceTiers.findLast((tier) => quantity >= tier.fromQuantity)
    ?.unitPrice ?? part.unitPrice

export const estimatePartsCost = (order: {
  bom: PricedBomLine[]
  assembledQuantity: number
}): QuoteSection => {
  const warnings: string[] = []
  let partsCost = 0
  let partsCostWithoutSpares = 0
  let linesWithEstimatedBilling = 0
  for (const line of order.bom) {
    const { part } = line
    const usedQuantity = line.quantity * order.assembledQuantity
    const billedQuantity = getBilledQuantity(part, usedQuantity)
    const unitPrice = getUnitPriceForQuantity(part, billedQuantity)
    partsCost += billedQuantity * unitPrice
    partsCostWithoutSpares += usedQuantity * unitPrice
    if (part.source !== "jlcpcb") linesWithEstimatedBilling++
    if (part.stock !== null && part.stock < billedQuantity) {
      warnings.push(
        `${line.designators.join(",")}: ${part.lcsc} has ${part.stock} in stock at JLCPCB, ${billedQuantity} needed`,
      )
    }
  }
  const label = `Parts for ${order.assembledQuantity} boards (${order.bom.length} unique)`
  return {
    lineItems: [
      linesWithEstimatedBilling === 0
        ? createQuoteLineItem({
            category: "components",
            key: "components",
            label,
            cost: partsCost,
            confidence: "quoted",
          })
        : createQuoteLineItem({
            category: "components",
            key: "components",
            label,
            cost: partsCost,
            lowCost:
              partsCostWithoutSpares * estimatedPartBilling.range.lowFraction,
            highCost: partsCost * estimatedPartBilling.range.highFraction,
            confidence: "calibrated",
            note: `${linesWithEstimatedBilling} lines priced without JLCPCB price breaks and billed spares`,
          }),
    ],
    warnings,
  }
}
