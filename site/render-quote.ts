import type {
  AdditionalFee,
  AssemblyOption,
  JlcpcbQuote,
  PricedBomLine,
  QuoteLineItem,
  QuoteSummaryRow,
  ShippingOption,
} from "../lib/index"
import { escapeHtml } from "./escape-html"

const formatUsd = (amount: number) => `$${amount.toFixed(2)}`

const formatRange = (range: { low: number; high: number; exact: number }) =>
  range.low === range.exact && range.high === range.exact
    ? ""
    : `<span class="range">${formatUsd(range.low)} to ${formatUsd(range.high)}</span>`

const renderLineItem = (item: QuoteLineItem) => `
  <tr>
    <td>${escapeHtml(item.label)}${item.note ? `<div class="note">${escapeHtml(item.note)}</div>` : ""}</td>
    <td><span class="confidence confidence-${item.confidence}">${item.confidence}</span></td>
    <td class="amount">${formatUsd(item.cost)}${formatRange({ low: item.lowCost, high: item.highCost, exact: item.cost })}</td>
  </tr>`

const renderLineItems = (lineItems: QuoteLineItem[]) =>
  `<table class="line-items"><tbody>${lineItems.map(renderLineItem).join("")}</tbody></table>`

const renderCard = (card: {
  title: string
  total: string
  subtitle?: string
  body: string
  isSelected?: boolean
}) => `
  <section class="card${card.isSelected ? " selected" : ""}">
    <header>
      <div>
        <h3>${card.title}</h3>
        ${card.subtitle ? `<div class="subtitle">${card.subtitle}</div>` : ""}
      </div>
      <div class="card-total">${card.total}</div>
    </header>
    ${card.body}
  </section>`

const renderAdditionalFee = (fee: AdditionalFee) => `
  <div class="fee">
    <div class="fee-heading"><strong>${escapeHtml(fee.label)}</strong><span>${formatUsd(fee.cost)}</span></div>
    <div><span class="fee-tag">Why</span>${escapeHtml(fee.reason)}</div>
    <div><span class="fee-tag avoid">Avoid</span>${escapeHtml(fee.howToAvoid)}</div>
  </div>`

const renderAdditionalFees = (quote: JlcpcbQuote) =>
  renderCard({
    title: `Additional fees (${quote.additionalFees.length} detected)`,
    total: formatUsd(quote.additionalFeesTotal),
    subtitle:
      "Charges the design triggers, kept apart from fabrication and assembly",
    body:
      quote.additionalFees.length === 0
        ? `<p class="muted">None detected.</p>`
        : quote.additionalFees.map(renderAdditionalFee).join(""),
  })

const renderAssemblyOption = (option: AssemblyOption, quote: JlcpcbQuote) =>
  option.unavailableReasons.length > 0
    ? renderCard({
        title: `${option.assembly === "economic" ? "Economic" : "Standard"} PCBA`,
        total: "n/a",
        subtitle: "Not available for this board",
        body: `<ul class="reasons">${option.unavailableReasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul>`,
      })
    : renderCard({
        title: `${option.assembly === "economic" ? "Economic" : "Standard"} PCBA`,
        total: formatUsd(option.total),
        subtitle: `${formatUsd(option.perBoard)} per board, ${quote.order.assembledQuantity} boards${option.assembly === quote.order.assembly ? " · used in the total" : ""}`,
        body: renderLineItems(option.lineItems),
        isSelected: option.assembly === quote.order.assembly,
      })

const renderShippingOption = (option: ShippingOption, quote: JlcpcbQuote) =>
  renderCard({
    title: escapeHtml(option.service),
    total: formatUsd(option.total),
    subtitle: `Grand total ${formatUsd(option.grandTotal)}${option.carrier === quote.order.carrier ? " · used in the grand total" : ""}`,
    body: renderLineItems(option.lineItems),
    isSelected: option.carrier === quote.order.carrier,
  })

const renderBomLine = (line: PricedBomLine) => {
  const library = line.part.isBasic
    ? "basic"
    : line.part.isPreferred
      ? "preferred"
      : "extended"
  return `<tr>
    <td>${line.quantity}</td>
    <td>${escapeHtml(line.part.lcsc)}</td>
    <td>${escapeHtml(line.part.mfr)}</td>
    <td>${escapeHtml(line.part.package)}</td>
    <td>${library}</td>
    <td class="amount">${formatUsd(line.part.unitPrice)}</td>
    <td class="designators">${escapeHtml(line.designators.join(", "))}</td>
  </tr>`
}

const renderBom = (quote: JlcpcbQuote) => {
  if (quote.bom.length === 0 && quote.excludedBomLines.length === 0) return ""
  const excluded =
    quote.excludedBomLines.length === 0
      ? ""
      : `<h4>Left out (${quote.excludedBomLines.length})</h4><ul class="reasons">${quote.excludedBomLines
          .map(
            ({ line, reason }) =>
              `<li><strong>${escapeHtml(line.designators.join(", "))}</strong>: ${escapeHtml(reason)}</li>`,
          )
          .join("")}</ul>`
  return `
    <details class="details-section">
      <summary>Bill of materials: ${quote.bom.length} priced, ${quote.excludedBomLines.length} left out</summary>
      ${excluded}
      <table class="bom">
        <thead><tr><th>Qty</th><th>Part</th><th>MPN</th><th>Package</th><th>Library</th><th>Unit</th><th>Designators</th></tr></thead>
        <tbody>${quote.bom.map(renderBomLine).join("")}</tbody>
      </table>
    </details>`
}

const PER_BOARD_UNITS: Record<QuoteSummaryRow["perBoardUnit"], string> = {
  pcb: "per PCB",
  assembled_board: "per assembled board",
}

const renderSummaryRow = (row: QuoteSummaryRow) => `
  <tr class="${row.key === "grand_total" ? "grand-total" : ""}">
    <th scope="row">
      ${escapeHtml(row.label)}
      ${row.note ? `<div class="note">${escapeHtml(row.note)}</div>` : ""}
    </th>
    <td class="amount">${formatUsd(row.total)}${formatRange({ low: row.lowTotal, high: row.highTotal, exact: row.total })}</td>
    <td class="amount">${formatUsd(row.perBoard)}<span class="unit">${PER_BOARD_UNITS[row.perBoardUnit]}</span></td>
  </tr>`

const renderBoardLine = (quote: JlcpcbQuote) => {
  const { features, order } = quote
  const assembly =
    order.assembly === "none"
      ? "no assembly"
      : `${order.assembledQuantity} assembled with ${order.assembly === "economic" ? "Economic" : "Standard"} PCBA`
  const bare = order.quantity - order.assembledQuantity
  return `
    <div class="board-line">
      <strong>${features.widthMm} × ${features.heightMm} mm, ${features.numLayers} layers, ${features.thicknessMm} mm ${features.material}</strong>
      <span class="muted">${order.quantity} PCBs, ${assembly}${order.assembly !== "none" && bare > 0 ? `, ${bare} left bare` : ""}, shipped by ${order.carrier.toUpperCase()}</span>
    </div>`
}

const renderSummary = (quote: JlcpcbQuote) => `
  <section class="card summary-card">
    ${renderBoardLine(quote)}
    <table class="summary-table">
      <thead><tr><th></th><th class="amount">Total</th><th class="amount">Per board</th></tr></thead>
      <tbody>${quote.summary.rows.map(renderSummaryRow).join("")}</tbody>
      <tfoot>${renderSummaryRow(quote.summary.grandTotal)}</tfoot>
    </table>
    <p class="muted footnote">${escapeHtml(quote.destination.note)}</p>
    <p class="muted footnote">Per assembled board includes everything in the order, bare extra PCBs too. Grey ranges show how far an estimate may be off.</p>
  </section>`

const renderDetails = (section: { title: string; body: string }) => `
  <details class="details-section">
    <summary>${section.title}</summary>
    <div class="details-body">${section.body}</div>
  </details>`

const renderWarnings = (quote: JlcpcbQuote) =>
  quote.warnings.length === 0
    ? ""
    : `<section class="card warnings"><h3>Warnings</h3><ul>${quote.warnings
        .map((warning) => `<li>${escapeHtml(warning)}</li>`)
        .join("")}</ul></section>`

/** The whole quote as HTML. Every outside string is escaped. */
export const renderQuote = (quote: JlcpcbQuote) => `
  ${renderSummary(quote)}
  ${quote.additionalFees.length > 0 ? renderAdditionalFees(quote) : ""}
  ${renderWarnings(quote)}
  <h2>Details</h2>
  ${renderDetails({
    title: `Board fabrication: ${formatUsd(quote.fabricationTotal)}`,
    body: renderLineItems(quote.fabricationLineItems),
  })}
  ${
    quote.assemblyOptions.length > 0
      ? renderDetails({
          title: "Assembly: Economic and Standard PCBA compared",
          body: `<div class="columns">${quote.assemblyOptions
            .map((option) => renderAssemblyOption(option, quote))
            .join("")}</div>`,
        })
      : ""
  }
  ${renderDetails({
    title: "Shipping and taxes: DHL and UPS compared",
    body: `<div class="columns">${quote.shippingOptions
      .map((option) => renderShippingOption(option, quote))
      .join("")}</div>`,
  })}
  ${renderBom(quote)}
  <p class="muted footnote">Prices as of ${escapeHtml(quote.priceTableVersion)}, USD. Confidence: <em>published</em> JLCPCB help pages, <em>quoted</em> a live JLCPCB quote, <em>calibrated</em> fitted to real orders, <em>heuristic</em> an approximation.</p>
`
