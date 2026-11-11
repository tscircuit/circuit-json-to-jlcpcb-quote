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
export type ShippingCarrier = "dhl" | "ups"
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
  /** Carrier whose shipping and taxes go into `grandTotal`. Default "dhl". */
  carrier?: ShippingCarrier
  /**
   * The exact shipping cost JLCPCB's checkout shows for `carrier`. Without it
   * shipping is estimated from the order weight.
   */
  shippingCost?: number
  /** Order weight in kg, as JLCPCB's quote page shows it. Estimated if absent. */
  shippingWeightKg?: number
  /**
   * Combined state and local sales tax rate of the US delivery address, e.g.
   * 0.0725. Defaults to the rate on tscircuit's own orders.
   */
  salesTaxRate?: number
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
  /** JLCPCB's description, ending with the part category */
  description: string
  isBasic: boolean
  isPreferred: boolean
  /** Price for one piece */
  unitPrice: number
  stock: number | null
  /**
   * Quantity price breaks, ascending. Empty when the part source does not
   * report them; jlcsearch does not today.
   */
  priceTiers: { fromQuantity: number; unitPrice: number }[]
  /**
   * What JLCPCB bills for extended parts on top of the quantity used. Null
   * when the part source does not report it (jlcsearch does not today); the
   * spares are then estimated.
   */
  billing: { spareQuantity: number; minimumQuantity: number } | null
}

export interface PricedBomLine extends BomLine {
  part: JlcPart
  matchMethod: "jlc_part_number" | "passive_spec"
  /** Pads of the part's JLCPCB footprint */
  footprintJoints: { smt: number; throughHole: number }
}

export interface QuoteLineItem {
  category:
    | "fabrication"
    | "additional_fee"
    | "assembly"
    | "components"
    | "shipping_and_taxes"
  key: string
  label: string
  cost: number
  lowCost: number
  highCost: number
  confidence: Confidence
  note?: string
}

/**
 * A charge JLCPCB adds on top of the standard price because of something in
 * the design, such as the 4-wire Kelvin test for very small vias. Kept apart
 * from the fabrication and assembly prices because the design can avoid it.
 */
export interface AdditionalFee extends QuoteLineItem {
  category: "additional_fee"
  /** What in the design triggers the fee */
  reason: string
  /** What to change in the design so the fee does not apply */
  howToAvoid: string
}

export interface QuoteSection {
  lineItems: QuoteLineItem[]
  warnings: string[]
}

/** The price of one PCBA service for this order: fees plus parts */
export interface AssemblyOption {
  assembly: "economic" | "standard"
  /** Why JLCPCB does not offer this service for the order; empty if it does */
  unavailableReasons: string[]
  lineItems: QuoteLineItem[]
  total: number
  lowTotal: number
  highTotal: number
  /** `total` divided by the assembled quantity */
  perBoard: number
  warnings: string[]
}

/** Delivery and the taxes charged at checkout, for one carrier */
export interface ShippingOption {
  carrier: ShippingCarrier
  /** e.g. "DHL Express (DDP)" */
  service: string
  weightKg: number
  /** Shipping, import taxes, disbursement fee and sales tax */
  lineItems: QuoteLineItem[]
  /** Sum of `lineItems` */
  total: number
  lowTotal: number
  highTotal: number
  /** Merchandise total plus `total`: what JLCPCB's checkout charges */
  grandTotal: number
  lowGrandTotal: number
  highGrandTotal: number
}

export interface JlcpcbQuote {
  currency: "USD"
  priceTableVersion: string
  order: {
    quantity: number
    assembledQuantity: number
    /** The PCBA service the totals below are for */
    assembly: AssemblyType
    surfaceFinish: SurfaceFinish
    /** The carrier `grandTotal` is for */
    carrier: ShippingCarrier
  }
  features: BoardFeatures

  /** Bare boards at the standard price, without additional fees */
  fabricationLineItems: QuoteLineItem[]
  fabricationTotal: number
  /** `fabricationTotal` divided by the board quantity */
  fabricationPerBoard: number

  /** Charges triggered by the design; see `AdditionalFee` */
  additionalFees: AdditionalFee[]
  additionalFeesTotal: number

  /** Economic and Standard PCBA side by side; empty without assembly */
  assemblyOptions: AssemblyOption[]
  /** Total of the PCBA service in `order.assembly` (0 without assembly) */
  assemblyTotal: number

  /** Every line item of the order as quoted, with `order.assembly` */
  lineItems: QuoteLineItem[]
  bom: PricedBomLine[]
  /** Lines left out because `unresolvedParts` is "exclude" */
  excludedBomLines: { line: BomLine; reason: string }[]
  /**
   * JLCPCB's "Merchandise Total": fabricationTotal + additionalFeesTotal +
   * assemblyTotal. Excludes shipping and taxes.
   */
  total: number
  lowTotal: number
  highTotal: number

  /** Shipping and taxes for each carrier, side by side */
  shippingOptions: ShippingOption[]
  /** Merchandise total plus shipping and taxes for `order.carrier` */
  grandTotal: number
  lowGrandTotal: number
  highGrandTotal: number
  warnings: string[]
}
