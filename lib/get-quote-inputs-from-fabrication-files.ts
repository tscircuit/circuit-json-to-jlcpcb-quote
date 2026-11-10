import {
  fabricationFilePatterns,
  findFabricationFile,
  findFabricationFiles,
} from "./fabrication-files/find-fabrication-files"
import { getBomLinesFromCsv } from "./fabrication-files/get-bom-lines-from-csv"
import { getSidesWithComponents } from "./fabrication-files/get-sides-with-components"
import { getSmallestVia } from "./fabrication-files/get-smallest-via"
import {
  type DrillHit,
  parseExcellonDrill,
} from "./fabrication-files/parse-excellon-drill"
import { summarizeGerber } from "./fabrication-files/summarize-gerber"
import { fabricationFileRules, fabricationPrices } from "./jlcpcb-price-table"
import type { BoardFeatures, BomLine, FabricationFiles } from "./types"

const roundToHundredthMm = (lengthMm: number) =>
  Math.round(lengthMm * 100) / 100

const countPasteOpenings = (
  files: FabricationFiles,
  pastePattern: RegExp,
): number => {
  const pasteGerber = findFabricationFile(files, pastePattern)
  return pasteGerber === undefined
    ? 0
    : summarizeGerber(pasteGerber).flashes.length
}

/**
 * Read what the quote needs out of a JLCPCB fabrication bundle: Gerbers,
 * Excellon drills, the BOM CSV and the pick-and-place CSV.
 *
 * Fabrication files do not say what the board is made of or how thick it
 * is; those are order-form choices. A stiffener layer marks the board as
 * flex (only flex boards carry stiffeners), otherwise it is FR4, and the
 * thickness is the order form's default for that material. Callers that know
 * the real board override both fields.
 */
export const getQuoteInputsFromFabricationFiles = (
  files: FabricationFiles,
): { features: BoardFeatures; bom: BomLine[]; warnings: string[] } => {
  const warnings: string[] = []

  const outlineGerber = findFabricationFile(
    files,
    fabricationFilePatterns.boardOutline,
  )
  if (outlineGerber === undefined) {
    throw new Error("No board outline (Edge_Cuts) gerber found")
  }
  const outline = summarizeGerber(outlineGerber)

  const copperFiles = findFabricationFiles(
    files,
    fabricationFilePatterns.copper,
  )
  const topCopperFile = copperFiles.find((copperFile) =>
    fabricationFilePatterns.topCopper.test(copperFile.fileName),
  )
  if (!topCopperFile) throw new Error("No top copper (F_Cu) gerber found")
  const traceWidthsMm = copperFiles.flatMap((copperFile) => {
    const { minDrawWidthMm } = summarizeGerber(copperFile.content)
    return minDrawWidthMm === null ? [] : [minDrawWidthMm]
  })

  const platedHits: DrillHit[] = []
  const nonPlatedHits: DrillHit[] = []
  for (const drillFile of findFabricationFiles(
    files,
    fabricationFilePatterns.drill,
  )) {
    const isNonPlated =
      fabricationFilePatterns.nonPlatedDrillName.test(drillFile.fileName) ||
      fabricationFilePatterns.nonPlatedDrillContent.test(drillFile.content)
    const hits = parseExcellonDrill(drillFile.content)
    if (isNonPlated) nonPlatedHits.push(...hits)
    else platedHits.push(...hits)
  }
  const viaHits = platedHits.filter(
    (hit) => hit.diameterMm <= fabricationFileRules.maxViaHoleMm,
  )

  const bomCsv = findFabricationFile(files, fabricationFilePatterns.bom)
  const bom = bomCsv === undefined ? [] : getBomLinesFromCsv(bomCsv)
  const pickAndPlaceCsv = findFabricationFile(
    files,
    fabricationFilePatterns.pickAndPlace,
  )
  if (bom.length > 0 && pickAndPlaceCsv === undefined) {
    throw new Error("The bundle has a BOM but no pick-and-place CSV")
  }
  const sidesWithComponents =
    pickAndPlaceCsv === undefined ? [] : getSidesWithComponents(pickAndPlaceCsv)

  const topPasteOpenings = countPasteOpenings(
    files,
    fabricationFilePatterns.topPaste,
  )
  const bottomPasteOpenings = countPasteOpenings(
    files,
    fabricationFilePatterns.bottomPaste,
  )
  if (!sidesWithComponents.includes("bottom") && bottomPasteOpenings > 0) {
    warnings.push(
      `${bottomPasteOpenings} paste openings on the bottom but no parts placed there; not counted as joints`,
    )
  }

  const stiffenerCount = findFabricationFiles(
    files,
    fabricationFilePatterns.stiffener,
  ).length

  return {
    features: {
      widthMm: roundToHundredthMm(outline.maxX - outline.minX),
      heightMm: roundToHundredthMm(outline.maxY - outline.minY),
      numLayers: copperFiles.length,
      thicknessMm:
        stiffenerCount > 0
          ? fabricationPrices.flex.defaultThicknessMm
          : fabricationPrices.pricedRigidThicknessMm,
      material: stiffenerCount > 0 ? "flex" : "fr4",
      stiffenerCount,
      viaCount: viaHits.length,
      smallestVia: getSmallestVia({
        viaHits,
        topCopper: summarizeGerber(topCopperFile.content),
      }),
      holeCount: platedHits.length + nonPlatedHits.length,
      minTraceWidthMm:
        traceWidthsMm.length > 0 ? Math.min(...traceWidthsMm) : null,
      sidesWithComponents,
      smtJointsPerBoard:
        (sidesWithComponents.includes("top") ? topPasteOpenings : 0) +
        (sidesWithComponents.includes("bottom") ? bottomPasteOpenings : 0),
    },
    bom,
    warnings,
  }
}
