import type { JlcpcbQuote } from "./types"

const usd = (value: number) => `$${value.toFixed(2)}`

/** Plain-text rendering of a quote for terminals and logs. */
export const formatJlcpcbQuote = (quote: JlcpcbQuote): string => {
  const { features: f, options: o } = quote
  const lines: string[] = [
    `JLCPCB estimate (prices as of ${quote.priceTableVersion}, USD, excludes shipping/duties/tax)`,
    `Board: ${f.widthMm} x ${f.heightMm} mm, ${f.numLayers} layers, ${f.thicknessMm}mm ${f.material}, ${o.surfaceFinish}`,
    `Order: ${o.quantity} PCBs, ${o.assembly === "none" ? "no assembly" : `${o.assembledQuantity} assembled (${o.assembly} PCBA)`}`,
    f.smallestVia
      ? `Vias: ${f.viaCount}, smallest ${f.smallestVia.holeDiameterMm}/${f.smallestVia.outerDiameterMm} mm`
      : "Vias: none",
    "",
  ]
  const titles = {
    pcb: "Bare PCB",
    supplement: "Charges added after engineering review",
    assembly: "Assembly",
    components: "Parts",
  } as const
  for (const category of [
    "pcb",
    "supplement",
    "assembly",
    "components",
  ] as const) {
    const items = quote.lineItems.filter((item) => item.category === category)
    if (items.length === 0) continue
    lines.push(titles[category])
    for (const item of items) {
      const range =
        item.lowCost !== item.cost || item.highCost !== item.cost
          ? `  (${usd(item.lowCost)} to ${usd(item.highCost)})`
          : ""
      lines.push(
        `  ${item.label.padEnd(52)} ${usd(item.cost).padStart(9)}  [${item.confidence}]${range}`,
      )
    }
  }
  lines.push(
    "",
    `PCB total       ${usd(quote.pcbTotal).padStart(9)}`,
    `Assembly total  ${usd(quote.assemblyTotal).padStart(9)}`,
    `TOTAL           ${usd(quote.total).padStart(9)}   (range ${usd(quote.lowTotal)} to ${usd(quote.highTotal)})`,
  )
  const placed = quote.bom.filter((line) => line.part)
  if (placed.length > 0) {
    lines.push("", "BOM")
    for (const line of placed) {
      const part = line.part!
      const kind = part.isBasic
        ? "basic"
        : part.isPreferred
          ? "preferred"
          : "extended"
      lines.push(
        `  ${String(line.quantity).padStart(3)}x ${part.lcsc.padEnd(9)} ${part.mfr.slice(0, 24).padEnd(24)} ${kind.padEnd(9)} ${part.unitPrice.toFixed(4).padStart(8)}  ${line.designators.join(",").slice(0, 40)}`,
      )
    }
  }
  if (quote.warnings.length > 0) {
    lines.push("", "Warnings")
    for (const warning of quote.warnings) lines.push(`  - ${warning}`)
  }
  return lines.join("\n")
}
