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

test("parts without billed-spare details get estimated spares and a range", () => {
  const quote = quoteFiveBoards([
    createPricedBomLine({
      part: createJlcPart({ unitPrice: 0.01, billing: null }),
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

test("moisture-sensitive kinds of parts draw a baking fee", () => {
  const quote = quoteFiveBoards([
    createPricedBomLine({}),
    createPricedBomLine({
      designators: ["LED1", "LED2"],
      quantity: 2,
      part: createJlcPart({
        lcsc: "C5380881",
        mfr: "SK6812-B",
        description:
          "Semi-transparent lens SMD5050-4P RGB LEDs(Built-in IC) ROHS",
      }),
    }),
    createPricedBomLine({
      designators: ["U2"],
      part: createJlcPart({
        lcsc: "C701341",
        mfr: "ESP32-WROOM-32E-N4",
        description: "UART、SDIO SMD,25.5x18mm WiFi Modules ROHS",
      }),
    }),
    // A plain indicator LED is not flagged.
    createPricedBomLine({
      designators: ["D1"],
      part: createJlcPart({
        lcsc: "C2297",
        description: "Emerald Green 0805 LED Indication - Discrete ROHS",
      }),
    }),
  ])
  expect(quote.additionalFees).toEqual([
    expect.objectContaining({
      key: "component_baking",
      cost: 15.64,
      lowCost: 0,
      reason: expect.stringContaining(
        "LED1,LED2 (C5380881 SK6812-B); U2 (C701341 ESP32-WROOM-32E-N4)",
      ),
    }),
  ])
})

test("bare boards draw no baking fee", () => {
  const quote = estimateJlcpcbQuote({
    features: createBoardFeatures({ widthMm: 50, heightMm: 50, numLayers: 2 }),
    bom: [
      createPricedBomLine({
        part: createJlcPart({
          description: "SMD5050-4P RGB LEDs(Built-in IC)",
        }),
      }),
    ],
    options: { assembly: "none" },
  })
  expect(quote.additionalFees).toEqual([])
})
