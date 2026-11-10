import {
  convertBomRowsToCsv,
  convertCircuitJsonToBomRows,
} from "circuit-json-to-bom-csv"
import { convertCircuitJsonToGerberFiles } from "circuit-json-to-gerber"
import { convertCircuitJsonToPickAndPlaceCsv } from "circuit-json-to-pnp-csv"
import type { CircuitJson } from "./types"

/**
 * Generate the fabrication bundle JLCPCB receives: Gerbers and drill files,
 * bom.csv and pick_and_place.csv. This mirrors the fabrication export of
 * tscircuit.com (runframe `exportFabricationFiles`) and of the CLI
 * (`tsci export -f gerbers`): the same converters with the same options.
 * Returns file name -> text content.
 */
export const convertCircuitJsonToFabricationFiles = async (
  circuitJson: CircuitJson,
): Promise<Record<string, string>> => {
  // Error and warning elements are not board geometry.
  const boardElements = circuitJson.filter(
    (element) => !("error_type" in element) && !("warning_type" in element),
  )
  const files: Record<string, string> = {
    ...convertCircuitJsonToGerberFiles(boardElements as any, {
      flip_y_axis: false,
    }),
  }
  const bomRows = await convertCircuitJsonToBomRows({
    circuitJson: circuitJson as any,
  })
  files["bom.csv"] = await convertBomRowsToCsv(bomRows)
  files["pick_and_place.csv"] = (
    convertCircuitJsonToPickAndPlaceCsv as (
      circuitJson: unknown,
      options: { supplier: string },
    ) => string
  )(circuitJson, { supplier: "jlcpcb" })
  return files
}
