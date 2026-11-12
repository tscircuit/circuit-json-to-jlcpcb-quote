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
      surfaceFinish: "hasl_leaded",
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

  // The calculator itemizes testing and drilling. The range also accounts
  // for the higher supplement requested after review of this order.
  expect(quote.fabricationTotal).toBe(8.05)
  expect(quote.fabricationPerBoard).toBe(1.61)
  expect(quote.additionalFees.map((fee) => [fee.key, fee.cost])).toEqual([
    ["four_wire_kelvin_test", 16.87],
    ["very_small_via", 34.3],
  ])
  expect(quote.additionalFeesTotal).toBe(51.17)
  expect(quote.additionalFees[0]).toMatchObject({
    highCost: 54.18,
    reason:
      "A via has a 0.15mm hole and a 0.3mm pad. JLCPCB requires 4-wire Kelvin testing for this via size.",
    howToAvoid:
      "Use via holes of at least 0.3mm. For smaller holes down to 0.2mm, use pads of at least 0.45mm.",
  })
  const pcbHigh =
    quote.fabricationTotal +
    quote.additionalFees.reduce((total, fee) => total + fee.highCost, 0)
  expect(quote.fabricationTotal + quote.additionalFeesTotal).toBeLessThan(81.78)
  expect(pcbHigh).toBeGreaterThan(81.78)

  // Actual: 288.92 including 49.26 of optional expedited build.
  const actual = 288.92 - 49.26
  expect(quote.lowTotal).toBeLessThan(actual)
  expect(quote.highTotal).toBeGreaterThan(actual)
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

test.each([
  { hole: 0.25, pad: 0.4, quantity: 5, drilling: 16.95, kelvin: 16.87 },
  { hole: 0.2, pad: 0.4, quantity: 5, drilling: 17.15, kelvin: 16.87 },
  { hole: 0.25, pad: 0.4, quantity: 100, drilling: 24.65, kelvin: 23.03 },
  { hole: 0.2, pad: 0.35, quantity: 100, drilling: 28.7, kelvin: 23.03 },
  { hole: 0.15, pad: 0.3, quantity: 100, drilling: 57.4, kelvin: 23.03 },
])(
  "live 70x70mm quote: $quantity boards, $hole mm drill and $pad mm pad",
  ({ hole, pad, quantity, drilling, kelvin }) => {
    const quote = estimateJlcpcbQuote({
      features: createBoardFeatures({
        numLayers: 2,
        smallestVia: { holeDiameterMm: hole, padDiameterMm: pad },
      }),
      bom: [],
      options: { quantity, assembly: "none" },
    })
    expect(getLineItemCost(quote, "very_small_via")).toBe(drilling)
    expect(getLineItemCost(quote, "four_wire_kelvin_test")).toBe(kelvin)
  },
)

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
    unavailableReasons: [
      "Economic PCBA assembles one side only and this board has parts on both sides",
    ],
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

test("a part smaller than 0402 switches the board to Standard PCBA", () => {
  const quote = estimateJlcpcbQuote({
    features: createBoardFeatures({ smtJointsPerBoard: 10 }),
    bom: [
      createPricedBomLine({ designators: ["U1"] }),
      createPricedBomLine({
        designators: ["R23", "R24"],
        quantity: 2,
        part: createJlcPart({ lcsc: "C106224", package: "0201" }),
      }),
    ],
  })
  expect(quote.order.assembly).toBe("standard")
  expect(quote.assemblyOptions[0]?.unavailableReasons).toEqual([
    "1 parts are Standard-only because Economic PCBA's smallest package is 0402: R23,R24 (C106224, 0201)",
  ])
})

test("Economic PCBA is refused outside its published limits", () => {
  const quote = estimateJlcpcbQuote({
    features: createBoardFeatures({ widthMm: 150, numLayers: 8 }),
    bom: [createPricedBomLine()],
    options: {
      quantity: 60,
      assembledQuantity: 60,
      surfaceFinish: "hasl_leaded",
    },
  })
  expect(quote.assemblyOptions[0]?.unavailableReasons).toEqual([
    "Economic PCBA is offered for 2, 4, 6-layer boards, not 8",
    "Economic PCBA is offered up to 50 assembled boards, not 60",
  ])
})

test("the summary splits every expense, with totals and per-board prices", () => {
  const quote = estimateJlcpcbQuote({
    features: createBoardFeatures({
      widthMm: 144.5,
      heightMm: 82,
      smtJointsPerBoard: 826,
    }),
    bom: createBomFromInvoice({ extendedParts: 10, partsCostPerBoard: 20 }),
    options: {
      quantity: 5,
      assembledQuantity: 2,
      surfaceFinish: "hasl_lead_free",
      shippingCost: 39.58,
    },
  })
  const { rows, grandTotal } = quote.summary
  expect(
    rows.map((row) => [row.key, row.total, row.perBoard, row.perBoardUnit]),
  ).toEqual([
    ["fabrication", 38.65, 7.73, "pcb"],
    // 8.24 setup + 1.55 stencil + 10 x 3.09 loading + 0.91 nitrogen
    // + 1652 joints x 0.0017 + 0.45 placement check
    ["assembly", 44.86, 22.43, "assembled_board"],
    ["parts", 40, 20, "assembled_board"],
    ["shipping", 39.58, 19.79, "assembled_board"],
    ["import_taxes", 43.23, 21.62, "assembled_board"],
    ["disbursement_fee", 7.52, 3.76, "assembled_board"],
    ["sales_tax", 10.65, 5.33, "assembled_board"],
  ])
  // The rows add up to the grand total, which matches the quote's.
  expect(grandTotal.total).toBe(quote.grandTotal)
  expect(
    Math.round(rows.reduce((total, row) => total + row.total, 0) * 100) / 100,
  ).toBe(grandTotal.total)
  expect(grandTotal.perBoardUnit).toBe("assembled_board")
})

test("assembled boards cannot exceed the PCB quantity", () => {
  const estimate = (quantity: number, assembledQuantity?: number) =>
    estimateJlcpcbQuote({
      features: createBoardFeatures(),
      bom: [createPricedBomLine()],
      options: { quantity, assembledQuantity },
    })
  expect(() => estimate(5, 6)).toThrow("Cannot assemble 6 boards from 5 PCBs")
  expect(() => estimate(5, 0)).toThrow(
    "Assembled boards must be a whole number",
  )
  expect(() => estimate(2.5)).toThrow("PCB quantity must be a whole number")
  // Fewer PCBs than the default of 2 assembled: assemble them all.
  expect(estimate(1).order.assembledQuantity).toBe(1)
  expect(estimate(10, 3).order).toMatchObject({
    quantity: 10,
    assembledQuantity: 3,
  })
})
