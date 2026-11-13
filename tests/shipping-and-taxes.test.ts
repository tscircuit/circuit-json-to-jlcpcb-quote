import { expect, test } from "bun:test"
import {
  estimateOrderWeightKg,
  estimateShippingOptions,
} from "lib/estimate/estimate-shipping-options"
import {
  estimateJlcpcbQuote,
  formatJlcpcbQuote,
  type ShippingCarrier,
} from "lib/index"
import { createBoardFeatures } from "./fixtures/create-test-order"

/**
 * Replays the checkout of tscircuit's orders: given the merchandise total
 * and the shipping cost JLCPCB showed, the taxes and fees must add up to the
 * grand total JLCPCB charged.
 */
const replayCheckout = (checkout: {
  merchandiseTotal: number
  carrier: ShippingCarrier
  shippingCost: number
}) => {
  const merchandise = {
    total: checkout.merchandiseTotal,
    lowTotal: checkout.merchandiseTotal,
    highTotal: checkout.merchandiseTotal,
  }
  const shippingOption = estimateShippingOptions({
    features: createBoardFeatures({ widthMm: 144.5, heightMm: 82 }),
    quantity: 5,
    assembledQuantity: 2,
    merchandise,
    selectedCarrier: checkout.carrier,
    shippingCost: checkout.shippingCost,
    salesTaxRate: 0.08625,
  }).find((option) => option.carrier === checkout.carrier)
  return {
    lineItems: Object.fromEntries(
      shippingOption?.lineItems.map((item) => [item.key, item.cost]) ?? [],
    ),
    grandTotal: shippingOption?.grandTotal,
  }
}

test("Y98 checkout with DHL: $421.65", () => {
  expect(
    replayCheckout({
      merchandiseTotal: 260.77,
      carrier: "dhl",
      shippingCost: 39.58,
    }),
  ).toEqual({
    lineItems: {
      shipping: 39.58,
      import_taxes: 91.27, // invoice: 91.28
      disbursement_fee: 7.52,
      sales_tax: 22.49, // invoice: 22.50
    },
    grandTotal: 421.63, // invoice: 421.65
  })
})

test("Y98 checkout with UPS: $443.67", () => {
  const { grandTotal } = replayCheckout({
    merchandiseTotal: 260.77,
    carrier: "ups",
    shippingCost: 64.68,
  })
  expect(grandTotal).toBeCloseTo(443.67 - 0.02, 2)
})

test("Y63 checkout with DHL: $223.19", () => {
  const { grandTotal } = replayCheckout({
    merchandiseTotal: 125.3,
    carrier: "dhl",
    shippingCost: 35.7,
  })
  expect(Math.abs((grandTotal ?? 0) - 223.19)).toBeLessThanOrEqual(0.02)
})

test("order weight matches JLCPCB's quote page for the fitted board", () => {
  const order = {
    features: createBoardFeatures({ widthMm: 144.5, heightMm: 82 }),
    quantity: 5,
  }
  expect(estimateOrderWeightKg({ ...order, assembledQuantity: 0 })).toBe(0.33)
  expect(estimateOrderWeightKg({ ...order, assembledQuantity: 2 })).toBe(0.967)
  expect(estimateOrderWeightKg({ ...order, assembledQuantity: 5 })).toBe(1.228)
})

test("the quote states which destination its taxes are for", () => {
  const quote = estimateJlcpcbQuote({
    features: createBoardFeatures(),
    bom: [],
    options: { assembly: "none" },
  })
  expect(quote.destination).toMatchInlineSnapshot(`
    {
      "country": "US",
      "importTaxRate": 0.35,
      "isDefaultSalesTaxRate": true,
      "note": "Shipping and taxes assume delivery to the United States with duties paid: 35% import duties and 8.625% sales tax (the rate on tscircuit's orders; it depends on the delivery address). Other destinations are not modelled.",
      "salesTaxRate": 0.08625,
    }
  `)
  expect(formatJlcpcbQuote(quote)).toContain(quote.destination.note)

  const otherAddress = estimateJlcpcbQuote({
    features: createBoardFeatures(),
    bom: [],
    options: { assembly: "none", salesTaxRate: 0.0725 },
  })
  expect(otherAddress.destination.note).toMatchInlineSnapshot(
    `"Shipping and taxes assume delivery to the United States with duties paid: 35% import duties and 7.25% sales tax. Other destinations are not modelled."`,
  )
})
