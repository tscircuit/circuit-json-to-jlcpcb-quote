import { expect, test } from "bun:test"
import { estimateJlcpcbQuote, fetchJlcpcbPart } from "lib/index"
import type { BoardFeatures, BomLine, JlcPart } from "lib/index"

const features: BoardFeatures = {
  widthMm: 50,
  heightMm: 50,
  numLayers: 2,
  thicknessMm: 1.6,
  material: "fr4",
  viaCount: 0,
  smallestVia: null,
  minPlatedHoleDiameterMm: null,
  holeCount: 0,
  minTraceWidthMm: 0.2,
  sidesWithComponents: ["top"],
}

const part = (overrides: Partial<JlcPart>): JlcPart => ({
  lcsc: "C1",
  mfr: "PART",
  package: "0402",
  description: "",
  isBasic: false,
  isPreferred: false,
  unitPrice: 1,
  stock: 10_000,
  source: "jlcpcb",
  ...overrides,
})

const line = (overrides: Partial<BomLine>): BomLine => ({
  designators: ["X1"],
  quantity: 1,
  smtJointsPerPart: 2,
  throughHoleJointsPerPart: 0,
  ...overrides,
})

const cost = (bom: BomLine[], key: string) =>
  estimateJlcpcbQuote({
    features,
    bom,
    options: { assembly: "economic", assembledQuantity: 5 },
  }).lineItems.find((item) => item.key === key)?.cost ?? 0

test("extended parts are billed with spares, a minimum and the matching price break", () => {
  const tiers = [
    { fromQuantity: 1, unitPrice: 4.8613 },
    { fromQuantity: 10, unitPrice: 4.161 },
  ]
  // 2 per board x 5 boards = 10, no spares: second price break.
  expect(
    cost(
      [
        line({
          quantity: 2,
          part: part({ priceTiers: tiers, spareQuantity: 0 }),
        }),
      ],
      "components",
    ),
  ).toBe(41.61)
  // 1 per board x 5 boards + 8 spares = 13.
  expect(
    cost(
      [
        line({
          part: part({
            unitPrice: 0.0357,
            spareQuantity: 8,
            minimumQuantity: 0,
          }),
        }),
      ],
      "components",
    ),
  ).toBe(0.46)
  // 5 used + 10 spares is under the minimum of 20.
  expect(
    cost(
      [
        line({
          part: part({
            unitPrice: 0.0042,
            spareQuantity: 10,
            minimumQuantity: 20,
          }),
        }),
      ],
      "components",
    ),
  ).toBe(0.08)
})

test("basic parts are billed exactly as used", () => {
  expect(
    cost(
      [
        line({
          part: part({
            isBasic: true,
            unitPrice: 0.0233,
            spareQuantity: 10,
            minimumQuantity: 20,
          }),
        }),
      ],
      "components",
    ),
  ).toBe(0.12)
})

test("hand-soldered parts pay per manual joint and no loading fee", () => {
  const bom = [
    line({ part: part({}) }),
    line({
      designators: ["RV1"],
      smtJointsPerPart: 0,
      throughHoleJointsPerPart: 7,
      part: part({ lcsc: "C2", package: "Plugin" }),
    }),
    // A USB connector: SMT pads plus plated shell tabs. Reflowed, not manual.
    line({
      designators: ["J1"],
      smtJointsPerPart: 12,
      throughHoleJointsPerPart: 4,
      part: part({ lcsc: "C3" }),
    }),
  ]
  expect(cost(bom, "feeder_loading")).toBe(6.18) // 2 parts, not 3
  expect(cost(bom, "through_hole")).toBe(4.19) // 3.61 + 7 * 5 * 0.0165
  expect(cost(bom, "smt_placement")).toBe(0.12) // 14 joints * 5 * 0.0017
})

test("fetchJlcpcbPart reads tiers, spares and flags from JLCPCB's parts library", async () => {
  const fakeFetch = (async () =>
    new Response(
      JSON.stringify({
        code: 200,
        data: {
          componentPageInfo: {
            list: [
              { componentCode: "C99" },
              {
                componentCode: "C7",
                componentModelEn: "PART7",
                componentSpecificationEn: "0603",
                describe: "a part",
                componentLibraryType: "expand",
                preferredComponentFlag: true,
                stockCount: 42,
                initialPrice: 0.5,
                lossNumber: 8,
                leastPatchNumber: 20,
                componentPrices: [
                  { startNumber: 30, endNumber: -1, productPrice: 0.3 },
                  { startNumber: 1, endNumber: 29, productPrice: 0.5 },
                ],
              },
            ],
          },
        },
      }),
    )) as unknown as typeof fetch
  expect(await fetchJlcpcbPart(7, fakeFetch)).toEqual({
    lcsc: "C7",
    mfr: "PART7",
    package: "0603",
    description: "a part",
    isBasic: false,
    isPreferred: true,
    unitPrice: 0.5,
    stock: 42,
    priceTiers: [
      { fromQuantity: 1, unitPrice: 0.5 },
      { fromQuantity: 30, unitPrice: 0.3 },
    ],
    spareQuantity: 8,
    minimumQuantity: 20,
    source: "jlcpcb",
  })
  expect(await fetchJlcpcbPart(8, fakeFetch)).toBeNull()
})
