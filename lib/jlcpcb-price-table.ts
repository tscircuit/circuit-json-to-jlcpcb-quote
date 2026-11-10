/**
 * JLCPCB prices (USD) and the rules that trigger them, dated. Every number
 * says where it comes from:
 *
 * - "published": JLCPCB help pages
 *   https://jlcpcb.com/help/article/pcb-assembly-price
 *   https://jlcpcb.com/help/article/In-what-cases-will-there-be-charged-extra
 *   https://jlcpcb.com/help/article/fpc-extra-charges
 *   https://jlcpcb.com/capabilities/flex-pcb-capabilities
 * - "quoted": read off a live JLCPCB quote page (4 layers, 144.5x82mm,
 *   5 pcs, 5 assembled, economic PCBA, 2026-11-10)
 * - "calibrated": fitted to tscircuit's own shipped orders (Y45, Y63) and
 *   supplement notices, see tscircuit/jlcpcb-manufacturing-specs
 *   datasets/jlcpcb
 * - "heuristic": approximation with no primary source yet. These carry a wide
 *   low/high range and should be replaced with real quotes.
 */
import type { LayerCount } from "./types"

export const JLCPCB_PRICE_TABLE_VERSION = "2026-11-10"

/** What the order form is taken to say when the caller does not */
export const orderDefaults = {
  quantity: 5,
  assembledQuantity: 2,
  surfaceFinish: "hasl_leaded",
  jlcsearchBaseUrl: "https://jlcsearch.tscircuit.com",
} as const

export const fabricationPrices = {
  /** Special offers apply up to this side length and these quantities */
  specialOfferMaxSideMm: 100,
  specialOffer5PcsMaxQuantity: 5,
  specialOffer10PcsMaxQuantity: 10,
  /** The 5 pcs offer is calibrated up to this layer count */
  calibratedSpecialOfferMaxLayers: 4,
  /** 5 pcs, 1.6mm, leaded HASL. 1-4 layers calibrated, 6 layers published. */
  specialOffer5Pcs: new Map<LayerCount, number>([
    [1, 2],
    [2, 2],
    [4, 7],
    [6, 35],
  ]),
  /** heuristic: 10 pcs */
  specialOffer10Pcs: new Map<LayerCount, number>([
    [1, 5],
    [2, 5],
    [4, 15],
  ]),
  /**
   * Engineering fee + price per m2 of ordered board area, by layer count.
   * 4 layers is quoted ($25 + $7.30 for 0.0592 m2); the rest is heuristic.
   */
  areaPricing: new Map<LayerCount, { engineering: number; perM2: number }>([
    [1, { engineering: 8, perM2: 100 }],
    [2, { engineering: 8, perM2: 110 }],
    [4, { engineering: 25, perM2: 123.2 }],
    [6, { engineering: 45, perM2: 250 }],
    [8, { engineering: 75, perM2: 400 }],
  ]),
  /** Layer counts whose area pricing is quoted rather than heuristic */
  quotedAreaPricingLayers: [4],
  quotedRange: { lowFraction: 0.9, highFraction: 1.15 },
  heuristicRange: { lowFraction: 0.65, highFraction: 1.35 },
  /** 4 layers quoted; 1-2 layers heuristic */
  leadFreeHaslSurcharge: new Map<LayerCount, number>([
    [1, 1],
    [2, 1],
    [4, 5.3],
  ]),
  quotedLeadFreeHaslLayers: [4],
  /** heuristic */
  enigSurcharge: new Map<LayerCount, number>([
    [1, 14.5],
    [2, 14.5],
    [4, 16],
  ]),
  enigRange: { lowFraction: 0.6, highFraction: 1.6 },
  /** quoted: "Confirm Production file: Yes" */
  confirmProductionFile: 1.05,
  /** The only rigid thickness with price data */
  pricedRigidThicknessMm: 1.6,
  /**
   * heuristic: flex (FPC) boards. JLCPCB publishes no flex price table and no
   * tscircuit flex order has been recorded yet, so these are placeholders.
   */
  flex: {
    /** The order form's default for 2-layer flex */
    defaultThicknessMm: 0.11,
    engineering: 15,
    perM2: 600,
    range: { lowFraction: 0.5, highFraction: 1.5 },
    stiffener: 8,
    stiffenerRange: { lowFraction: 0, highFraction: 2.5 },
  },
}

export const reviewChargePrices = {
  /**
   * calibrated: the one notice with no duty/shipping bundled asks 54.18; the
   * 67.91 and 67.98 notices are 54.18 plus about 25% duty/VAT. Observed on
   * rigid boards with via holes of 0.2mm and smaller and pads up to 0.4mm;
   * a 0.3mm hole with a 0.4mm pad was not charged.
   */
  fourWireKelvinTest: {
    price: 54.18,
    viaHoleBelowMm: 0.3,
    viaPadUpToMm: 0.4,
  },
  /** published: per order, for holes below these diameters */
  verySmallVia: {
    price: 16.29,
    multilayerFromLayers: 4,
    holeBelowMm: { upTo2Layers: 0.15, multilayer: 0.2 },
  },
  /** published: rigid boards, per piece, by the shorter side */
  deburring: {
    sideBelowMm: 30,
    pricePerPiece: 0.02,
    tinySideBelowMm: 15,
    tinyPricePerPiece: 0.05,
  },
  /** published: a fraction of the board price for fine traces */
  fineTrace: {
    /** 3.0-3.5mil on rigid boards of 4 layers and up */
    rigidFromLayers: 4,
    rigidTraceBelowMm: 0.0895,
    rigidFraction4To8Layers: 0.2,
    rigidManyLayersFrom: 10,
    rigidFractionManyLayers: 0.3,
    /** 2-3mil on flex boards */
    flexTraceBelowMm: 0.0765,
    flexFraction: 0.2,
  },
  /** published thresholds whose prices JLCPCB shows only as images */
  unpricedThresholds: {
    holesPerM2: 150_000,
    boardAreaMm2: 65_000,
  },
}

/** published: what JLCPCB can make, used for warnings only */
export const capabilityLimits = {
  minViaHoleMm: { rigid: 0.1, flexUpTo2Layers: 0.1, flexMultilayer: 0.15 },
  flexMultilayerFromLayers: 4,
  rigidFineTraceMaxLayers: 2,
  /** 1-2 layer rigid boards */
  minTraceMmRigidUpTo2Layers: 0.0995,
  /** flex traces below this need 0.33oz copper */
  flexThinCopperTraceBelowMm: 0.089,
}

export const assemblyPrices = {
  /** quoted; the help page lists 8.18 / 1.53 / 3.07 / 0.0016, about 0.7% lower */
  economic: {
    setup: 8.24,
    stencil: 1.55,
    /** per unique extended part; basic and preferred parts are free */
    feederLoadingPerExtendedPart: 3.09,
    smtPerJoint: 0.0017,
    /** "Yes (for Economic)" is the order form default */
    nitrogenReflow: 0.91,
    /** Economic PCBA is offered up to this many layers */
    maxLayers: 6,
  },
  /** published */
  standard: {
    setupSingleSide: 25.56,
    setupDoubleSide: 51.12,
    stencilSingleSide: 8.21,
    stencilDoubleSide: 16.42,
    /** per unique part, basic and extended alike */
    feederLoadingPerPart: 1.53,
    smtPerJoint: 0.0016,
    packagingBase: 0.5,
    packagingPerCm2: 0.00003,
    /** flex boards are assembled on fixtures */
    flexFixturePrice: 24.63,
    flexFixtureTiers: [
      { maxBoards: 29, fixtures: 2 },
      { maxBoards: 99, fixtures: 3 },
      { maxBoards: 199, fixtures: 5 },
      { maxBoards: 349, fixtures: 10 },
      { maxBoards: 499, fixtures: 15 },
      { maxBoards: Number.POSITIVE_INFINITY, fixtures: 20 },
    ],
    xrayPerPieceTiers: [
      { maxPieces: 10, pricePerPiece: 1.64 },
      { maxPieces: 50, pricePerPiece: 0.82 },
      { maxPieces: 200, pricePerPiece: 0.49 },
      { maxPieces: 500, pricePerPiece: 0.33 },
      { maxPieces: 1000, pricePerPiece: 0.25 },
      { maxPieces: 3000, pricePerPiece: 0.16 },
      { maxPieces: Number.POSITIVE_INFINITY, pricePerPiece: 0.082 },
    ],
    /** Packages whose joints are hidden under the part */
    xrayPackagePattern: /BGA|LGA|QFN|CSP/i,
  },
  /** quoted: parts soldered by hand */
  throughHolePerJoint: 0.0165,
  handSolderingLaborPerOrder: 3.61,
  /** published */
  confirmPartsPlacement: 0.45,
}

/**
 * Spares for extended parts when the part source does not report JLCPCB's
 * own spare and minimum quantities, which jlcsearch does not today. Fitted
 * to the quoted BOM.
 */
export const estimatedPartBilling = {
  cheapUnitPriceBelow: 0.03,
  cheapSpareQuantity: 6,
  cheapMinimumQuantity: 20,
  midUnitPriceBelow: 0.2,
  midSpareQuantity: 4,
  range: { lowFraction: 0.9, highFraction: 1.1 },
}

/** How fabrication files are read */
export const fabricationFileRules = {
  /** Plated holes up to this size are vias; component leads need more. */
  maxViaHoleMm: 0.45,
  /** A via's pad is the round flash within this distance of its hole */
  viaPadPositionToleranceMm: 0.002,
}

/** Part lookups are retried because jlcsearch rejects bursts */
export const lookupRetry = {
  attempts: 5,
  delayMsPerAttempt: 2000,
}
