import { expect, test } from "bun:test"
import { estimateJlcpcbQuote } from "lib/index"
import type { PricedBomLine } from "lib/index"
import {
  createBoardFeatures,
  createJlcPart,
  createPricedBomLine,
} from "./fixtures/create-test-order"
import { getLineItemCost } from "./fixtures/get-line-item-cost"

const quoteFiveBoards = (bom: PricedBomLine[]) =>
  estimateJlcpcbQuote({
    features: createBoardFeatures({
      widthMm: 50,
      heightMm: 50,
      numLayers: 2,
      smtJointsPerBoard: 14,
    }),
    bom,
    options: { assembly: "economic", assembledQuantity: 5 },
  })

const getPartsCost = (bom: PricedBomLine[]) =>
  getLineItemCost(quoteFiveBoards(bom), "components")

test("extended parts are billed with spares, a minimum and the matching price break", () => {
  const priceTiers = [
    { fromQuantity: 1, unitPrice: 4.8613 },
    { fromQuantity: 10, unitPrice: 4.161 },
  ]
  // 2 per board x 5 boards = 10, no spares: second price break.
  expect(
    getPartsCost([
      createPricedBomLine({ quantity: 2, part: createJlcPart({ priceTiers }) }),
    ]),
  ).toBe(41.61)
  // 1 per board x 5 boards + 8 spares = 13.
  expect(
    getPartsCost([
      createPricedBomLine({
        part: createJlcPart({
          unitPrice: 0.0357,
          billing: { spareQuantity: 8, minimumQuantity: 0 },
        }),
      }),
    ]),
  ).toBe(0.46)
  // 5 used + 10 spares is under the minimum of 20.
  expect(
    getPartsCost([
      createPricedBomLine({
        part: createJlcPart({
          unitPrice: 0.0042,
          billing: { spareQuantity: 10, minimumQuantity: 20 },
        }),
      }),
    ]),
  ).toBe(0.08)
})

test("basic parts are billed exactly as used", () => {
  expect(
    getPartsCost([
      createPricedBomLine({
        part: createJlcPart({
          isBasic: true,
          unitPrice: 0.0233,
          billing: { spareQuantity: 10, minimumQuantity: 20 },
        }),
      }),
    ]),
  ).toBe(0.12)
})

test("jlcsearch-priced parts get estimated spares and a range", () => {
  const quote = quoteFiveBoards([
    createPricedBomLine({
      part: createJlcPart({
        unitPrice: 0.01,
        billing: null,
        source: "jlcsearch",
      }),
    }),
  ])
  const components = quote.lineItems.find((item) => item.key === "components")
  expect(components).toMatchObject({
    cost: 0.2, // 20 minimum x $0.01
    confidence: "calibrated",
  })
  expect(components?.lowCost).toBeLessThan(0.2)
  expect(components?.highCost).toBeGreaterThan(0.2)
})

test("hand-soldered parts pay per manual joint and no loading fee", () => {
  const quote = quoteFiveBoards([
    createPricedBomLine({}),
    createPricedBomLine({
      designators: ["RV1"],
      footprintJoints: { smt: 0, throughHole: 7 },
      part: createJlcPart({ lcsc: "C2", package: "Plugin" }),
    }),
    // A USB connector: SMT pads plus plated shell tabs. Reflowed, not manual.
    createPricedBomLine({
      designators: ["J1"],
      footprintJoints: { smt: 12, throughHole: 4 },
      part: createJlcPart({ lcsc: "C3" }),
    }),
  ])
  expect(getLineItemCost(quote, "feeder_loading")).toBe(6.18) // 2 parts, not 3
  expect(getLineItemCost(quote, "through_hole")).toBe(4.19) // 3.61 + 35 x 0.0165
  expect(getLineItemCost(quote, "smt_placement")).toBe(0.12) // 14 x 5 x 0.0017
})

test("a part with less stock than the billed quantity is flagged", () => {
  const quote = quoteFiveBoards([
    createPricedBomLine({ part: createJlcPart({ lcsc: "C9", stock: 3 }) }),
  ])
  expect(quote.warnings).toContain("X1: C9 has 3 in stock at JLCPCB, 5 needed")
})
