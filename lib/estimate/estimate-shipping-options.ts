import { landedCostPrices } from "../jlcpcb-price-table"
import type {
  BoardFeatures,
  QuoteLineItem,
  ShippingCarrier,
  ShippingOption,
} from "../types"
import { createQuoteLineItem, roundToCents } from "./create-quote-line-item"
import { sumLineItems } from "./estimate-assembly-option"

const CARRIERS: ShippingCarrier[] = ["dhl", "ups"]

interface ShippedOrder {
  features: BoardFeatures
  quantity: number
  assembledQuantity: number
  /** JLCPCB's "Merchandise Total" and its range */
  merchandise: { total: number; lowTotal: number; highTotal: number }
  selectedCarrier: ShippingCarrier
  /** Exact shipping cost for `selectedCarrier`, from JLCPCB's checkout */
  shippingCost?: number
  shippingWeightKg?: number
  salesTaxRate: number
}

/** Order weight as JLCPCB's quote page reports it, packaging included. */
export const estimateOrderWeightKg = (order: {
  features: BoardFeatures
  quantity: number
  assembledQuantity: number
}): number => {
  const { weight } = landedCostPrices
  const boardAreaCm2 = (order.features.widthMm * order.features.heightMm) / 100
  const bareGrams =
    weight.bareGramsPerCm2PerMm *
    boardAreaCm2 *
    order.features.thicknessMm *
    order.quantity
  const assemblyGrams =
    order.assembledQuantity > 0
      ? weight.assemblyPackagingGrams +
        weight.gramsPerAssembledBoard * order.assembledQuantity
      : 0
  return Math.round(bareGrams + assemblyGrams) / 1000
}

const estimateShippingLineItem = (
  carrier: ShippingCarrier,
  order: ShippedOrder & { weightKg: number },
): QuoteLineItem => {
  const prices = landedCostPrices.carriers[carrier]
  const label = `Shipping, ${prices.service} (${order.weightKg}kg)`
  if (carrier === order.selectedCarrier && order.shippingCost !== undefined) {
    return createQuoteLineItem({
      category: "shipping_and_taxes",
      key: "shipping",
      label,
      cost: order.shippingCost,
      confidence: "quoted",
    })
  }
  const cost = prices.shippingBase + prices.shippingPerKg * order.weightKg
  const range = landedCostPrices.estimatedShippingRange
  return createQuoteLineItem({
    category: "shipping_and_taxes",
    key: "shipping",
    label,
    cost,
    lowCost: cost * range.lowFraction,
    highCost: cost * range.highFraction,
    confidence: "heuristic",
    note: "Estimated from the order weight; JLCPCB's checkout shows the exact cost",
  })
}

/** A charge that is a fixed fraction of the merchandise total */
const createMerchandiseTax = (tax: {
  key: string
  label: string
  rate: number
  merchandise: ShippedOrder["merchandise"]
}) =>
  createQuoteLineItem({
    category: "shipping_and_taxes",
    key: tax.key,
    label: `${tax.label} (${roundToCents(tax.rate * 100)}% of merchandise)`,
    cost: tax.merchandise.total * tax.rate,
    lowCost: tax.merchandise.lowTotal * tax.rate,
    highCost: tax.merchandise.highTotal * tax.rate,
    confidence: "calibrated",
  })

const estimateShippingOption = (
  carrier: ShippingCarrier,
  order: ShippedOrder & { weightKg: number },
): ShippingOption => {
  const prices = landedCostPrices.carriers[carrier]
  const lineItems = [
    estimateShippingLineItem(carrier, order),
    createMerchandiseTax({
      key: "import_taxes",
      label: "Import duties and taxes",
      rate: landedCostPrices.importTaxRate,
      merchandise: order.merchandise,
    }),
    createQuoteLineItem({
      category: "shipping_and_taxes",
      key: "disbursement_fee",
      label: "Duty and tax disbursement fee",
      cost: prices.disbursementFee,
      confidence: "quoted",
    }),
    createMerchandiseTax({
      key: "sales_tax",
      label: "Sales tax",
      rate: order.salesTaxRate,
      merchandise: order.merchandise,
    }),
  ]
  const total = sumLineItems(lineItems, "cost")
  const lowTotal = sumLineItems(lineItems, "lowCost")
  const highTotal = sumLineItems(lineItems, "highCost")
  return {
    carrier,
    service: prices.service,
    weightKg: order.weightKg,
    lineItems,
    total,
    lowTotal,
    highTotal,
    grandTotal: roundToCents(order.merchandise.total + total),
    lowGrandTotal: roundToCents(order.merchandise.lowTotal + lowTotal),
    highGrandTotal: roundToCents(order.merchandise.highTotal + highTotal),
  }
}

/**
 * What JLCPCB's checkout adds to the merchandise total for US delivery with
 * duties paid: shipping, import duties and taxes, the carrier's disbursement
 * fee, and state sales tax. One option per carrier.
 */
export const estimateShippingOptions = (
  order: ShippedOrder,
): ShippingOption[] => {
  const weightKg = order.shippingWeightKg ?? estimateOrderWeightKg(order)
  return CARRIERS.map((carrier) =>
    estimateShippingOption(carrier, { ...order, weightKg }),
  )
}
