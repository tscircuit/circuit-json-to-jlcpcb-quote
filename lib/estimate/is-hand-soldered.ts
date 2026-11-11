import type { PricedBomLine } from "../types"

/**
 * Parts with plated holes and no SMT pads are soldered by hand: they are
 * billed per manual joint and are not loaded on a feeder. A part with both
 * (a USB connector with shell tabs) is reflowed like any SMT part.
 */
export const isHandSoldered = (line: PricedBomLine) =>
  line.footprintJoints.throughHole > 0 && line.footprintJoints.smt === 0
