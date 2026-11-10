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
}): BomLine[] =>
  Array.from({ length: params.uniqueParts }, (_, i) => ({
    designators: [`U${i + 1}`],
    quantity: 1,
    smtJointsPerPart: i === 0 ? params.jointsPerBoard : 0,
    throughHoleJointsPerPart: 0,
    part: {
      lcsc: `C${i + 1}`,
      mfr: `PART${i + 1}`,
      package: i < (params.xrayParts ?? 0) ? "QFN-56" : "SOIC-8",
      description: "",
      isBasic: false,
      isPreferred: false,
      unitPrice: i === 0 ? params.partsCostPerBoard : 0,
      stock: 1000,
    },
  }))

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
    options: { quantity: 5, assembledQuantity: 2, assembly: "standard" },
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
  expect(quote.pcbTotal).toBe(77.47)
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
      jointsPerBoard: 528,
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
  expect(quote.pcbTotal).toBe(14.05)
  // Invoice shows 8.24 / 1.55 / 64.89: the published fees plus ~0.7% drift.
  expect(itemCost(quote, "setup")).toBeCloseTo(8.24, 0)
  expect(itemCost(quote, "feeder_loading")).toBeCloseTo(64.89, 0)
  expect(Math.abs(quote.total - 125.3) / 125.3).toBeLessThan(0.02)
})
