/** The digits of a D-code, e.g. "10" for D10 */
type GerberApertureCode = string

export interface GerberSummary {
  minX: number
  maxX: number
  minY: number
  maxY: number
  /** Every flash; `diameterMm` is null when the aperture is not round */
  flashes: { x: number; y: number; diameterMm: number | null }[]
  /** Narrowest round aperture used to draw outside regions */
  minDrawWidthMm: number | null
}

const COORDINATE_FORMAT = /^FSLAX\d(\d)Y\d\d/
const APERTURE_DEFINITION = /^ADD(\d+)([A-Za-z_0-9]+),?([\d.]*)/
const APERTURE_SELECTION = /^(?:G54)?D(\d{2,})$/
const OPERATION =
  /^(?:G0?[123])?(?:X(-?\d+))?(?:Y(-?\d+))?(?:I-?\d+)?(?:J-?\d+)?(?:D0?([123]))?$/
const MM_PER_INCH = 25.4

/**
 * Just enough RS-274X to measure a layer: extents, flashes and draw widths.
 * It is not a full Gerber parser.
 */
export const summarizeGerber = (gerberText: string): GerberSummary => {
  const summary: GerberSummary = {
    minX: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
    flashes: [],
    minDrawWidthMm: null,
  }
  const circleDiameters = new Map<GerberApertureCode, number>()
  let unitsPerCoordinate = 1e6
  let mmPerUnit = 1
  let selectedAperture: GerberApertureCode = ""
  let operationCode = ""
  let isInsideRegion = false
  let x = 0
  let y = 0

  for (const rawCommand of gerberText.split(/[*\n]/)) {
    const command = rawCommand.replace(/%/g, "").trim()
    if (!command || command.startsWith("G04")) continue

    const coordinateFormat = command.match(COORDINATE_FORMAT)
    if (coordinateFormat) {
      unitsPerCoordinate = 10 ** Number(coordinateFormat[1])
      continue
    }
    if (command === "MOIN") mmPerUnit = MM_PER_INCH
    if (command === "G36") isInsideRegion = true
    if (command === "G37") isInsideRegion = false

    const definition = command.match(APERTURE_DEFINITION)
    if (definition) {
      if (definition[2] === "C" && definition[1]) {
        circleDiameters.set(definition[1], Number(definition[3]) * mmPerUnit)
      }
      continue
    }
    const selection = command.match(APERTURE_SELECTION)
    if (selection?.[1] && Number(selection[1]) >= 10) {
      selectedAperture = selection[1]
      continue
    }

    const operation = command.match(OPERATION)
    if (!operation) continue
    const [, xText, yText, operationText] = operation
    if (xText === undefined && yText === undefined && !operationText) continue
    const nextX =
      xText === undefined ? x : (Number(xText) / unitsPerCoordinate) * mmPerUnit
    const nextY =
      yText === undefined ? y : (Number(yText) / unitsPerCoordinate) * mmPerUnit
    if (operationText) operationCode = operationText

    if (operationCode === "3") {
      summary.flashes.push({
        x: nextX,
        y: nextY,
        diameterMm: circleDiameters.get(selectedAperture) ?? null,
      })
    } else if (operationCode === "1" && !isInsideRegion) {
      const drawWidthMm = circleDiameters.get(selectedAperture)
      const hasMoved = Math.hypot(nextX - x, nextY - y) > 1e-6
      if (drawWidthMm && hasMoved) {
        summary.minDrawWidthMm = Math.min(
          summary.minDrawWidthMm ?? drawWidthMm,
          drawWidthMm,
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
