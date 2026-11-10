/**
 * JLCPCB prices in USD, dated. Every number says where it comes from:
 *
 * - "published": JLCPCB help pages
 *   https://jlcpcb.com/help/article/pcb-assembly-price
 *   https://jlcpcb.com/help/article/In-what-cases-will-there-be-charged-extra
 * - "quoted": read off a live JLCPCB quote page (dual-rp2350 board,
 *   2026-11-10: 4 layers, 144.5x82mm, 5 pcs, 5 assembled, economic PCBA)
 * - "calibrated": fitted to tscircuit's own shipped orders (Y45, Y63) and
 *   supplement notices (Y34, Y42, Y43, Y45), see
 *   tscircuit/jlcpcb-manufacturing-specs datasets/jlcpcb
 * - "heuristic": approximation with no primary source yet. These carry a wide
 *   low/high range and should be replaced with real quotes.
 */
export const JLCPCB_PRICE_TABLE_VERSION = "2026-11-10"

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
  },
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
  },
  /** quoted */
  throughHolePerJoint: 0.0165,
  handSolderingLaborPerOrder: 3.61,
  confirmPartsPlacement: 0.45,
  /** [max pieces, price per piece] */
  xrayPerPieceTiers: [
    [10, 1.64],
    [50, 0.82],
    [200, 0.49],
    [500, 0.33],
    [1000, 0.25],
    [3000, 0.16],
    [Number.POSITIVE_INFINITY, 0.082],
  ] as [number, number][],
}

export const supplementPrices = {
  /**
   * calibrated: the one notice with no duty/shipping bundled asks 54.18; the
   * 67.91 and 67.98 notices are 54.18 plus about 25% duty/VAT.
   */
  fourWireKelvinTest: 54.18,
  /** published: 0.15mm hole on 4 layers (0.1mm on 2 layers), per order */
  verySmallViaPerOrder: 16.29,
  /** published: deburring per piece */
  deburrSide15To30mmPerPiece: 0.02,
  deburrSideUnder15mmPerPiece: 0.05,
  /** published: 3.0-3.5mil trace/space on 4-8 layers (30% on 10+) */
  fineTraceFraction4To8Layers: 0.2,
  fineTraceFraction10PlusLayers: 0.3,
}

export const fabricationPrices = {
  /** 5 pcs, at most 100x100mm, 1.6mm, leaded HASL */
  specialOffer5Pcs: { 1: 2, 2: 2, 4: 7, 6: 35 } as Record<number, number>,
  /** heuristic: 10 pcs at most 100x100mm */
  specialOffer10Pcs: { 1: 5, 2: 5, 4: 15 } as Record<number, number>,
  /** heuristic: engineering fee + price per m2 of ordered board area */
  areaPricing: {
    1: { engineering: 8, perM2: 100 },
    2: { engineering: 8, perM2: 110 },
    /** quoted: $25 engineering + $7.30 board for 0.0592 m2 */
    4: { engineering: 25, perM2: 123.2 },
    6: { engineering: 45, perM2: 250 },
    8: { engineering: 75, perM2: 400 },
  } as Record<number, { engineering: number; perM2: number }>,
  heuristicRangeFraction: 0.35,
  /** quoted for 4 layers; 1-2 layers are heuristic */
  leadFreeHaslSurcharge: { 1: 1, 2: 1, 4: 5.3 } as Record<number, number>,
  /** quoted: "Confirm Production file: Yes" */
  confirmProductionFile: 1.05,
  /** heuristic */
  enigSurcharge: { 1: 14.5, 2: 14.5, 4: 16 } as Record<number, number>,
}
