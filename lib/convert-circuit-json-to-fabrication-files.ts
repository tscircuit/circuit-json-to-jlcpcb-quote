import {
  convertBomRowsToCsv,
  convertCircuitJsonToBomRows,
} from "circuit-json-to-bom-csv"
import { convertCircuitJsonToGerberFiles } from "circuit-json-to-gerber"
import { convertCircuitJsonToPickAndPlaceCsv } from "circuit-json-to-pnp-csv"
import type { CircuitJson, FabricationFiles } from "./types"

/**
 * Generate the fabrication bundle JLCPCB receives: Gerbers and drill files,
 * bom.csv and pick_and_place.csv. This mirrors the fabrication export of
 * tscircuit.com (runframe `exportFabricationFiles`) and of the CLI
 * (`tsci export -f gerbers`): the same converters with the same options.
 */
export const convertCircuitJsonToFabricationFiles = async (
  circuitJson: CircuitJson,
): Promise<FabricationFiles> => {
  // Error and warning elements are not board geometry.
  const boardElements = circuitJson.filter(
    (element) => !("error_type" in element) && !("warning_type" in element),
  )
  const bomRows = await convertCircuitJsonToBomRows({ circuitJson })
  return {
    ...convertCircuitJsonToGerberFiles(boardElements, { flip_y_axis: false }),
    "bom.csv": convertBomRowsToCsv(bomRows),
    "pick_and_place.csv": convertCircuitJsonToPickAndPlaceCsv(circuitJson, {
      supplier: "jlcpcb",
    }),
  }
}
