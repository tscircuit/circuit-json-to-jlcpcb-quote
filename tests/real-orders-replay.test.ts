import { expect, test } from "bun:test"
import { estimateJlcpcbQuote } from "lib/index"
import {
  createBoardFeatures,
  createBomFromInvoice,
  createJlcPart,
  createPricedBomLine,
} from "./fixtures/create-test-order"
import { getLineItemCost } from "./fixtures/get-line-item-cost"

/**
 * Replays tscircuit's shipped JLCPCB orders (from
 * tscircuit/jlcpcb-manufacturing-specs datasets/jlcpcb) and one live quote.
 * The design files of the orders are not available, so the BOM and joint
 * counts are rebuilt from the invoices. These check the fee rules, not part
 * matching or file reading.
 */

test("Y45: 4-layer 70x70, 0.15/0.3mm vias, standard PCBA", () => {
  const quote = estimateJlcpcbQuote({
    features: createBoardFeatures({
      smallestVia: { holeDiameterMm: 0.15, padDiameterMm: 0.3 },
      smtJointsPerBoard: 644,
    }),
    bom: createBomFromInvoice({
      extendedParts: 40,
      partsCostPerBoard: 25.06,
      xrayParts: 3,
    }),
    options: {
      quantity: 5,
      assembledQuantity: 2,
      assembly: "standard",
      confirmPartsPlacement: false,
    },
  })

  // Invoice lines that are published fees match to the cent.
  expect(getLineItemCost(quote, "setup")).toBe(25.56)
  expect(getLineItemCost(quote, "stencil")).toBe(8.21)
  expect(getLineItemCost(quote, "feeder_loading")).toBe(61.2)
  expect(getLineItemCost(quote, "xray")).toBe(9.84)
  expect(getLineItemCost(quote, "smt_placement")).toBe(2.06)
  expect(getLineItemCost(quote, "packaging")).toBeCloseTo(0.49, 1)

  // Bare PCB: the $7 offer became $81.78 after two additional fees for the
  // small vias, which are reported apart from the fabrication price.
  expect(quote.fabricationTotal).toBe(8.05)
  expect(quote.fabricationPerBoard).toBe(1.61)
  expect(quote.additionalFees.map((fee) => [fee.key, fee.cost])).toEqual([
    ["four_wire_kelvin_test", 54.18],
    ["very_small_via", 16.29],
  ])
  expect(quote.additionalFeesTotal).toBe(70.47)
  expect(quote.additionalFees[0]).toMatchObject({
    reason:
      "The smallest via has a 0.15mm hole and a 0.3mm pad. JLCPCB tests boards with via holes under 0.3mm and pads of 0.4mm or less with a 4-wire Kelvin test.",
    howToAvoid:
      "Use vias with a hole of at least 0.3mm and a pad of at least 0.45mm.",
  })
  const pcbCost = quote.fabricationTotal + quote.additionalFeesTotal
  expect(Math.abs(pcbCost - 81.78) / 81.78).toBeLessThan(0.05)

  // Actual: 288.92 including 49.26 of optional expedited build.
  const actual = 288.92 - 49.26
  expect(Math.abs(quote.total - actual) / actual).toBeLessThan(0.03)
})

test("Y63: 4-layer 35x35, 0.3/0.4mm vias, lead-free HASL, economic PCBA", () => {
  const quote = estimateJlcpcbQuote({
    features: createBoardFeatures({
      widthMm: 35,
      heightMm: 35,
      smallestVia: { holeDiameterMm: 0.3, padDiameterMm: 0.4 },
      smtJointsPerBoard: 497,
    }),
    bom: createBomFromInvoice({ extendedParts: 21, partsCostPerBoard: 16.725 }),
    options: {
      quantity: 5,
      assembledQuantity: 2,
      assembly: "economic",
      surfaceFinish: "hasl_lead_free",
    },
  })

  // A 0.3mm hole with a 0.4mm pad draws no additional fee.
  expect(quote.additionalFees).toEqual([])
  // Invoice 14.05: $7 offer + 5.30 lead-free + 1.05 production file leaves
  // 0.70 unexplained.
  expect(quote.fabricationTotal).toBe(13.35)
  expect(getLineItemCost(quote, "setup")).toBe(8.24)
  expect(getLineItemCost(quote, "stencil")).toBe(1.55)
  expect(getLineItemCost(quote, "feeder_loading")).toBe(64.89)
  expect(getLineItemCost(quote, "smt_placement")).toBe(1.69)
  expect(Math.abs(quote.total - 125.3) / 125.3).toBeLessThan(0.02)
})

test("live quote: 4-layer 144.5x82, lead-free HASL, economic PCBA x5", () => {
  // JLCPCB quote page, 2026-11-10: PCB 38.65 + economic PCBA 309.78.
  const quote = estimateJlcpcbQuote({
    features: createBoardFeatures({
      widthMm: 144.5,
      heightMm: 82,
      smtJointsPerBoard: 914,
    }),
    bom: [
      ...createBomFromInvoice({
        extendedParts: 39, // extended parts that were charged a loading fee
        basicParts: 30, // 23 basic + 7 preferred
        partsCostPerBoard: 164.76 / 5,
      }),
      // Four through-hole parts with 24 manual joints between them.
      ...[7, 5, 4, 8].map((throughHole, index) =>
        createPricedBomLine({
          designators: [`TH${index}`],
          part: createJlcPart({ lcsc: `C90${index}`, unitPrice: 0 }),
          footprintJoints: { smt: 0, throughHole },
        }),
      ),
    ],
    options: {
      quantity: 5,
      assembledQuantity: 5,
      assembly: "economic",
      surfaceFinish: "hasl_lead_free",
    },
  })

  expect(quote.fabricationTotal).toBe(38.65)
  expect(quote.fabricationPerBoard).toBe(7.73)
  expect(quote.additionalFees).toEqual([])
  expect(quote.assemblyTotal).toBe(309.78)
  expect(getLineItemCost(quote, "setup")).toBe(8.24)
  expect(getLineItemCost(quote, "stencil")).toBe(1.55)
  expect(getLineItemCost(quote, "feeder_loading")).toBe(120.51)
  expect(getLineItemCost(quote, "smt_placement")).toBe(7.77)
  expect(getLineItemCost(quote, "through_hole")).toBe(5.59) // 3.61 + 1.98
  expect(getLineItemCost(quote, "nitrogen_reflow")).toBe(0.91)
  expect(getLineItemCost(quote, "confirm_parts_placement")).toBe(0.45)
  expect(quote.total).toBe(348.43)
})

test("boards without a price are refused instead of guessed", () => {
  expect(() =>
    estimateJlcpcbQuote({
      features: createBoardFeatures({ widthMm: 150, numLayers: 12 }),
      bom: [],
    }),
  ).toThrow("No JLCPCB price for 12-layer")
  expect(() =>
    estimateJlcpcbQuote({
      features: createBoardFeatures({ thicknessMm: 0.8 }),
      bom: [],
    }),
  ).toThrow("No JLCPCB price for 0.8mm")
})

test("assembly is priced for both Economic and Standard PCBA", () => {
  const order = {
    bom: createBomFromInvoice({ extendedParts: 10, partsCostPerBoard: 5 }),
    options: { quantity: 5, assembledQuantity: 5 },
  }
  const singleSided = estimateJlcpcbQuote({
    ...order,
    features: createBoardFeatures({ smtJointsPerBoard: 200 }),
  })
  expect(singleSided.order.assembly).toBe("economic")
  expect(
    singleSided.assemblyOptions.map((option) => [
      option.assembly,
      option.total,
      option.perBoard,
    ]),
  ).toEqual([
    ["economic", 68.75, 13.75],
    ["standard", 76.62, 15.32],
  ])
  expect(singleSided.assemblyTotal).toBe(68.75)
  expect(singleSided.total).toBeCloseTo(
    singleSided.fabricationTotal +
      singleSided.additionalFeesTotal +
      singleSided.assemblyTotal,
    2,
  )

  const doubleSided = estimateJlcpcbQuote({
    ...order,
    features: createBoardFeatures({
      smtJointsPerBoard: 200,
      sidesWithComponents: ["top", "bottom"],
    }),
  })
  expect(doubleSided.order.assembly).toBe("standard")
  expect(doubleSided.assemblyOptions[0]).toMatchObject({
    assembly: "economic",
    unavailableReason:
      "Economic PCBA assembles one side only and this board has parts on both sides",
    total: 0,
  })
  expect(() =>
    estimateJlcpcbQuote({
      ...order,
      features: doubleSided.features,
      options: { assembly: "economic" },
    }),
  ).toThrow("Economic PCBA assembles one side only")
})
