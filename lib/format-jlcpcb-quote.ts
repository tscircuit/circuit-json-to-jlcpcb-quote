import type {
  AdditionalFee,
  AssemblyOption,
  JlcpcbQuote,
  PricedBomLine,
  QuoteLineItem,
  QuoteSummaryRow,
  ShippingOption,
} from "./types"

const LABEL_WIDTH = 52
const AMOUNT_WIDTH = 9

const formatUsd = (amount: number) => `$${amount.toFixed(2)}`

const formatHeading = (heading: {
  title: string
  total: number
  note: string
}) =>
  `${heading.title.padEnd(LABEL_WIDTH + 2)} ${formatUsd(heading.total).padStart(AMOUNT_WIDTH)}  ${heading.note}`

const formatLineItem = (item: QuoteLineItem) => {
  const hasRange = item.lowCost !== item.cost || item.highCost !== item.cost
  const range = hasRange
    ? `  (${formatUsd(item.lowCost)} to ${formatUsd(item.highCost)})`
    : ""
  return `  ${item.label.padEnd(LABEL_WIDTH)} ${formatUsd(item.cost).padStart(AMOUNT_WIDTH)}  [${item.confidence}]${range}`
}

const formatAdditionalFee = (fee: AdditionalFee) => [
  formatLineItem(fee),
  `      Why:   ${fee.reason}`,
  `      Avoid: ${fee.howToAvoid}`,
]

const formatAdditionalFees = (quote: JlcpcbQuote) => {
  const count = quote.additionalFees.length
  if (count === 0) return ["Additional fees: none detected"]
  return [
    formatHeading({
      title: `Additional fees (${count} detected)`,
      total: quote.additionalFeesTotal,
      note: "not part of the fabrication or assembly price",
    }),
    ...quote.additionalFees.flatMap(formatAdditionalFee),
  ]
}

const formatAssemblyOption = (
  option: AssemblyOption,
  quote: JlcpcbQuote,
): string[] => {
  const title = `Assembly, ${option.assembly} PCBA (${quote.order.assembledQuantity} boards)`
  if (option.unavailableReasons.length > 0) {
    return [
      "",
      `${title}: not available, the board needs Standard PCBA`,
      ...option.unavailableReasons.map((reason) => `  - ${reason}`),
    ]
  }
  const isSelected = option.assembly === quote.order.assembly
  return [
    "",
    formatHeading({
      title,
      total: option.total,
      note: `${formatUsd(option.perBoard)} per board${isSelected ? "  <- used in the total" : ""}`,
    }),
    ...option.lineItems.map(formatLineItem),
  ]
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

const formatShippingOption = (
  option: ShippingOption,
  quote: JlcpcbQuote,
): string[] => [
  "",
  formatHeading({
    title: `Shipping and taxes, ${option.service}`,
    total: option.total,
    note: `grand total ${formatUsd(option.grandTotal)}${option.carrier === quote.order.carrier ? "  <- used in the grand total" : ""}`,
  }),
  ...option.lineItems.map(formatLineItem),
]

const PER_BOARD_UNITS: Record<QuoteSummaryRow["perBoardUnit"], string> = {
  pcb: "PCB",
  assembled_board: "assembled board",
}

const formatSummaryRow = (row: QuoteSummaryRow) =>
  `  ${row.label.padEnd(LABEL_WIDTH)} ${formatUsd(row.total).padStart(AMOUNT_WIDTH)}  ${`${formatUsd(row.perBoard)} / ${PER_BOARD_UNITS[row.perBoardUnit]}`.padStart(26)}`

const formatSummary = (quote: JlcpcbQuote): string[] => [
  `  ${"".padEnd(LABEL_WIDTH)} ${"Total".padStart(AMOUNT_WIDTH)}  ${"Per board".padStart(26)}`,
  ...quote.summary.rows.map(formatSummaryRow),
  `  ${"-".repeat(LABEL_WIDTH + AMOUNT_WIDTH + 29)}`,
  formatSummaryRow(quote.summary.grandTotal),
  `  ${`(range ${formatUsd(quote.summary.grandTotal.lowTotal)} to ${formatUsd(quote.summary.grandTotal.highTotal)})`.padStart(LABEL_WIDTH + AMOUNT_WIDTH + 1)}`,
  "",
  `  ${quote.destination.note}`,
]

/** Plain-text rendering of a quote for terminals and logs. */
export const formatJlcpcbQuote = (quote: JlcpcbQuote): string => {
  const { features, order } = quote
  const finish = features.material === "flex" ? "ENIG" : order.surfaceFinish
  const vias = features.smallestVia
    ? `Vias: ${features.viaCount}, smallest ${features.smallestVia.holeDiameterMm}/${features.smallestVia.padDiameterMm} mm`
    : "Vias: none"
  const totalNote =
    order.assembly === "none"
      ? "fabrication + additional fees"
      : `fabrication + additional fees + ${order.assembly} PCBA`
  return [
    `JLCPCB estimate (prices as of ${quote.priceTableVersion}, USD, delivery to the US with duties paid)`,
    `Board: ${features.widthMm} x ${features.heightMm} mm, ${features.numLayers} layers, ${features.thicknessMm}mm ${features.material}, ${finish}`,
    vias,
    "",
    ...formatSummary(quote),
    "",
    "DETAILS",
    "",
    formatHeading({
      title: `Board fabrication (${order.quantity} boards)`,
      total: quote.fabricationTotal,
      note: `${formatUsd(quote.fabricationPerBoard)} per board`,
    }),
    ...quote.fabricationLineItems.map(formatLineItem),
    "",
    ...formatAdditionalFees(quote),
    ...quote.assemblyOptions.flatMap((option) =>
      formatAssemblyOption(option, quote),
    ),
    "",
    formatHeading({
      title: "MERCHANDISE TOTAL",
      total: quote.total,
      note: `${totalNote}  (range ${formatUsd(quote.lowTotal)} to ${formatUsd(quote.highTotal)})`,
    }),
    ...quote.shippingOptions.flatMap((option) =>
      formatShippingOption(option, quote),
    ),
    "",
    formatHeading({
      title: "GRAND TOTAL",
      total: quote.grandTotal,
      note: `merchandise + shipping and taxes, ${quote.order.carrier.toUpperCase()}  (range ${formatUsd(quote.lowGrandTotal)} to ${formatUsd(quote.highGrandTotal)})`,
    }),
    ...(quote.bom.length > 0
      ? ["", "BOM", ...quote.bom.map(formatBomLine)]
      : []),
    ...(quote.warnings.length > 0
      ? ["", "Warnings", ...quote.warnings.map((warning) => `  - ${warning}`)]
      : []),
  ].join("\n")
}
