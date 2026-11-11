import type { AdditionalFee, QuoteLineItem } from "../types"

export const roundToCents = (amount: number) => Math.round(amount * 100) / 100

/**
 * Build a line item. `lowCost` and `highCost` default to `cost`, for prices
 * that are known exactly.
 */
export const createQuoteLineItem = (item: {
  category: QuoteLineItem["category"]
  key: string
  label: string
  cost: number
  confidence: QuoteLineItem["confidence"]
  lowCost?: number
  highCost?: number
  note?: string
}): QuoteLineItem => ({
  category: item.category,
  key: item.key,
  label: item.label,
  cost: roundToCents(item.cost),
  lowCost: roundToCents(item.lowCost ?? item.cost),
  highCost: roundToCents(item.highCost ?? item.cost),
  confidence: item.confidence,
  ...(item.note ? { note: item.note } : {}),
})

/** Build an additional fee: a line item with the reason and the way out. */
export const createAdditionalFee = (fee: {
  key: string
  label: string
  cost: number
  confidence: QuoteLineItem["confidence"]
  reason: string
  howToAvoid: string
}): AdditionalFee => ({
  ...createQuoteLineItem({
    category: "additional_fee",
    key: fee.key,
    label: fee.label,
    cost: fee.cost,
    confidence: fee.confidence,
  }),
  category: "additional_fee",
  reason: fee.reason,
  howToAvoid: fee.howToAvoid,
})
