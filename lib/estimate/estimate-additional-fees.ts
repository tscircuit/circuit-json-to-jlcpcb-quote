import { additionalFeePrices, capabilityLimits } from "../jlcpcb-price-table"
import type { AdditionalFee, BoardFeatures } from "../types"
import { createAdditionalFee } from "./create-quote-line-item"

interface ReviewedBoard {
  features: BoardFeatures
  quantity: number
  /** Base board price, which the fine-trace fee is a fraction of */
  boardCost: number
}

const needsKelvinTest = (features: BoardFeatures) => {
  const via = features.smallestVia
  const kelvin = additionalFeePrices.fourWireKelvinTest
  return (
    via !== null &&
    via.holeDiameterMm < kelvin.viaHoleBelowMm &&
    via.padDiameterMm <= kelvin.viaPadUpToMm
  )
}

const estimateKelvinTestFee = (board: ReviewedBoard): AdditionalFee[] => {
  const via = board.features.smallestVia
  // Only seen on rigid boards; flex boards get a warning instead.
  if (!via || board.features.material === "flex") return []
  if (!needsKelvinTest(board.features)) return []
  const kelvin = additionalFeePrices.fourWireKelvinTest
  return [
    createAdditionalFee({
      key: "four_wire_kelvin_test",
      label: "4-wire Kelvin test",
      cost: kelvin.price,
      confidence: "calibrated",
      reason: `The smallest via has a ${via.holeDiameterMm}mm hole and a ${via.padDiameterMm}mm pad. JLCPCB tests boards with via holes under ${kelvin.viaHoleBelowMm}mm and pads of ${kelvin.viaPadUpToMm}mm or less with a 4-wire Kelvin test.`,
      howToAvoid: `Use vias with a hole of at least ${kelvin.freeVia.holeDiameterMm}mm and a pad of at least ${kelvin.freeVia.padDiameterMm}mm.`,
    }),
  ]
}

const estimateVerySmallViaFee = (board: ReviewedBoard): AdditionalFee[] => {
  const { features } = board
  const via = features.smallestVia
  const { verySmallVia } = additionalFeePrices
  const holeBelowMm =
    features.numLayers >= verySmallVia.multilayerFromLayers
      ? verySmallVia.holeBelowMm.multilayer
      : verySmallVia.holeBelowMm.upTo2Layers
  if (!via || via.holeDiameterMm >= holeBelowMm) return []
  return [
    createAdditionalFee({
      key: "very_small_via",
      label: "Very small via holes",
      cost: verySmallVia.price,
      confidence: "published",
      reason: `The smallest via hole is ${via.holeDiameterMm}mm. JLCPCB charges for via holes under ${holeBelowMm}mm on ${features.numLayers}-layer boards.`,
      howToAvoid: `Use via holes of at least ${holeBelowMm}mm.`,
    }),
  ]
}

const estimateDeburringFee = (board: ReviewedBoard): AdditionalFee[] => {
  const { features, quantity } = board
  const { deburring } = additionalFeePrices
  const shortSideMm = Math.min(features.widthMm, features.heightMm)
  if (features.material === "flex" || shortSideMm >= deburring.sideBelowMm) {
    return []
  }
  const pricePerPiece =
    shortSideMm < deburring.tinySideBelowMm
      ? deburring.tinyPricePerPiece
      : deburring.pricePerPiece
  return [
    createAdditionalFee({
      key: "deburring",
      label: "Small-board deburring",
      cost: quantity * pricePerPiece,
      confidence: "published",
      reason: `The board's shorter side is ${shortSideMm}mm. JLCPCB deburrs boards with a side under ${deburring.sideBelowMm}mm by hand.`,
      howToAvoid: `Make the shorter side at least ${deburring.sideBelowMm}mm, or order the boards as a panel.`,
    }),
  ]
}

const getFineTraceRule = (
  features: BoardFeatures,
): { fraction: number; traceBelowMm: number } | null => {
  const { fineTrace } = additionalFeePrices
  const traceMm = features.minTraceWidthMm
  if (traceMm === null) return null
  if (features.material === "flex") {
    return traceMm < fineTrace.flexTraceBelowMm
      ? {
          fraction: fineTrace.flexFraction,
          traceBelowMm: fineTrace.flexTraceBelowMm,
        }
      : null
  }
  if (
    features.numLayers < fineTrace.rigidFromLayers ||
    traceMm >= fineTrace.rigidTraceBelowMm
  ) {
    return null
  }
  return {
    fraction:
      features.numLayers >= fineTrace.rigidManyLayersFrom
        ? fineTrace.rigidFractionManyLayers
        : fineTrace.rigidFraction4To8Layers,
    traceBelowMm: fineTrace.rigidTraceBelowMm,
  }
}

const estimateFineTraceFee = (board: ReviewedBoard): AdditionalFee[] => {
  const rule = getFineTraceRule(board.features)
  if (!rule) return []
  return [
    createAdditionalFee({
      key: "fine_trace",
      label: "Fine traces",
      cost: board.boardCost * rule.fraction,
      confidence: "published",
      reason: `The thinnest trace is ${board.features.minTraceWidthMm}mm. JLCPCB adds ${rule.fraction * 100}% of the board price for traces under ${rule.traceBelowMm}mm on this kind of board.`,
      howToAvoid: `Use traces and spacing of at least ${rule.traceBelowMm}mm.`,
    }),
  ]
}

/** Things JLCPCB charges for or cannot make, but that have no price here. */
const getReviewWarnings = (board: ReviewedBoard): string[] => {
  const { features } = board
  const warnings: string[] = []
  const isFlex = features.material === "flex"
  const boardAreaMm2 = features.widthMm * features.heightMm
  const { unpricedThresholds } = additionalFeePrices
  if (isFlex && needsKelvinTest(features)) {
    warnings.push(
      `The smallest via (${features.smallestVia?.holeDiameterMm}/${features.smallestVia?.padDiameterMm}mm) would draw a $${additionalFeePrices.fourWireKelvinTest.price} 4-wire Kelvin test fee on a rigid board; whether JLCPCB charges it on flex boards is not known`,
    )
  }
  if (
    features.holeCount / (boardAreaMm2 / 1e6) >
    unpricedThresholds.holesPerM2
  ) {
    warnings.push(
      `Hole density is over ${unpricedThresholds.holesPerM2} holes/m²; JLCPCB adds a fee that is not priced here`,
    )
  }
  if (boardAreaMm2 > unpricedThresholds.boardAreaMm2) {
    warnings.push(
      "Board is over 650 cm²; JLCPCB large-board fees are not priced here",
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
    traceMm >= additionalFeePrices.fineTrace.flexTraceBelowMm &&
    traceMm < capabilityLimits.flexThinCopperTraceBelowMm
  ) {
    warnings.push(
      `Trace width ${traceMm}mm needs 0.33oz copper on flex (0.5oz needs 3.5mil, 1oz needs 4mil)`,
    )
  }
  return warnings
}

/**
 * Detect the fees JLCPCB adds on top of the standard price because of the
 * board's design, each with the reason and how to avoid it.
 */
export const estimateAdditionalFees = (
  board: ReviewedBoard,
): { additionalFees: AdditionalFee[]; warnings: string[] } => ({
  additionalFees: [
    ...estimateKelvinTestFee(board),
    ...estimateVerySmallViaFee(board),
    ...estimateDeburringFee(board),
    ...estimateFineTraceFee(board),
  ],
  warnings: getReviewWarnings(board),
})
