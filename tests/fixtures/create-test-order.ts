import type { BoardFeatures, JlcPart, PricedBomLine } from "lib/index"

export const createBoardFeatures = (
  overrides: Partial<BoardFeatures> = {},
): BoardFeatures => ({
  widthMm: 70,
  heightMm: 70,
  numLayers: 4,
  thicknessMm: 1.6,
  material: "fr4",
  stiffenerCount: 0,
  viaCount: 100,
  smallestVia: { holeDiameterMm: 0.3, padDiameterMm: 0.45 },
  holeCount: 100,
  minTraceWidthMm: 0.15,
  sidesWithComponents: ["top"],
  smtJointsPerBoard: 0,
  ...overrides,
})

export const createJlcPart = (overrides: Partial<JlcPart> = {}): JlcPart => ({
  lcsc: "C1",
  mfr: "PART",
  package: "SOIC-8",
  isBasic: false,
  isPreferred: false,
  unitPrice: 1,
  stock: 100_000,
  priceTiers: [],
  billing: { spareQuantity: 0, minimumQuantity: 0 },
  source: "jlcpcb",
  ...overrides,
})

export const createPricedBomLine = (
  overrides: Partial<PricedBomLine> = {},
): PricedBomLine => ({
  designators: ["X1"],
  quantity: 1,
  comment: "",
  part: createJlcPart(),
  matchMethod: "jlc_part_number",
  footprintJoints: { smt: 2, throughHole: 0 },
  ...overrides,
})

/**
 * Rebuild a BOM from an invoice when the design files are not available:
 * the number of unique parts from the loading fee and the parts cost as one
 * lump on the first line.
 */
export const createBomFromInvoice = (invoice: {
  extendedParts: number
  basicParts?: number
  partsCostPerBoard: number
  xrayParts?: number
}): PricedBomLine[] =>
  Array.from(
    { length: invoice.extendedParts + (invoice.basicParts ?? 0) },
    (_, index) =>
      createPricedBomLine({
        designators: [`U${index + 1}`],
        part: createJlcPart({
          lcsc: `C${index + 1}`,
          package: index < (invoice.xrayParts ?? 0) ? "QFN-56" : "SOIC-8",
          isBasic: index >= invoice.extendedParts,
          unitPrice: index === 0 ? invoice.partsCostPerBoard : 0,
        }),
      }),
  )
