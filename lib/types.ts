import type { AnyCircuitElement } from "circuit-json"

export type CircuitJson = AnyCircuitElement[]

/** e.g. "F_Cu.gbr", "bom.csv"; folders are not part of the name */
export type FabricationFileName = string
/** A fabrication bundle: file name -> text content */
export type FabricationFiles = Record<FabricationFileName, string>

export type AssemblyType = "none" | "economic" | "standard"
export type SurfaceFinish = "hasl_leaded" | "hasl_lead_free" | "enig"
export type BoardMaterial = "fr4" | "flex"
export type BoardSide = "top" | "bottom"
export type PartSource = "jlcpcb" | "jlcsearch"
export type LayerCount = number

/**
 * Where a number comes from:
 * - published: JLCPCB help pages
 * - quoted: read off a live JLCPCB quote page
 * - calibrated: fitted to tscircuit's own shipped orders
 * - heuristic: an approximation with a wide low/high range
 */
export type Confidence = "published" | "quoted" | "calibrated" | "heuristic"

/** JLCPCB part number such as "C25744" */
export type LcscPartNumber = string

/** The subset of `fetch` this library needs, so fakes need no casts. */
type HttpHeaderName = string

export type FetchLike = (
  url: string,
  init?: {
    method?: string
    headers?: Record<HttpHeaderName, string>
    body?: string
  },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>

export interface JlcpcbQuoteOptions {
  /** Bare PCBs ordered. Default 5. */
  quantity?: number
  /** Boards assembled. Default 2 (0 when assembly is "none"). */
  assembledQuantity?: number
  /** "auto" picks economic when the board allows it. Default "auto". */
  assembly?: AssemblyType | "auto"
  /** Rigid boards only. Default "hasl_leaded". */
  surfaceFinish?: SurfaceFinish
  /** Standard PCBA only. "auto" inspects BGA/LGA/QFN parts. Default "auto". */
  xrayInspection?: boolean | "auto"
  /** Default true. */
  confirmPartsPlacement?: boolean
  /** Default true. */
  confirmProductionFile?: boolean
  /** Economic PCBA only. Default true, as on the order form. */
  nitrogenReflow?: boolean
  /**
   * What to do with a BOM line that cannot be priced (no part number, not in
   * JLCPCB's library, no footprint). "error" (default) throws, because
   * leaving parts out makes the quote come out low. "exclude" leaves them out
   * and lists them in `excludedBomLines`.
   */
  unresolvedParts?: "error" | "exclude"
  /**
   * "jlcpcb" (default) prices parts from JLCPCB's parts library: quantity
   * price breaks and billed spares. "jlcsearch" uses jlcsearch's single-piece
   * price and estimates the spares.
   */
  partSource?: PartSource
  jlcsearchBaseUrl?: string
  fetch?: FetchLike
}

export interface BoardFeatures {
  widthMm: number
  heightMm: number
  numLayers: number
  thicknessMm: number
  material: BoardMaterial
  /** Flex boards only */
  stiffenerCount: number
  viaCount: number
  /** The via most likely to draw a charge: smallest hole, then smallest pad. */
  smallestVia: { holeDiameterMm: number; padDiameterMm: number } | null
  holeCount: number
  minTraceWidthMm: number | null
  sidesWithComponents: BoardSide[]
  /** Solder paste openings on the populated sides, one per SMT joint */
  smtJointsPerBoard: number
}

/** A jlcsearch filter name, e.g. "resistance" or "package" */
type JlcsearchQueryField = string

/** How to find a passive that has no part number on jlcsearch. */
export interface PassiveLookup {
  category: "resistors" | "capacitors"
  query: Record<JlcsearchQueryField, string>
}

export interface BomLine {
  designators: string[]
  /** Per board */
  quantity: number
  /** The BOM's Comment / Value column */
  comment: string
  requestedJlcPartNumber?: LcscPartNumber
  passiveLookup?: PassiveLookup
}

export interface JlcPart {
  lcsc: LcscPartNumber
  mfr: string
  package: string
  isBasic: boolean
  isPreferred: boolean
  /** Price for one piece */
  unitPrice: number
  stock: number | null
  /** Quantity price breaks, ascending. Only from JLCPCB's parts library. */
  priceTiers: { fromQuantity: number; unitPrice: number }[]
  /**
   * What JLCPCB bills for extended parts on top of the quantity used.
   * Null when the source (jlcsearch) does not say.
   */
  billing: { spareQuantity: number; minimumQuantity: number } | null
  source: PartSource
}

export interface PricedBomLine extends BomLine {
  part: JlcPart
  matchMethod: "jlc_part_number" | "passive_spec"
  /** Pads of the part's JLCPCB footprint */
  footprintJoints: { smt: number; throughHole: number }
}

export interface QuoteLineItem {
  category: "pcb" | "review_charge" | "assembly" | "components"
  key: string
  label: string
  cost: number
  lowCost: number
  highCost: number
  confidence: Confidence
  note?: string
}

export interface QuoteSection {
  lineItems: QuoteLineItem[]
  warnings: string[]
}

export interface JlcpcbQuote {
  currency: "USD"
  priceTableVersion: string
  order: {
    quantity: number
    assembledQuantity: number
    assembly: AssemblyType
    surfaceFinish: SurfaceFinish
  }
  features: BoardFeatures
  lineItems: QuoteLineItem[]
  bom: PricedBomLine[]
  /** Lines left out because `unresolvedParts` is "exclude" */
  excludedBomLines: { line: BomLine; reason: string }[]
  pcbTotal: number
  assemblyTotal: number
  /** Manufacturing cost: bare PCBs + review charges + assembly + parts. */
  total: number
  lowTotal: number
  highTotal: number
  warnings: string[]
}
