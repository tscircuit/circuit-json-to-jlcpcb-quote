import type { BoardFeatures, BomLine } from "./types"

interface GerberSummary {
  minX: number
  maxX: number
  minY: number
  maxY: number
  /** "x,y" (rounded to 1um) -> flashed circular aperture diameter, or 0 */
  flashes: Map<string, number>
  flashCount: number
  minDrawWidthMm: number | null
}

const positionKey = (x: number, y: number) => `${x.toFixed(3)},${y.toFixed(3)}`

/** Just enough RS-274X to measure a layer: extents, flashes, draw widths. */
const summarizeGerber = (text: string): GerberSummary => {
  const summary: GerberSummary = {
    minX: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
    flashes: new Map(),
    flashCount: 0,
    minDrawWidthMm: null,
  }
  let scale = 1e6
  let unitToMm = 1
  const circles = new Map<string, number>()
  let aperture = ""
  let operation = ""
  let inRegion = false
  let x = 0
  let y = 0
  for (const raw of text.split(/[*\n]/)) {
    const cmd = raw.replace(/%/g, "").trim()
    if (!cmd || cmd.startsWith("G04")) continue
    const format = cmd.match(/^FSLAX\d(\d)Y\d\d/)
    if (format) {
      scale = 10 ** Number(format[1])
      continue
    }
    if (cmd === "MOIN") unitToMm = 25.4
    const define = cmd.match(/^ADD(\d+)([A-Za-z_0-9]+),?([\d.]*)/)
    if (define) {
      if (define[2] === "C") circles.set(define[1]!, Number(define[3]))
      continue
    }
    if (cmd === "G36") inRegion = true
    if (cmd === "G37") inRegion = false
    const select = cmd.match(/^(?:G54)?D(\d{2,})$/)
    if (select && Number(select[1]) >= 10) {
      aperture = select[1]!
      continue
    }
    const move = cmd.match(
      /^(?:G0?[123])?(?:X(-?\d+))?(?:Y(-?\d+))?(?:I-?\d+)?(?:J-?\d+)?(?:D0?([123]))?$/,
    )
    if (!move || (move[1] === undefined && move[2] === undefined && !move[3])) {
      continue
    }
    const nextX =
      move[1] !== undefined ? (Number(move[1]) / scale) * unitToMm : x
    const nextY =
      move[2] !== undefined ? (Number(move[2]) / scale) * unitToMm : y
    if (move[3]) operation = move[3]
    if (operation === "3") {
      summary.flashCount++
      summary.flashes.set(positionKey(nextX, nextY), circles.get(aperture) ?? 0)
    } else if (operation === "1" && !inRegion) {
      const width = circles.get(aperture)
      const moved = Math.hypot(nextX - x, nextY - y) > 1e-6
      if (width && moved) {
        summary.minDrawWidthMm = Math.min(
          summary.minDrawWidthMm ?? width,
          width,
        )
      }
    }
    x = nextX
    y = nextY
    summary.minX = Math.min(summary.minX, x)
    summary.maxX = Math.max(summary.maxX, x)
    summary.minY = Math.min(summary.minY, y)
    summary.maxY = Math.max(summary.maxY, y)
  }
  return summary
}

interface DrillHit {
  diameterMm: number
  x: number
  y: number
}

const parseDrill = (text: string): DrillHit[] => {
  const tools = new Map<string, number>()
  const hits: DrillHit[] = []
  let unitToMm = 1
  let diameter = 0
  for (const raw of text.split("\n")) {
    const line = raw.trim()
    if (line === "INCH" || line.startsWith("INCH,")) unitToMm = 25.4
    const tool = line.match(/^T(\d+)C([\d.]+)/)
    if (tool) {
      tools.set(String(Number(tool[1])), Number(tool[2]) * unitToMm)
      continue
    }
    const select = line.match(/^T(\d+)$/)
    if (select) {
      diameter = tools.get(String(Number(select[1]))) ?? 0
      continue
    }
    const hit = line.match(/^(?:G85)?X(-?[\d.]+)Y(-?[\d.]+)/)
    if (hit && diameter > 0) {
      hits.push({
        diameterMm: diameter,
        x: Number(hit[1]) * unitToMm,
        y: Number(hit[2]) * unitToMm,
      })
    }
  }
  return hits
}

const parseCsv = (text: string): Record<string, string>[] => {
  const rows = text
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) =>
      [...line.matchAll(/("([^"]*)"|[^,]*)(,|$)/g)]
        .slice(0, -1)
        .map((m) => (m[2] ?? m[1] ?? "").trim()),
    )
  const header = rows.shift() ?? []
  return rows.map((row) =>
    Object.fromEntries(header.map((name, i) => [name, row[i] ?? ""])),
  )
}

/** Plated holes this small are vias; component leads need more. */
const MAX_VIA_HOLE_MM = 0.45

/**
 * Build the estimator's inputs from a JLCPCB fabrication bundle (Gerbers,
 * Excellon drills, BOM and pick-and-place CSVs) when no Circuit JSON is
 * available. `files` maps file name to text content.
 */
export const getQuoteInputsFromFabricationFiles = (
  files: Record<string, string>,
): {
  features: BoardFeatures
  bom: BomLine[]
  jointsPerBoard: { smt: number; throughHole: number }
  platedComponentHoleCount: number
  warnings: string[]
} => {
  const warnings: string[] = []
  const names = Object.keys(files)
  const find = (pattern: RegExp) => names.filter((name) => pattern.test(name))
  const one = (pattern: RegExp) => {
    const name = find(pattern)[0]
    return name ? files[name]! : undefined
  }

  const edge = one(/edge[_.]?cuts|\.gko$|\.gm1$|outline/i)
  if (!edge) throw new Error("No board outline (Edge_Cuts) gerber found")
  const outline = summarizeGerber(edge)

  const copperNames = find(/_Cu\.gbr$|\.gtl$|\.gbl$|\.g\d+$/i)
  const copper = copperNames.map((name) => summarizeGerber(files[name]!))
  const topCopper =
    copper[copperNames.findIndex((name) => /^F_Cu|\.gtl$/i.test(name))]
  const traceWidths = copper
    .map((layer) => layer.minDrawWidthMm)
    .filter((width): width is number => width !== null)

  const plated: DrillHit[] = []
  const nonPlated: DrillHit[] = []
  for (const name of find(/\.(drl|xln|txt)$/i)) {
    const isNonPlated =
      /npth|nonplated/i.test(name) || /NonPlated|NPTH/.test(files[name]!)
    ;(isNonPlated ? nonPlated : plated).push(...parseDrill(files[name]!))
  }
  const vias = plated.filter((hit) => hit.diameterMm <= MAX_VIA_HOLE_MM)
  let smallestVia: BoardFeatures["smallestVia"] = null
  for (const hit of vias) {
    const outer = topCopper?.flashes.get(positionKey(hit.x, hit.y)) ?? 0
    const via = { holeDiameterMm: hit.diameterMm, outerDiameterMm: outer }
    if (
      !smallestVia ||
      via.holeDiameterMm < smallestVia.holeDiameterMm ||
      (via.holeDiameterMm === smallestVia.holeDiameterMm &&
        outer > 0 &&
        (smallestVia.outerDiameterMm === 0 ||
          outer < smallestVia.outerDiameterMm))
    ) {
      smallestVia = via
    }
  }
  if (smallestVia && smallestVia.outerDiameterMm === 0) {
    warnings.push(
      "Could not read the via pad diameter from the top copper layer; small-via charges may be missed",
    )
  }
  const componentHoles = plated.filter(
    (hit) => hit.diameterMm > MAX_VIA_HOLE_MM,
  )

  const sides = new Set<"top" | "bottom">()
  const pnp = one(/pick.?and.?place|\bcpl\b|pos/i)
  for (const row of pnp ? parseCsv(pnp) : []) {
    const layer = (row.Layer ?? row.Side ?? "").toLowerCase()
    if (layer.startsWith("t") || layer.startsWith("f")) sides.add("top")
    if (layer.startsWith("b")) sides.add("bottom")
  }

  const bomText = one(/bom/i)
  const lines = new Map<string, BomLine>()
  for (const row of bomText ? parseCsv(bomText) : []) {
    const partNumber = (
      row["JLCPCB Part #"] ??
      row["LCSC Part #"] ??
      row["LCSC"] ??
      ""
    ).trim()
    const designators = (row.Designator ?? "").split(/[,\s]+/).filter(Boolean)
    if (designators.length === 0) continue
    const key = partNumber || `${row.Value}:${row.Footprint}`
    const line = lines.get(key)
    if (line) {
      line.designators.push(...designators)
      line.quantity += designators.length
    } else {
      lines.set(key, {
        designators,
        quantity: designators.length,
        value: row.Value || row.Comment || undefined,
        requestedJlcPartNumber: /^C\d+$/i.test(partNumber)
          ? partNumber
          : undefined,
        smtJointsPerPart: 0,
        throughHoleJointsPerPart: 0,
      })
    }
  }

  const paste = (pattern: RegExp) => {
    const text = one(pattern)
    return text ? summarizeGerber(text).flashCount : 0
  }
  const topPaste = paste(/^F_Paste|\.gtp$/i)
  const bottomPaste = paste(/^B_Paste|\.gbp$/i)
  const smt =
    (sides.has("top") || sides.size === 0 ? topPaste : 0) +
    (sides.has("bottom") ? bottomPaste : 0)
  if (!sides.has("bottom") && bottomPaste > 0) {
    warnings.push(
      `${bottomPaste} paste openings on the bottom but no parts placed there; not counted as joints`,
    )
  }

  return {
    features: {
      widthMm: Math.round((outline.maxX - outline.minX) * 100) / 100,
      heightMm: Math.round((outline.maxY - outline.minY) * 100) / 100,
      numLayers: Math.max(copperNames.length, 1),
      thicknessMm: 1.6,
      material: "fr4",
      viaCount: vias.length,
      smallestVia,
      minPlatedHoleDiameterMm:
        componentHoles.length > 0
          ? Math.min(...componentHoles.map((hit) => hit.diameterMm))
          : null,
      holeCount: plated.length + nonPlated.length,
      minTraceWidthMm: traceWidths.length > 0 ? Math.min(...traceWidths) : null,
      sidesWithComponents: [...sides].sort().reverse() as ("top" | "bottom")[],
    },
    bom: [...lines.values()],
    jointsPerBoard: { smt, throughHole: 0 },
    platedComponentHoleCount: componentHoles.length,
    warnings,
  }
}
