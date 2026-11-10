import type { BoardSide } from "../types"
import { parseCsvRows } from "./parse-csv-rows"

/** Which sides the pick-and-place file puts parts on, top first. */
export const getSidesWithComponents = (
  pickAndPlaceCsv: string,
): BoardSide[] => {
  const sides = new Set<BoardSide>()
  for (const placementRow of parseCsvRows(pickAndPlaceCsv)) {
    const layer = (placementRow.Layer ?? placementRow.Side ?? "").toLowerCase()
    if (layer.startsWith("t") || layer.startsWith("f")) sides.add("top")
    else if (layer.startsWith("b")) sides.add("bottom")
    else {
      throw new Error(
        `Pick-and-place row for ${placementRow.Designator} has no top/bottom layer`,
      )
    }
  }
  const orderedSides: BoardSide[] = ["top", "bottom"]
  return orderedSides.filter((side) => sides.has(side))
}
