import type { JlcpcbQuote, PricedBomLine, QuoteLineItem } from "./types"

const CATEGORY_TITLES: Record<QuoteLineItem["category"], string> = {
  pcb: "Bare PCB",
  review_charge: "Charges added after engineering review",
  assembly: "Assembly",
  components: "Parts",
}

const formatUsd = (amount: number) => `$${amount.toFixed(2)}`

const formatLineItem = (item: QuoteLineItem) => {
  const hasRange = item.lowCost !== item.cost || item.highCost !== item.cost
  const range = hasRange
    ? `  (${formatUsd(item.lowCost)} to ${formatUsd(item.highCost)})`
    : ""
  return `  ${item.label.padEnd(52)} ${formatUsd(item.cost).padStart(9)}  [${item.confidence}]${range}`
}

const formatBomLine = (line: PricedBomLine) => {
  const { part } = line
  const library = part.isBasic
    ? "basic"
    : part.isPreferred
      ? "preferred"
      : "extended"
  return `  ${String(line.quantity).padStart(3)}x ${part.lcsc.padEnd(9)} ${part.mfr.slice(0, 24).padEnd(24)} ${library.padEnd(9)} ${part.unitPrice.toFixed(4).padStart(8)}  ${line.designators.join(",").slice(0, 40)}`
}

const formatSection = (
  quote: JlcpcbQuote,
  category: QuoteLineItem["category"],
) => {
  const items = quote.lineItems.filter((item) => item.category === category)
  if (items.length === 0) return []
  return [CATEGORY_TITLES[category], ...items.map(formatLineItem)]
}

/** Plain-text rendering of a quote for terminals and logs. */
export const formatJlcpcbQuote = (quote: JlcpcbQuote): string => {
  const { features, order } = quote
  const finish = features.material === "flex" ? "ENIG" : order.surfaceFinish
  const assembly =
    order.assembly === "none"
      ? "no assembly"
      : `${order.assembledQuantity} assembled (${order.assembly} PCBA)`
  const vias = features.smallestVia
    ? `Vias: ${features.viaCount}, smallest ${features.smallestVia.holeDiameterMm}/${features.smallestVia.padDiameterMm} mm`
    : "Vias: none"
  return [
    `JLCPCB estimate (prices as of ${quote.priceTableVersion}, USD, excludes shipping/duties/tax)`,
    `Board: ${features.widthMm} x ${features.heightMm} mm, ${features.numLayers} layers, ${features.thicknessMm}mm ${features.material}, ${finish}`,
    `Order: ${order.quantity} PCBs, ${assembly}`,
    vias,
    "",
    ...formatSection(quote, "pcb"),
    ...formatSection(quote, "review_charge"),
    ...formatSection(quote, "assembly"),
    ...formatSection(quote, "components"),
    "",
    `PCB total       ${formatUsd(quote.pcbTotal).padStart(9)}`,
    `Assembly total  ${formatUsd(quote.assemblyTotal).padStart(9)}`,
    `TOTAL           ${formatUsd(quote.total).padStart(9)}   (range ${formatUsd(quote.lowTotal)} to ${formatUsd(quote.highTotal)})`,
    ...(quote.bom.length > 0
      ? ["", "BOM", ...quote.bom.map(formatBomLine)]
      : []),
    ...(quote.warnings.length > 0
      ? ["", "Warnings", ...quote.warnings.map((warning) => `  - ${warning}`)]
      : []),
  ].join("\n")
}
