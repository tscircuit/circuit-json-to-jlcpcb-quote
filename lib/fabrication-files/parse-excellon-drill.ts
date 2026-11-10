/** Tool number without leading zeros, e.g. "10" for T10 */
type DrillToolNumber = string

export interface DrillHit {
  diameterMm: number
  x: number
  y: number
}

const TOOL_DEFINITION = /^T(\d+)C([\d.]+)/
const TOOL_SELECTION = /^T(\d+)$/
const HIT = /^X(-?[\d.]+)Y(-?[\d.]+)/
const MM_PER_INCH = 25.4

/** Read the drill hits of an Excellon file. A slot counts as one hit. */
export const parseExcellonDrill = (drillText: string): DrillHit[] => {
  const toolDiameters = new Map<DrillToolNumber, number>()
  const hits: DrillHit[] = []
  let mmPerUnit = 1
  let selectedDiameterMm = 0
  for (const rawLine of drillText.split("\n")) {
    const line = rawLine.trim()
    if (line === "INCH" || line.startsWith("INCH,")) mmPerUnit = MM_PER_INCH

    const toolDefinition = line.match(TOOL_DEFINITION)
    if (toolDefinition) {
      toolDiameters.set(
        String(Number(toolDefinition[1])),
        Number(toolDefinition[2]) * mmPerUnit,
      )
      continue
    }
    const toolSelection = line.match(TOOL_SELECTION)
    if (toolSelection) {
      const toolNumber = String(Number(toolSelection[1]))
      const diameterMm = toolDiameters.get(toolNumber)
      if (diameterMm === undefined) {
        throw new Error(`Drill file selects undefined tool T${toolNumber}`)
      }
      selectedDiameterMm = diameterMm
      continue
    }
    // "G85X..Y.." is the far end of a slot whose start is the previous hit.
    if (line.startsWith("G85")) continue
    const hit = line.match(HIT)
    if (!hit) continue
    if (selectedDiameterMm <= 0) {
      throw new Error("Drill file has a hit before any tool is selected")
    }
    hits.push({
      diameterMm: selectedDiameterMm,
      x: Number(hit[1]) * mmPerUnit,
      y: Number(hit[2]) * mmPerUnit,
    })
  }
  return hits
}
