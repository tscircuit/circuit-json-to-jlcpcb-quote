import { capabilityLimits, reviewChargePrices } from "../jlcpcb-price-table"
import type { BoardFeatures, QuoteLineItem, QuoteSection } from "../types"
import { createQuoteLineItem } from "./create-quote-line-item"

interface ReviewedBoard {
  features: BoardFeatures
  quantity: number
  /** Base board price, which the fine-trace charge is a fraction of */
  boardCost: number
}

const estimateViaCharges = (board: ReviewedBoard): QuoteLineItem[] => {
  const { features } = board
  const via = features.smallestVia
  if (!via) return []
  const lineItems: QuoteLineItem[] = []
  const kelvin = reviewChargePrices.fourWireKelvinTest
  if (
    via.holeDiameterMm < kelvin.viaHoleBelowMm &&
    via.padDiameterMm <= kelvin.viaPadUpToMm
  ) {
    const label = `4-wire Kelvin test (via ${via.holeDiameterMm}/${via.padDiameterMm}mm)`
    lineItems.push(
      features.material === "flex"
        ? createQuoteLineItem({
            category: "review_charge",
            key: "four_wire_kelvin_test",
            label,
            cost: 0,
            highCost: kelvin.price,
            confidence: "heuristic",
            note: "Seen on rigid boards only; unknown whether flex boards are charged",
          })
        : createQuoteLineItem({
            category: "review_charge",
            key: "four_wire_kelvin_test",
            label,
            cost: kelvin.price,
            confidence: "calibrated",
            note: "Avoid it with vias of 0.3mm hole / 0.45mm pad or larger",
          }),
    )
  }
  const verySmallHoleBelowMm =
    features.numLayers >= reviewChargePrices.verySmallVia.multilayerFromLayers
      ? reviewChargePrices.verySmallVia.holeBelowMm.multilayer
      : reviewChargePrices.verySmallVia.holeBelowMm.upTo2Layers
  if (via.holeDiameterMm < verySmallHoleBelowMm) {
    lineItems.push(
      createQuoteLineItem({
        category: "review_charge",
        key: "very_small_via",
        label: `Very small via hole (${via.holeDiameterMm}mm)`,
        cost: reviewChargePrices.verySmallVia.price,
        confidence: "published",
      }),
    )
  }
  return lineItems
}

const estimateDeburring = (board: ReviewedBoard): QuoteLineItem[] => {
  const { features, quantity } = board
  const { deburring } = reviewChargePrices
  const shortSideMm = Math.min(features.widthMm, features.heightMm)
  if (features.material === "flex" || shortSideMm >= deburring.sideBelowMm) {
    return []
  }
  const pricePerPiece =
    shortSideMm < deburring.tinySideBelowMm
      ? deburring.tinyPricePerPiece
      : deburring.pricePerPiece
  return [
    createQuoteLineItem({
      category: "review_charge",
      key: "deburring",
      label: "Small-board deburring",
      cost: quantity * pricePerPiece,
      confidence: "published",
    }),
  ]
}

const getFineTraceFraction = (features: BoardFeatures): number | null => {
  const { fineTrace } = reviewChargePrices
  const traceMm = features.minTraceWidthMm
  if (traceMm === null) return null
  if (features.material === "flex") {
    return traceMm < fineTrace.flexTraceBelowMm ? fineTrace.flexFraction : null
  }
  if (
    features.numLayers < fineTrace.rigidFromLayers ||
    traceMm >= fineTrace.rigidTraceBelowMm
  ) {
    return null
  }
  return features.numLayers >= fineTrace.rigidManyLayersFrom
    ? fineTrace.rigidFractionManyLayers
    : fineTrace.rigidFraction4To8Layers
}

const estimateFineTrace = (board: ReviewedBoard): QuoteLineItem[] => {
  const fraction = getFineTraceFraction(board.features)
  if (fraction === null) return []
  return [
    createQuoteLineItem({
      category: "review_charge",
      key: "fine_trace",
      label: `Fine traces (${board.features.minTraceWidthMm}mm)`,
      cost: board.boardCost * fraction,
      confidence: "published",
    }),
  ]
}

/** Things JLCPCB charges for or cannot make, but that have no price here. */
const getReviewWarnings = (board: ReviewedBoard): string[] => {
  const { features } = board
  const warnings: string[] = []
  const isFlex = features.material === "flex"
  const boardAreaMm2 = features.widthMm * features.heightMm
  const { unpricedThresholds } = reviewChargePrices
  if (
    features.holeCount / (boardAreaMm2 / 1e6) >
    unpricedThresholds.holesPerM2
  ) {
    warnings.push(
      `Hole density is over ${unpricedThresholds.holesPerM2} holes/m²; JLCPCB adds a charge that is not priced here`,
    )
  }
  if (boardAreaMm2 > unpricedThresholds.boardAreaMm2) {
    warnings.push(
      "Board is over 650 cm²; JLCPCB large-board charges are not priced here",
    )
  }
  const via = features.smallestVia
  const minViaHoleMm = !isFlex
    ? capabilityLimits.minViaHoleMm.rigid
    : features.numLayers >= capabilityLimits.flexMultilayerFromLayers
      ? capabilityLimits.minViaHoleMm.flexMultilayer
      : capabilityLimits.minViaHoleMm.flexUpTo2Layers
  if (via && via.holeDiameterMm < minViaHoleMm) {
    warnings.push(
      `Via hole ${via.holeDiameterMm}mm is below JLCPCB's ${minViaHoleMm}mm minimum`,
    )
  }
  const traceMm = features.minTraceWidthMm
  if (traceMm === null) return warnings
  if (
    !isFlex &&
    features.numLayers <= capabilityLimits.rigidFineTraceMaxLayers &&
    traceMm < capabilityLimits.minTraceMmRigidUpTo2Layers
  ) {
    warnings.push(
      `Trace width ${traceMm}mm is below JLCPCB's 0.10mm minimum for 1-2 layer FR4 boards`,
    )
  }
  if (
    isFlex &&
    traceMm >= reviewChargePrices.fineTrace.flexTraceBelowMm &&
    traceMm < capabilityLimits.flexThinCopperTraceBelowMm
  ) {
    warnings.push(
      `Trace width ${traceMm}mm needs 0.33oz copper on flex (0.5oz needs 3.5mil, 1oz needs 4mil)`,
    )
  }
  return warnings
}

/**
 * Charges JLCPCB's engineers add after reviewing the files, predicted from
 * the board's geometry.
 */
export const estimateReviewCharges = (board: ReviewedBoard): QuoteSection => ({
  lineItems: [
    ...estimateViaCharges(board),
    ...estimateDeburring(board),
    ...estimateFineTrace(board),
  ],
  warnings: getReviewWarnings(board),
})
