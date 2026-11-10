import { expect, test } from "bun:test"
import { estimateJlcpcbQuote } from "lib/index"
import type { BoardFeatures, BomLine } from "lib/index"

/**
 * Replays tscircuit's two shipped JLCPCB orders (from
 * tscircuit/jlcpcb-manufacturing-specs datasets/jlcpcb). The Circuit JSON of
 * those orders is not available, so the BOM is rebuilt from the invoice: the
 * number of unique parts from the loading fee, joints from the placement fee
 * and the parts cost as one lump.
 */
const board = (overrides: Partial<BoardFeatures>): BoardFeatures => ({
  widthMm: 70,
  heightMm: 70,
  numLayers: 4,
  thicknessMm: 1.6,
  material: "fr4",
  viaCount: 100,
  smallestVia: { holeDiameterMm: 0.3, outerDiameterMm: 0.45 },
  minPlatedHoleDiameterMm: null,
  holeCount: 100,
  minTraceWidthMm: 0.15,
  sidesWithComponents: ["top"],
  ...overrides,
})

const bomFromInvoice = (params: {
  uniqueParts: number
  jointsPerBoard: number
  partsCostPerBoard: number
  xrayParts?: number
  basicParts?: number
}): BomLine[] =>
  Array.from(
    { length: params.uniqueParts + (params.basicParts ?? 0) },
    (_, i) => ({
      designators: [`U${i + 1}`],
      quantity: 1,
      smtJointsPerPart: i === 0 ? params.jointsPerBoard : 0,
      throughHoleJointsPerPart: 0,
      part: {
        lcsc: `C${i + 1}`,
        mfr: `PART${i + 1}`,
        package: i < (params.xrayParts ?? 0) ? "QFN-56" : "SOIC-8",
        description: "",
        isBasic: i >= params.uniqueParts,
        isPreferred: false,
        unitPrice: i === 0 ? params.partsCostPerBoard : 0,
        stock: 1000,
      },
    }),
  )

const itemCost = (quote: ReturnType<typeof estimateJlcpcbQuote>, key: string) =>
  quote.lineItems.find((item) => item.key === key)?.cost ?? 0

test("Y45: 4-layer 70x70, 0.15/0.3mm vias, standard PCBA", () => {
  const quote = estimateJlcpcbQuote({
    features: board({
      smallestVia: { holeDiameterMm: 0.15, outerDiameterMm: 0.3 },
    }),
    bom: bomFromInvoice({
      uniqueParts: 40,
      jointsPerBoard: 644,
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

  // Invoice lines that are published fees must match to the cent.
  expect(itemCost(quote, "setup")).toBe(25.56)
  expect(itemCost(quote, "stencil")).toBe(8.21)
  expect(itemCost(quote, "feeder_loading")).toBe(61.2)
  expect(itemCost(quote, "xray")).toBe(9.84)
  expect(itemCost(quote, "smt_placement")).toBe(2.06)
  expect(itemCost(quote, "packaging")).toBeCloseTo(0.49, 1)

  // Bare PCB: $7 offer became $81.78 after the engineers' small-via charges.
  expect(itemCost(quote, "four_wire_kelvin_test")).toBe(54.18)
  expect(quote.pcbTotal).toBe(78.52)
  expect(Math.abs(quote.pcbTotal - 81.78) / 81.78).toBeLessThan(0.06)

  // Actual: 288.92 including 49.26 of optional expedited build.
  const actual = 288.92 - 49.26
  expect(Math.abs(quote.total - actual) / actual).toBeLessThan(0.03)
})

test("Y63: 4-layer 35x35, 0.3/0.4mm vias, lead-free HASL, economic PCBA", () => {
  const quote = estimateJlcpcbQuote({
    features: board({
      widthMm: 35,
      heightMm: 35,
      smallestVia: { holeDiameterMm: 0.3, outerDiameterMm: 0.4 },
    }),
    bom: bomFromInvoice({
      uniqueParts: 21,
      jointsPerBoard: 497,
      partsCostPerBoard: 16.725,
    }),
    options: {
      quantity: 5,
      assembledQuantity: 2,
      assembly: "economic",
      surfaceFinish: "hasl_lead_free",
      confirmPartsPlacement: true,
    },
  })

  expect(itemCost(quote, "four_wire_kelvin_test")).toBe(0)
  // Invoice 14.05: $7 offer + 5.30 lead-free + 1.05 production file leaves
  // 0.70 unexplained.
  expect(quote.pcbTotal).toBe(13.35)
  expect(itemCost(quote, "setup")).toBe(8.24)
  expect(itemCost(quote, "stencil")).toBe(1.55)
  expect(itemCost(quote, "feeder_loading")).toBe(64.89)
  expect(itemCost(quote, "smt_placement")).toBe(1.69)
  expect(Math.abs(quote.total - 125.3) / 125.3).toBeLessThan(0.02)
})

test("dual-rp2350 quote: 4-layer 144.5x82, lead-free HASL, economic PCBA x5", () => {
  // JLCPCB quote page, 2026-11-10: PCB 38.65 + economic PCBA 309.78.
  const quote = estimateJlcpcbQuote({
    features: board({ widthMm: 144.5, heightMm: 82 }),
    bom: bomFromInvoice({
      uniqueParts: 39, // extended parts that were charged a loading fee
      basicParts: 34, // 23 basic + 11 exempt
      jointsPerBoard: 914,
      partsCostPerBoard: 164.76 / 5,
    }),
    jointsPerBoard: { smt: 914, throughHole: 24 },
    options: {
      quantity: 5,
      assembledQuantity: 5,
      assembly: "economic",
      surfaceFinish: "hasl_lead_free",
    },
  })

  expect(quote.pcbTotal).toBe(38.65)
  expect(itemCost(quote, "setup")).toBe(8.24)
  expect(itemCost(quote, "stencil")).toBe(1.55)
  expect(itemCost(quote, "feeder_loading")).toBe(120.51)
  expect(itemCost(quote, "smt_placement")).toBe(7.77)
  expect(itemCost(quote, "through_hole")).toBe(5.59) // 3.61 + 1.98
  expect(itemCost(quote, "nitrogen_reflow")).toBe(0.91)
  expect(itemCost(quote, "confirm_parts_placement")).toBe(0.45)
  expect(quote.total).toBe(348.43)
})
