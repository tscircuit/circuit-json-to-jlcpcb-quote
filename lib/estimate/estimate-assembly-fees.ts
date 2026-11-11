import { assemblyPrices } from "../jlcpcb-price-table"
import type {
  BoardFeatures,
  JlcpcbQuoteOptions,
  PricedBomLine,
  QuoteLineItem,
} from "../types"
import { createQuoteLineItem } from "./create-quote-line-item"
import { isHandSoldered } from "./is-hand-soldered"

interface AssemblyOrder {
  features: BoardFeatures
  bom: PricedBomLine[]
  assembly: "economic" | "standard"
  assembledQuantity: number
  options: Pick<
    JlcpcbQuoteOptions,
    "xrayInspection" | "confirmPartsPlacement" | "nitrogenReflow"
  >
}

const estimateEconomicFees = (order: AssemblyOrder): QuoteLineItem[] => {
  const prices = assemblyPrices.economic
  const extendedLines = order.bom.filter(
    (line) =>
      !line.part.isBasic && !line.part.isPreferred && !isHandSoldered(line),
  )
  const loadingCost = extendedLines.length * prices.feederLoadingPerExtendedPart
  const lineItems = [
    createQuoteLineItem({
      category: "assembly",
      key: "setup",
      label: "Setup fee",
      cost: prices.setup,
      confidence: "quoted",
    }),
    createQuoteLineItem({
      category: "assembly",
      key: "stencil",
      label: "Stencil",
      cost: prices.stencil,
      confidence: "quoted",
    }),
    createQuoteLineItem({
      category: "assembly",
      key: "feeder_loading",
      label: `Extended parts loading (${extendedLines.length} of ${order.bom.length} unique parts)`,
      cost: loadingCost,
      confidence: "quoted",
    }),
  ]
  if (order.options.nitrogenReflow !== false) {
    lineItems.push(
      createQuoteLineItem({
        category: "assembly",
        key: "nitrogen_reflow",
        label: "Nitrogen reflow soldering",
        cost: prices.nitrogenReflow,
        confidence: "quoted",
      }),
    )
  }
  return lineItems
}

const estimateXray = (order: AssemblyOrder): QuoteLineItem[] => {
  const prices = assemblyPrices.standard
  if (order.options.xrayInspection === false) return []
  const inspectedParts = order.bom
    .filter((line) => prices.xrayPackagePattern.test(line.part.package))
    .reduce((count, line) => count + line.quantity, 0)
  if (inspectedParts === 0) return []
  const pieces = inspectedParts * order.assembledQuantity
  const tier = prices.xrayPerPieceTiers.find(
    (candidate) => pieces <= candidate.maxPieces,
  )
  if (!tier) throw new Error(`No X-ray price for ${pieces} pieces`)
  return [
    createQuoteLineItem({
      category: "assembly",
      key: "xray",
      label: `X-ray inspection (${pieces} BGA/LGA/QFN placements)`,
      cost: pieces * tier.pricePerPiece,
      lowCost: 0,
      confidence: "published",
      note: "Optional on the order form",
    }),
  ]
}

const estimateFlexFixtures = (order: AssemblyOrder): QuoteLineItem[] => {
  const prices = assemblyPrices.standard
  if (order.features.material !== "flex") return []
  const tier = prices.flexFixtureTiers.find(
    (candidate) => order.assembledQuantity <= candidate.maxBoards,
  )
  if (!tier) {
    throw new Error(`No fixture count for ${order.assembledQuantity} boards`)
  }
  return [
    createQuoteLineItem({
      category: "assembly",
      key: "fixture",
      label: `Flex assembly fixtures (${tier.fixtures})`,
      cost: tier.fixtures * prices.flexFixturePrice,
      confidence: "published",
    }),
  ]
}

const estimateStandardFees = (order: AssemblyOrder): QuoteLineItem[] => {
  const prices = assemblyPrices.standard
  const { features } = order
  const isDoubleSided = features.sidesWithComponents.length > 1
  const loadedLines = order.bom.filter((line) => !isHandSoldered(line))
  const boardAreaCm2 = (features.widthMm * features.heightMm) / 100
  return [
    createQuoteLineItem({
      category: "assembly",
      key: "setup",
      label: `Setup fee (${isDoubleSided ? "both sides" : "one side"})`,
      cost: isDoubleSided ? prices.setupDoubleSide : prices.setupSingleSide,
      confidence: "published",
    }),
    createQuoteLineItem({
      category: "assembly",
      key: "stencil",
      label: "Stencil",
      cost: isDoubleSided ? prices.stencilDoubleSide : prices.stencilSingleSide,
      confidence: "published",
    }),
    createQuoteLineItem({
      category: "assembly",
      key: "feeder_loading",
      label: `Parts loading (${loadedLines.length} unique parts)`,
      cost: loadedLines.length * prices.feederLoadingPerPart,
      confidence: "published",
    }),
    createQuoteLineItem({
      category: "assembly",
      key: "packaging",
      label: "Packaging",
      cost: prices.packagingBase + prices.packagingPerCm2 * boardAreaCm2,
      confidence: "published",
    }),
    ...estimateFlexFixtures(order),
    ...estimateXray(order),
  ]
}

const estimateJointFees = (order: AssemblyOrder): QuoteLineItem[] => {
  const smtJoints = order.features.smtJointsPerBoard * order.assembledQuantity
  const manualJoints =
    order.assembledQuantity *
    order.bom
      .filter(isHandSoldered)
      .reduce(
        (joints, line) =>
          joints + line.quantity * line.footprintJoints.throughHole,
        0,
      )
  const lineItems = [
    createQuoteLineItem({
      category: "assembly",
      key: "smt_placement",
      label: `SMT placement (${smtJoints} joints)`,
      cost: smtJoints * assemblyPrices[order.assembly].smtPerJoint,
      confidence: order.assembly === "economic" ? "quoted" : "published",
    }),
  ]
  if (manualJoints > 0) {
    lineItems.push(
      createQuoteLineItem({
        category: "assembly",
        key: "through_hole",
        label: `Through-hole soldering (${manualJoints} joints)`,
        cost:
          assemblyPrices.handSolderingLaborPerOrder +
          manualJoints * assemblyPrices.throughHolePerJoint,
        confidence: "quoted",
      }),
    )
  }
  return lineItems
}

/** Assembly fees, without the parts themselves. */
export const estimateAssemblyFees = (order: AssemblyOrder): QuoteLineItem[] => {
  const lineItems = [
    ...(order.assembly === "economic"
      ? estimateEconomicFees(order)
      : estimateStandardFees(order)),
    ...estimateJointFees(order),
  ]
  if (order.options.confirmPartsPlacement !== false) {
    lineItems.push(
      createQuoteLineItem({
        category: "assembly",
        key: "confirm_parts_placement",
        label: "Confirm parts placement",
        cost: assemblyPrices.confirmPartsPlacement,
        confidence: "published",
      }),
    )
  }
  return lineItems
}
