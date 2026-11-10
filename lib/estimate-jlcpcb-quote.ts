import {
  JLCPCB_PRICE_TABLE_VERSION,
  assemblyPrices,
  fabricationPrices,
  supplementPrices,
} from "./jlcpcb-price-table"
import type {
  AssemblyType,
  BoardFeatures,
  BomLine,
  Confidence,
  JlcpcbQuote,
  JlcpcbQuoteOptions,
  QuoteLineItem,
} from "./types"

const XRAY_PACKAGE = /BGA|LGA|QFN|CSP/i

/**
 * Price a board from its extracted features and resolved BOM. Pure: no
 * network, so real orders can be replayed against it in tests.
 */
export const estimateJlcpcbQuote = (params: {
  features: BoardFeatures
  bom: BomLine[]
  options?: JlcpcbQuoteOptions
  warnings?: string[]
  /** Joint counts measured from the layout, when the BOM lines carry none. */
  jointsPerBoard?: { smt?: number; throughHole?: number }
}): JlcpcbQuote => {
  const { features } = params
  const options = params.options ?? {}
  const warnings = [...(params.warnings ?? [])]
  const lineItems: QuoteLineItem[] = []
  const factor = options.priceAdjustmentFactor ?? 1
  const quantity = options.quantity ?? 5
  const surfaceFinish = options.surfaceFinish ?? "hasl_leaded"
  const layers = features.numLayers

  const add = (
    category: QuoteLineItem["category"],
    key: string,
    label: string,
    cost: number,
    confidence: Confidence,
    extra: { low?: number; high?: number; note?: string } = {},
  ) => {
    if (cost === 0 && !extra.high) return
    lineItems.push({
      category,
      key,
      label,
      cost: cents(cost),
      lowCost: cents(extra.low ?? cost),
      highCost: cents(extra.high ?? cost),
      confidence,
      note: extra.note,
    })
  }

  // ---- Bare PCB -----------------------------------------------------------
  if (features.material !== "fr4") {
    warnings.push(
      `Material "${features.material}" is priced as FR4; only FR4 is modelled`,
    )
  }
  if (features.thicknessMm !== 1.6) {
    warnings.push(
      `Thickness ${features.thicknessMm}mm is priced as 1.6mm; other thicknesses may cost more`,
    )
  }
  const fitsSpecialOffer = features.widthMm <= 100 && features.heightMm <= 100
  const areaM2 = (features.widthMm * features.heightMm * quantity) / 1e6
  const specialOffer =
    quantity <= 5
      ? fabricationPrices.specialOffer5Pcs[layers]
      : quantity <= 10
        ? fabricationPrices.specialOffer10Pcs[layers]
        : undefined
  let pcbBase: number
  if (fitsSpecialOffer && specialOffer !== undefined) {
    pcbBase = specialOffer
    add(
      "pcb",
      "pcb_base",
      `${layers}-layer FR4, ${quantity} pcs, special offer`,
      pcbBase,
      quantity <= 5 && layers <= 4 ? "calibrated" : "heuristic",
    )
  } else {
    const pricing =
      fabricationPrices.areaPricing[layers] ?? fabricationPrices.areaPricing[8]!
    if (!fabricationPrices.areaPricing[layers]) {
      warnings.push(`${layers}-layer boards are priced as 8-layer`)
    }
    pcbBase = pricing.engineering + pricing.perM2 * areaM2
    const range = fabricationPrices.heuristicRangeFraction
    add(
      "pcb",
      "pcb_base",
      `${layers}-layer FR4, ${quantity} pcs, engineering fee + ${areaM2.toFixed(3)} m²`,
      pcbBase,
      layers === 4 ? "quoted" : "heuristic",
      layers === 4
        ? {
            low: pcbBase * 0.9,
            high: pcbBase * 1.15,
            note: "Fitted to one quote (144.5x82mm, 5 pcs)",
          }
        : {
            low: pcbBase * (1 - range),
            high: pcbBase * (1 + range),
            note: "No real order of this size/quantity to calibrate against yet",
          },
    )
  }
  if (surfaceFinish === "hasl_lead_free") {
    const surcharge = fabricationPrices.leadFreeHaslSurcharge[layers] ?? 0
    add(
      "pcb",
      "lead_free_hasl",
      "Lead-free HASL",
      surcharge,
      layers === 4 ? "quoted" : "heuristic",
    )
  } else if (surfaceFinish === "enig") {
    const surcharge = fabricationPrices.enigSurcharge[layers] ?? 0
    add("pcb", "enig", "ENIG finish", surcharge, "heuristic", {
      low: surcharge * 0.6,
      high: surcharge * 1.6,
    })
  }

  if (options.confirmProductionFile !== false) {
    add(
      "pcb",
      "confirm_production_file",
      "Confirm production file",
      fabricationPrices.confirmProductionFile,
      "quoted",
    )
  }

  // ---- Charges JLCPCB engineers add after review --------------------------
  const via = features.smallestVia
  if (via && via.holeDiameterMm < 0.3 && via.outerDiameterMm <= 0.4) {
    add(
      "supplement",
      "four_wire_kelvin_test",
      `4-wire Kelvin test (via ${via.holeDiameterMm}/${via.outerDiameterMm}mm)`,
      supplementPrices.fourWireKelvinTest,
      "calibrated",
      {
        note: "Avoid it with vias of 0.3mm hole / 0.45mm diameter or larger",
      },
    )
  }
  if (via && via.holeDiameterMm < (layers >= 4 ? 0.2 : 0.15)) {
    add(
      "supplement",
      "very_small_via",
      `Very small via hole (${via.holeDiameterMm}mm)`,
      supplementPrices.verySmallViaPerOrder * factor,
      "published",
    )
  }
  const shortSide = Math.min(features.widthMm, features.heightMm)
  if (shortSide < 30) {
    add(
      "supplement",
      "deburring",
      "Small-board deburring",
      quantity *
        (shortSide < 15
          ? supplementPrices.deburrSideUnder15mmPerPiece
          : supplementPrices.deburrSide15To30mmPerPiece),
      "published",
    )
  }
  if (
    layers >= 4 &&
    features.minTraceWidthMm !== null &&
    features.minTraceWidthMm < 0.0895
  ) {
    const fraction =
      layers >= 10
        ? supplementPrices.fineTraceFraction10PlusLayers
        : supplementPrices.fineTraceFraction4To8Layers
    add(
      "supplement",
      "fine_trace",
      `Trace width ${features.minTraceWidthMm}mm (under 3.5mil)`,
      pcbBase * fraction,
      "published",
    )
  }
  if (features.holeCount / (areaM2 / quantity) > 150_000) {
    warnings.push(
      "Hole density is over 150,000 holes/m²; JLCPCB adds a charge that is not modelled",
    )
  }
  if (features.widthMm * features.heightMm > 65_000) {
    warnings.push(
      "Board is over 650 cm²; JLCPCB large-board charges are not modelled",
    )
  }
  if (via && via.holeDiameterMm < 0.15) {
    warnings.push(
      `Via hole ${via.holeDiameterMm}mm is below JLCPCB's 0.15mm minimum`,
    )
  }

  // ---- Assembly -----------------------------------------------------------
  const placed = params.bom.filter((line) => line.part)
  const doubleSided = features.sidesWithComponents.length > 1
  let assembly: AssemblyType
  if (options.assembly === "none" || placed.length === 0) {
    assembly = "none"
    if (options.assembly !== "none" && params.bom.length > 0) {
      warnings.push(
        "No BOM line resolved to a JLCPCB part; assembly not quoted",
      )
    }
  } else if (!options.assembly || options.assembly === "auto") {
    assembly = doubleSided || layers > 6 ? "standard" : "economic"
  } else {
    assembly = options.assembly
  }
  if (assembly === "economic" && doubleSided) {
    warnings.push(
      "Economic PCBA assembles one side only; bottom-side parts need Standard PCBA",
    )
  }
  const assembledQuantity =
    assembly === "none" ? 0 : (options.assembledQuantity ?? 2)

  if (assembly !== "none") {
    const p = assemblyPrices
    // Parts with plated holes and no SMT pads are soldered by hand: they are
    // billed per manual joint and are not loaded on a feeder.
    const isHandSoldered = (line: BomLine) =>
      line.throughHoleJointsPerPart > 0 && line.smtJointsPerPart === 0
    const smtJoints =
      assembledQuantity *
      (params.jointsPerBoard?.smt ??
        sum(placed, (line) => line.quantity * line.smtJointsPerPart))
    const thtJoints =
      assembledQuantity *
      (params.jointsPerBoard?.throughHole ??
        sum(
          placed.filter(isHandSoldered),
          (line) => line.quantity * line.throughHoleJointsPerPart,
        ))

    if (assembly === "economic") {
      add("assembly", "setup", "Setup fee", p.economic.setup * factor, "quoted")
      add(
        "assembly",
        "stencil",
        "Stencil",
        p.economic.stencil * factor,
        "quoted",
      )
      const extended = placed.filter(
        (line) =>
          !line.part!.isBasic &&
          !line.part!.isPreferred &&
          !isHandSoldered(line),
      )
      const loading =
        extended.length * p.economic.feederLoadingPerExtendedPart * factor
      add(
        "assembly",
        "feeder_loading",
        `Extended parts loading (${extended.length} of ${placed.length} unique parts)`,
        loading,
        "quoted",
        placed.every((line) => line.part!.source === "jlcpcb")
          ? {}
          : {
              low: loading * 0.9,
              note: "jlcsearch misses some parts JLCPCB exempts as preferred",
            },
      )
      if (options.nitrogenReflow !== false) {
        add(
          "assembly",
          "nitrogen_reflow",
          "Nitrogen reflow soldering",
          p.economic.nitrogenReflow * factor,
          "quoted",
        )
      }
    } else {
      add(
        "assembly",
        "setup",
        `Setup fee (${doubleSided ? "both sides" : "one side"})`,
        (doubleSided
          ? p.standard.setupDoubleSide
          : p.standard.setupSingleSide) * factor,
        "published",
      )
      add(
        "assembly",
        "stencil",
        "Stencil",
        (doubleSided
          ? p.standard.stencilDoubleSide
          : p.standard.stencilSingleSide) * factor,
        "published",
      )
      add(
        "assembly",
        "feeder_loading",
        `Parts loading (${placed.length} unique parts)`,
        placed.length * p.standard.feederLoadingPerPart * factor,
        "published",
      )
      add(
        "assembly",
        "packaging",
        "Packaging",
        (p.standard.packagingBase +
          p.standard.packagingPerCm2 *
            ((features.widthMm * features.heightMm) / 100)) *
          factor,
        "published",
      )
      const xrayParts = sum(
        placed.filter((line) => XRAY_PACKAGE.test(line.part!.package)),
        (line) => line.quantity,
      )
      const xray = options.xrayInspection ?? "auto"
      if (xray !== false && xrayParts > 0) {
        const pieces = xrayParts * assembledQuantity
        const perPiece = p.xrayPerPieceTiers.find(([max]) => pieces <= max)![1]
        add(
          "assembly",
          "xray",
          `X-ray inspection (${pieces} BGA/LGA/QFN placements)`,
          pieces * perPiece * factor,
          "published",
          { low: 0, note: "Optional on the order form" },
        )
      }
    }
    add(
      "assembly",
      "smt_placement",
      `SMT placement (${smtJoints} joints)`,
      smtJoints * p[assembly].smtPerJoint * factor,
      assembly === "economic" ? "quoted" : "published",
    )
    if (thtJoints > 0) {
      add(
        "assembly",
        "through_hole",
        `Through-hole soldering (${thtJoints} joints)`,
        (p.handSolderingLaborPerOrder + thtJoints * p.throughHolePerJoint) *
          factor,
        "quoted",
      )
    }
    if (options.confirmPartsPlacement !== false) {
      add(
        "assembly",
        "confirm_parts_placement",
        "Confirm parts placement",
        p.confirmPartsPlacement * factor,
        "published",
      )
    }

    // Parts. Basic parts are billed exactly as used. Extended parts are
    // billed with JLCPCB's spares and minimum quantity, at the price break
    // for the billed quantity. Without those fields (jlcsearch-only data) the
    // spares are estimated from the unit price.
    let partsCost = 0
    let partsWithoutSpares = 0
    let estimatedLines = 0
    for (const line of placed) {
      const part = line.part!
      const used = line.quantity * assembledQuantity
      let billed = used
      if (!part.isBasic) {
        if (part.spareQuantity !== undefined) {
          billed = Math.max(
            used + part.spareQuantity,
            part.minimumQuantity ?? 0,
          )
        } else if (part.unitPrice < 0.03) {
          billed = Math.max(20, used + 6)
        } else if (part.unitPrice < 0.2) {
          billed = used + 4
        }
      }
      const tier = part.priceTiers?.findLast(
        (candidate) => billed >= candidate.fromQuantity,
      )
      const unitPrice = tier?.unitPrice ?? part.unitPrice
      if (!part.priceTiers?.length) estimatedLines++
      partsCost += billed * unitPrice
      partsWithoutSpares += used * unitPrice
      if (part.stock !== null && part.stock < billed) {
        warnings.push(
          `${line.designators.join(",")}: ${part.lcsc} has ${part.stock} in stock at JLCPCB, ${billed} needed`,
        )
      }
    }
    add(
      "components",
      "components",
      `Parts for ${assembledQuantity} boards (${placed.length} unique)`,
      partsCost,
      estimatedLines === 0 ? "quoted" : "calibrated",
      estimatedLines === 0
        ? {}
        : {
            low: partsWithoutSpares * 0.9,
            high: partsCost * 1.1,
            note: `${estimatedLines} lines priced without JLCPCB quantity price breaks`,
          },
    )
  }

  const totalOf = (
    field: "cost" | "lowCost" | "highCost",
    categories: QuoteLineItem["category"][],
  ) =>
    cents(
      sum(
        lineItems.filter((item) => categories.includes(item.category)),
        (item) => item[field],
      ),
    )
  const all: QuoteLineItem["category"][] = [
    "pcb",
    "supplement",
    "assembly",
    "components",
  ]
  return {
    currency: "USD",
    priceTableVersion: JLCPCB_PRICE_TABLE_VERSION,
    options: { quantity, assembledQuantity, assembly, surfaceFinish },
    features,
    lineItems,
    bom: params.bom,
    pcbTotal: totalOf("cost", ["pcb", "supplement"]),
    assemblyTotal: totalOf("cost", ["assembly", "components"]),
    total: totalOf("cost", all),
    lowTotal: totalOf("lowCost", all),
    highTotal: totalOf("highCost", all),
    warnings,
  }
}

const cents = (value: number) => Math.round(value * 100) / 100
const sum = <T>(items: T[], pick: (item: T) => number) =>
  items.reduce((total, item) => total + pick(item), 0)
