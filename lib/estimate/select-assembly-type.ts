import { assemblyPrices } from "../jlcpcb-price-table"
import type {
  AssemblyType,
  BoardFeatures,
  JlcpcbQuoteOptions,
  PricedBomLine,
} from "../types"

interface AssemblyRequest {
  features: BoardFeatures
  bom: PricedBomLine[]
  assembledQuantity: number
}

/**
 * Parts that Economic PCBA cannot place, so the whole board has to be
 * Standard PCBA. Detected from the package name: Economic PCBA's smallest
 * package is 0402.
 *
 * JLCPCB also marks individual parts "Standard only" (many ESP32 modules,
 * 5050 addressable LEDs, some tiny DFN/LGA/CSP chips). jlcsearch does not
 * report that mark, so those parts are not detected here.
 */
export const getStandardOnlyLines = (bom: PricedBomLine[]): PricedBomLine[] =>
  bom.filter((line) =>
    assemblyPrices.economic.unsupportedPackagePattern.test(line.part.package),
  )

/**
 * Every reason JLCPCB does not offer Economic PCBA for an order; empty when
 * it does. From JLCPCB's published assembly capabilities.
 */
export const getEconomicUnavailableReasons = (
  request: AssemblyRequest,
): string[] => {
  const { features, assembledQuantity } = request
  const { economic } = assemblyPrices
  const reasons: string[] = []
  if (features.material === "flex") {
    reasons.push("Economic PCBA is not offered for flex boards")
  }
  if (features.sidesWithComponents.length > 1) {
    reasons.push(
      "Economic PCBA assembles one side only and this board has parts on both sides",
    )
  }
  if (!economic.layerCounts.includes(features.numLayers)) {
    reasons.push(
      `Economic PCBA is offered for ${economic.layerCounts.join(", ")}-layer boards, not ${features.numLayers}`,
    )
  }
  if (
    features.material !== "flex" &&
    (features.thicknessMm < economic.minThicknessMm ||
      features.thicknessMm > economic.maxThicknessMm)
  ) {
    reasons.push(
      `Economic PCBA is offered for boards ${economic.minThicknessMm}mm to ${economic.maxThicknessMm}mm thick, not ${features.thicknessMm}mm`,
    )
  }
  if (assembledQuantity > economic.maxAssembledQuantity) {
    reasons.push(
      `Economic PCBA is offered up to ${economic.maxAssembledQuantity} assembled boards, not ${assembledQuantity}`,
    )
  }
  const standardOnlyLines = getStandardOnlyLines(request.bom)
  if (standardOnlyLines.length > 0) {
    const parts = standardOnlyLines
      .map(
        (line) =>
          `${line.designators.join(",")} (${line.part.lcsc}, ${line.part.package})`,
      )
      .join("; ")
    reasons.push(
      `${standardOnlyLines.length} parts are Standard-only because Economic PCBA's smallest package is ${economic.smallestPackage}: ${parts}`,
    )
  }
  return reasons
}

/**
 * Decide which PCBA service the order's totals are for. "auto" picks
 * Economic when the order allows it. Asking for Economic on an order that
 * cannot have it is an error.
 */
export const selectAssemblyType = (
  request: AssemblyRequest & {
    requestedAssembly: JlcpcbQuoteOptions["assembly"]
  },
): AssemblyType => {
  const requestedAssembly = request.requestedAssembly ?? "auto"
  if (requestedAssembly === "none" || request.bom.length === 0) return "none"
  const economicUnavailableReasons = getEconomicUnavailableReasons(request)
  if (requestedAssembly === "auto") {
    return economicUnavailableReasons.length > 0 ? "standard" : "economic"
  }
  if (
    requestedAssembly === "economic" &&
    economicUnavailableReasons.length > 0
  ) {
    throw new Error(economicUnavailableReasons.join(". "))
  }
  return requestedAssembly
}
