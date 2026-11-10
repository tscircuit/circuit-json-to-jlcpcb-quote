import type { AnyCircuitElement } from "circuit-json"

export type AssemblyType = "none" | "economic" | "standard"
export type SurfaceFinish = "hasl_leaded" | "hasl_lead_free" | "enig"
export type Confidence = "published" | "quoted" | "calibrated" | "heuristic"

export interface JlcpcbQuoteOptions {
  /** Bare PCBs ordered. Default 5. */
  quantity?: number
  /** Boards assembled. Default 2 (0 when assembly is "none"). */
  assembledQuantity?: number
  /** "auto" picks economic when the board allows it. Default "auto". */
  assembly?: AssemblyType | "auto"
  /** Default "hasl_leaded". */
  surfaceFinish?: SurfaceFinish
  /** Standard PCBA only. "auto" inspects BGA/LGA/QFN parts. Default "auto". */
  xrayInspection?: boolean | "auto"
  /** Default true. */
  confirmPartsPlacement?: boolean
  /** Default true. */
  confirmProductionFile?: boolean
  /** Economic PCBA only. Default true, as on the order form. */
  nitrogenReflow?: boolean
  /** Multiplies published fees, for exchange-rate drift. Default 1. */
  priceAdjustmentFactor?: number
  /** Set false to skip jlcsearch lookups (parts priced at 0). */
  lookupParts?: boolean
  jlcsearchBaseUrl?: string
  fetch?: typeof fetch
}

export interface BoardFeatures {
  widthMm: number
  heightMm: number
  numLayers: number
  thicknessMm: number
  material: string
  viaCount: number
  /** The via most likely to draw a supplement: smallest hole, then pad. */
  smallestVia: { holeDiameterMm: number; outerDiameterMm: number } | null
  minPlatedHoleDiameterMm: number | null
  holeCount: number
  minTraceWidthMm: number | null
  sidesWithComponents: ("top" | "bottom")[]
}

export interface BomLine {
  designators: string[]
  /** Per board */
  quantity: number
  ftype?: string
  value?: string
  manufacturerPartNumber?: string
  requestedJlcPartNumber?: string
  smtJointsPerPart: number
  throughHoleJointsPerPart: number
  /** jlcsearch category query used when no part number is given */
  valueLookup?: {
    category: "resistors" | "capacitors" | "leds"
    params: Record<string, string>
  }
  /** Filled by the jlcsearch lookup */
  part?: {
    lcsc: string
    mfr: string
    package: string
    description: string
    isBasic: boolean
    isPreferred: boolean
    unitPrice: number
    stock: number | null
  }
  matchMethod?: "jlc_part_number" | "manufacturer_part_number" | "value"
}

export interface QuoteLineItem {
  category: "pcb" | "supplement" | "assembly" | "components"
  key: string
  label: string
  cost: number
  lowCost: number
  highCost: number
  confidence: Confidence
  note?: string
}

export interface JlcpcbQuote {
  currency: "USD"
  priceTableVersion: string
  options: {
    quantity: number
    assembledQuantity: number
    assembly: AssemblyType
    surfaceFinish: SurfaceFinish
  }
  features: BoardFeatures
  lineItems: QuoteLineItem[]
  bom: BomLine[]
  pcbTotal: number
  assemblyTotal: number
  /** Manufacturing cost: bare PCBs + supplements + assembly + parts. */
  total: number
  lowTotal: number
  highTotal: number
  warnings: string[]
}

export type CircuitJson = AnyCircuitElement[]
