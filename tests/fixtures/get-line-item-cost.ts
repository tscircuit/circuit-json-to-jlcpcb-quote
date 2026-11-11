import type { JlcpcbQuote } from "lib/index"

/** Cost of the line item with this key, or 0 when the quote has none. */
export const getLineItemCost = (quote: JlcpcbQuote, key: string): number =>
  quote.lineItems.find((item) => item.key === key)?.cost ?? 0
