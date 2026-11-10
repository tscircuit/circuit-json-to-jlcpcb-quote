import type { BoardFeatures, CircuitJson } from "./types"

export const extractBoardFeatures = (
  circuitJson: CircuitJson,
): { features: BoardFeatures; warnings: string[] } => {
  const warnings: string[] = []
  const boards = circuitJson.filter((el) => el.type === "pcb_board")
  const board = boards[0]
  if (!board) throw new Error("Circuit JSON has no pcb_board")
  if (boards.length > 1) {
    warnings.push(
      `${boards.length} pcb_board elements found; quoting the first one only (panels are not supported yet)`,
    )
  }

  let widthMm = board.width ?? 0
  let heightMm = board.height ?? 0
  if (board.outline && board.outline.length > 2) {
    const xs = board.outline.map((p) => p.x)
    const ys = board.outline.map((p) => p.y)
    widthMm = Math.max(...xs) - Math.min(...xs)
    heightMm = Math.max(...ys) - Math.min(...ys)
  }
  if (!(widthMm > 0 && heightMm > 0)) {
    throw new Error("pcb_board has no width/height or outline")
  }

  let smallestVia: BoardFeatures["smallestVia"] = null
  let viaCount = 0
  let holeCount = 0
  let minPlatedHoleDiameterMm: number | null = null
  let minTraceWidthMm: number | null = null
  const sides = new Set<"top" | "bottom">()

  for (const el of circuitJson) {
    if (el.type === "pcb_via") {
      viaCount++
      holeCount++
      const via = {
        holeDiameterMm: el.hole_diameter,
        outerDiameterMm: el.outer_diameter,
      }
      if (
        !smallestVia ||
        via.holeDiameterMm < smallestVia.holeDiameterMm ||
        (via.holeDiameterMm === smallestVia.holeDiameterMm &&
          via.outerDiameterMm < smallestVia.outerDiameterMm)
      ) {
        smallestVia = via
      }
    } else if (el.type === "pcb_plated_hole") {
      holeCount++
      const diameter =
        "hole_diameter" in el
          ? el.hole_diameter
          : Math.min(el.hole_width ?? 0, el.hole_height ?? 0) || undefined
      if (diameter !== undefined) {
        minPlatedHoleDiameterMm = Math.min(
          minPlatedHoleDiameterMm ?? diameter,
          diameter,
        )
      }
    } else if (el.type === "pcb_hole") {
      holeCount++
    } else if (el.type === "pcb_trace") {
      for (const point of el.route) {
        if (point.route_type !== "wire") continue
        minTraceWidthMm = Math.min(minTraceWidthMm ?? point.width, point.width)
      }
    } else if (el.type === "pcb_component") {
      if (el.layer === "top" || el.layer === "bottom") sides.add(el.layer)
    }
  }

  return {
    features: {
      widthMm: round(widthMm),
      heightMm: round(heightMm),
      numLayers: board.num_layers,
      thicknessMm: board.thickness,
      material: board.material,
      viaCount,
      smallestVia,
      minPlatedHoleDiameterMm,
      holeCount,
      minTraceWidthMm,
      sidesWithComponents: [...sides].sort().reverse() as ("top" | "bottom")[],
    },
    warnings,
  }
}

const round = (value: number) => Math.round(value * 1000) / 1000
