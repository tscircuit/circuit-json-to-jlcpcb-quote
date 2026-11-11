import { orderDefaults } from "../jlcpcb-price-table"
import type { JlcpcbQuoteOptions } from "../types"

const isWholeCount = (count: number) => Number.isInteger(count) && count >= 1

/**
 * The PCB and assembled-board counts of an order, checked. Some PCBs can be
 * left bare, so the assembled count may be lower than the PCB count, never
 * higher. The default assembled count is capped at the PCB count.
 */
export const getOrderQuantities = (
  options: Pick<JlcpcbQuoteOptions, "quantity" | "assembledQuantity">,
): { quantity: number; assembledQuantity: number } => {
  const quantity = options.quantity ?? orderDefaults.quantity
  if (!isWholeCount(quantity)) {
    throw new Error(
      `PCB quantity must be a whole number of at least 1, not ${quantity}`,
    )
  }
  const assembledQuantity =
    options.assembledQuantity ??
    Math.min(orderDefaults.assembledQuantity, quantity)
  if (!isWholeCount(assembledQuantity)) {
    throw new Error(
      `Assembled boards must be a whole number of at least 1, not ${assembledQuantity}`,
    )
  }
  if (assembledQuantity > quantity) {
    throw new Error(
      `Cannot assemble ${assembledQuantity} boards from ${quantity} PCBs; assembled boards must not exceed the PCB quantity`,
    )
  }
  return { quantity, assembledQuantity }
}
