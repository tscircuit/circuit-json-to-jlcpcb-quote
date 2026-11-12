import { fabricationPrices } from "../jlcpcb-price-table"
import type {
  BoardFeatures,
  QuoteLineItem,
  QuoteSection,
  SurfaceFinish,
} from "../types"
import { createQuoteLineItem } from "./create-quote-line-item"

interface BarePcbOrder {
  features: BoardFeatures
  quantity: number
  surfaceFinish: SurfaceFinish
  confirmProductionFile: boolean
}

export const getOrderedAreaM2 = (
  order: Pick<BarePcbOrder, "features" | "quantity">,
) => (order.features.widthMm * order.features.heightMm * order.quantity) / 1e6

const estimateFlexBoard = (order: BarePcbOrder): QuoteLineItem[] => {
  const { flex } = fabricationPrices
  const areaM2 = getOrderedAreaM2(order)
  const boardCost = flex.engineering + flex.perM2 * areaM2
  const lineItems = [
    createQuoteLineItem({
      category: "fabrication",
      key: "pcb_base",
      label: `${order.features.numLayers}-layer flex, ${order.quantity} pcs, engineering fee + ${areaM2.toFixed(3)} m²`,
      cost: boardCost,
      lowCost: boardCost * flex.range.lowFraction,
      highCost: boardCost * flex.range.highFraction,
      confidence: "heuristic",
      note: "No flex quote or order to calibrate against yet",
    }),
  ]
  if (order.features.stiffenerCount > 0) {
    const stiffenerCost = order.features.stiffenerCount * flex.stiffener
    lineItems.push(
      createQuoteLineItem({
        category: "fabrication",
        key: "stiffener",
        label: "Stiffener",
        cost: stiffenerCost,
        lowCost: stiffenerCost * flex.stiffenerRange.lowFraction,
        highCost: stiffenerCost * flex.stiffenerRange.highFraction,
        confidence: "heuristic",
      }),
    )
  }
  return lineItems
}

const getSpecialOffer = (order: BarePcbOrder): number | undefined => {
  const { features, quantity } = order
  const fitsSpecialOffer =
    features.widthMm <= fabricationPrices.specialOfferMaxSideMm &&
    features.heightMm <= fabricationPrices.specialOfferMaxSideMm
  if (!fitsSpecialOffer) return undefined
  if (quantity <= fabricationPrices.specialOffer5PcsMaxQuantity) {
    return fabricationPrices.specialOffer5Pcs.get(features.numLayers)
  }
  if (quantity <= fabricationPrices.specialOffer10PcsMaxQuantity) {
    return fabricationPrices.specialOffer10Pcs.get(features.numLayers)
  }
  return undefined
}

const estimateRigidBoard = (order: BarePcbOrder): QuoteLineItem => {
  const { features, quantity } = order
  const layers = features.numLayers
  const specialOffer = getSpecialOffer(order)
  if (specialOffer !== undefined) {
    return createQuoteLineItem({
      category: "fabrication",
      key: "pcb_base",
      label: `${layers}-layer FR4, ${quantity} pcs, special offer`,
      cost: specialOffer,
      confidence:
        quantity <= fabricationPrices.specialOffer5PcsMaxQuantity &&
        layers <= fabricationPrices.calibratedSpecialOfferMaxLayers
          ? "calibrated"
          : "heuristic",
    })
  }
  const pricing = fabricationPrices.areaPricing.get(layers)
  if (!pricing) {
    throw new Error(`No JLCPCB price for ${layers}-layer FR4 boards`)
  }
  const areaM2 = getOrderedAreaM2(order)
  const boardCost = pricing.engineering + pricing.perM2 * areaM2
  const isQuoted = fabricationPrices.quotedAreaPricingLayers.includes(layers)
  const range = isQuoted
    ? fabricationPrices.quotedRange
    : fabricationPrices.heuristicRange
  return createQuoteLineItem({
    category: "fabrication",
    key: "pcb_base",
    label: `${layers}-layer FR4, ${quantity} pcs, engineering fee + ${areaM2.toFixed(3)} m²`,
    cost: boardCost,
    lowCost: boardCost * range.lowFraction,
    highCost: boardCost * range.highFraction,
    confidence: isQuoted ? "quoted" : "heuristic",
    note: isQuoted
      ? "Fitted to one quote (144.5x82mm, 5 pcs)"
      : "No real order of this size/quantity to calibrate against yet",
  })
}

const estimateSurfaceFinish = (order: BarePcbOrder): QuoteLineItem[] => {
  const layers = order.features.numLayers
  if (order.surfaceFinish === "hasl_leaded") return []
  if (order.surfaceFinish === "hasl_lead_free") {
    const surcharge = fabricationPrices.leadFreeHaslSurcharge.get(layers)
    if (surcharge === undefined) {
      throw new Error(`No lead-free HASL price for ${layers}-layer boards`)
    }
    return [
      createQuoteLineItem({
        category: "fabrication",
        key: "lead_free_hasl",
        label: "Lead-free HASL",
        cost: surcharge,
        confidence: fabricationPrices.quotedLeadFreeHaslLayers.includes(layers)
          ? "quoted"
          : "heuristic",
      }),
    ]
  }
  const surcharge = fabricationPrices.enigSurcharge.get(layers)
  if (surcharge === undefined) {
    throw new Error(`No ENIG price for ${layers}-layer boards`)
  }
  return [
    createQuoteLineItem({
      category: "fabrication",
      key: "enig",
      label: "ENIG finish",
      cost: surcharge,
      lowCost: surcharge * fabricationPrices.enigRange.lowFraction,
      highCost: surcharge * fabricationPrices.enigRange.highFraction,
      confidence: "heuristic",
    }),
  ]
}

/**
 * Price the bare boards. `boardCost` is the base board price, which some
 * review charges are a fraction of.
 */
export const estimateBarePcb = (
  order: BarePcbOrder,
): QuoteSection & { boardCost: number } => {
  const { features } = order
  const lineItems: QuoteLineItem[] = []
  if (features.material === "flex") {
    lineItems.push(...estimateFlexBoard(order))
  } else {
    if (features.thicknessMm !== fabricationPrices.pricedRigidThicknessMm) {
      throw new Error(
        `No JLCPCB price for ${features.thicknessMm}mm FR4; only ${fabricationPrices.pricedRigidThicknessMm}mm is priced`,
      )
    }
    lineItems.push(estimateRigidBoard(order), ...estimateSurfaceFinish(order))
  }
  const boardCost = lineItems[0]?.cost
  if (boardCost === undefined) throw new Error("Bare PCB has no base price")
  if (order.confirmProductionFile) {
    lineItems.push(
      createQuoteLineItem({
        category: "fabrication",
        key: "confirm_production_file",
        label: "Confirm production file",
        cost: fabricationPrices.confirmProductionFile,
        confidence: "quoted",
      }),
    )
  }
  return { lineItems, warnings: [], boardCost }
}
