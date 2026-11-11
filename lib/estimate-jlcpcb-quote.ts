import { roundToCents } from "./estimate/create-quote-line-item"
import { estimateAdditionalFees } from "./estimate/estimate-additional-fees"
import {
  estimateAssemblyOption,
  sumLineItems,
} from "./estimate/estimate-assembly-option"
import { estimateBarePcb } from "./estimate/estimate-bare-pcb"
import { estimateShippingOptions } from "./estimate/estimate-shipping-options"
import { selectAssemblyType } from "./estimate/select-assembly-type"
import {
  JLCPCB_PRICE_TABLE_VERSION,
  landedCostPrices,
  orderDefaults,
} from "./jlcpcb-price-table"
import type {
  AssemblyOption,
  BoardFeatures,
  JlcpcbQuote,
  JlcpcbQuoteOptions,
  PricedBomLine,
} from "./types"

const ASSEMBLY_SERVICES: AssemblyOption["assembly"][] = ["economic", "standard"]

/**
 * Price a board from its features and priced BOM. Pure: no network, so real
 * orders can be replayed against it in tests.
 *
 * The quote keeps three things apart: board fabrication at the standard
 * price, additional fees the design triggers (each with its reason and how
 * to avoid it), and assembly, priced for both Economic and Standard PCBA.
 */
export const estimateJlcpcbQuote = (order: {
  features: BoardFeatures
  bom: PricedBomLine[]
  options?: JlcpcbQuoteOptions
  excludedBomLines?: JlcpcbQuote["excludedBomLines"]
  warnings?: string[]
}): JlcpcbQuote => {
  const { features, bom } = order
  const options = order.options ?? {}
  const quantity = options.quantity ?? orderDefaults.quantity
  const surfaceFinish = options.surfaceFinish ?? orderDefaults.surfaceFinish

  const fabrication = estimateBarePcb({
    features,
    quantity,
    surfaceFinish,
    confirmProductionFile: options.confirmProductionFile !== false,
  })
  const review = estimateAdditionalFees({
    features,
    quantity,
    boardCost: fabrication.boardCost,
  })

  const requestedAssembledQuantity =
    options.assembledQuantity ?? orderDefaults.assembledQuantity
  const assembly = selectAssemblyType({
    features,
    bom,
    assembledQuantity: requestedAssembledQuantity,
    requestedAssembly: options.assembly,
  })
  const assembledQuantity = assembly === "none" ? 0 : requestedAssembledQuantity
  const assemblyOptions =
    assembly === "none"
      ? []
      : ASSEMBLY_SERVICES.map((service) =>
          estimateAssemblyOption({
            assembly: service,
            features,
            bom,
            assembledQuantity,
            options,
          }),
        )
  const selectedOption = assemblyOptions.find(
    (option) => option.assembly === assembly,
  )

  const lineItems = [
    ...fabrication.lineItems,
    ...review.additionalFees,
    ...(selectedOption?.lineItems ?? []),
  ]
  const fabricationTotal = sumLineItems(fabrication.lineItems, "cost")
  const merchandise = {
    total: sumLineItems(lineItems, "cost"),
    lowTotal: sumLineItems(lineItems, "lowCost"),
    highTotal: sumLineItems(lineItems, "highCost"),
  }
  const carrier = options.carrier ?? orderDefaults.carrier
  const shippingOptions = estimateShippingOptions({
    features,
    quantity,
    assembledQuantity,
    merchandise,
    selectedCarrier: carrier,
    shippingCost: options.shippingCost,
    shippingWeightKg: options.shippingWeightKg,
    salesTaxRate: options.salesTaxRate ?? landedCostPrices.defaultSalesTaxRate,
  })
  const selectedShipping = shippingOptions.find(
    (option) => option.carrier === carrier,
  )
  if (!selectedShipping) throw new Error(`No shipping option for ${carrier}`)
  return {
    currency: "USD",
    priceTableVersion: JLCPCB_PRICE_TABLE_VERSION,
    order: { quantity, assembledQuantity, assembly, surfaceFinish, carrier },
    features,
    fabricationLineItems: fabrication.lineItems,
    fabricationTotal,
    fabricationPerBoard: roundToCents(fabricationTotal / quantity),
    additionalFees: review.additionalFees,
    additionalFeesTotal: sumLineItems(review.additionalFees, "cost"),
    assemblyOptions,
    assemblyTotal: selectedOption?.total ?? 0,
    lineItems,
    bom: assembly === "none" ? [] : bom,
    excludedBomLines: order.excludedBomLines ?? [],
    ...merchandise,
    shippingOptions,
    grandTotal: selectedShipping.grandTotal,
    lowGrandTotal: selectedShipping.lowGrandTotal,
    highGrandTotal: selectedShipping.highGrandTotal,
    warnings: [
      ...(order.warnings ?? []),
      ...fabrication.warnings,
      ...review.warnings,
      ...(selectedOption?.warnings ?? []),
    ],
  }
}
