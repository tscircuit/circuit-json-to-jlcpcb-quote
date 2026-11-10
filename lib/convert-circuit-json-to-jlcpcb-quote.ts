import { convertCircuitJsonToFabricationFiles } from "./convert-circuit-json-to-fabrication-files"
import {
  type BoardOrderForm,
  quoteFabricationFiles,
} from "./quote-fabrication-files"
import type { CircuitJson, JlcpcbQuote, JlcpcbQuoteOptions } from "./types"

/** Thickness and material are order-form choices, not part of the files. */
const getBoardOrderForm = (circuitJson: CircuitJson): BoardOrderForm => {
  const pcbBoard = circuitJson.find((element) => element.type === "pcb_board")
  if (!pcbBoard) throw new Error("Circuit JSON has no pcb_board")
  if (pcbBoard.material !== "fr4" && pcbBoard.material !== "flex") {
    throw new Error(`No JLCPCB price for "${pcbBoard.material}" boards`)
  }
  return { material: pcbBoard.material, thicknessMm: pcbBoard.thickness }
}

/**
 * Estimate what JLCPCB will charge to fabricate (and optionally assemble) a
 * board: bare PCBs, the charges their engineers add after review, assembly
 * fees and parts. Shipping, duties and taxes are not included.
 *
 * The Circuit JSON is first turned into the fabrication files JLCPCB would
 * receive, and the quote is computed from those files, the way JLCPCB quotes.
 */
export const convertCircuitJsonToJlcpcbQuote = async (
  order: { circuitJson: CircuitJson } & JlcpcbQuoteOptions,
): Promise<JlcpcbQuote> => {
  const { circuitJson, ...options } = order
  return quoteFabricationFiles({
    files: await convertCircuitJsonToFabricationFiles(circuitJson),
    options,
    board: getBoardOrderForm(circuitJson),
  })
}
