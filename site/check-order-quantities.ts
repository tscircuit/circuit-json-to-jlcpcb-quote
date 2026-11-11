/**
 * Check the PCB and assembled-board counts the page's form holds. Returns
 * what is wrong, or null. Assembled boards may be fewer than PCBs (the rest
 * stay bare), never more.
 */
export const checkOrderQuantities = (counts: {
  quantityText: string
  assembledQuantityText: string
  isAssembled: boolean
}): string | null => {
  const quantity = Number(counts.quantityText)
  if (!Number.isInteger(quantity) || quantity < 1) {
    return "PCB quantity must be a whole number of at least 1."
  }
  if (!counts.isAssembled) return null
  const assembledQuantity = Number(counts.assembledQuantityText)
  if (!Number.isInteger(assembledQuantity) || assembledQuantity < 1) {
    return "Assembled boards must be a whole number of at least 1."
  }
  if (assembledQuantity > quantity) {
    return `Assembled boards (${assembledQuantity}) cannot be more than the PCB quantity (${quantity}).`
  }
  return null
}
