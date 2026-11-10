import { convertCircuitJsonToFabricationFiles } from "./convert-circuit-json-to-fabrication-files"
import { estimateJlcpcbQuote } from "./estimate-jlcpcb-quote"
import { getQuoteInputsFromFabricationFiles } from "./get-quote-inputs-from-fabrication-files"
import { lookupJlcParts } from "./lookup-jlc-parts"
import type { CircuitJson, JlcpcbQuote, JlcpcbQuoteOptions } from "./types"

/**
 * Estimate what JLCPCB will charge to fabricate (and optionally assemble) a
 * board: bare PCBs, the charges their engineers add after review, assembly
 * fees and parts. Shipping, duties and taxes are not included.
 *
 * The Circuit JSON is first turned into the fabrication files JLCPCB would
 * receive, and the quote is computed from those files, the way JLCPCB quotes.
 * Only what the files cannot carry (board thickness and material) is read
 * from the Circuit JSON itself.
 */
export const convertCircuitJsonToJlcpcbQuote = async (
  params: { circuitJson: CircuitJson } & JlcpcbQuoteOptions,
): Promise<JlcpcbQuote> => {
  const { circuitJson, ...options } = params
  const files = await convertCircuitJsonToFabricationFiles(circuitJson)
  return quoteFabricationFiles({
    files,
    options,
    board: circuitJson.find((element) => element.type === "pcb_board"),
  })
}

/** Quote a fabrication bundle (file name -> text content). */
export const quoteFabricationFiles = async (params: {
  files: Record<string, string>
  options?: JlcpcbQuoteOptions
  /** Order-form facts that fabrication files do not contain */
  board?: { thickness?: number; material?: string }
}): Promise<JlcpcbQuote> => {
  const options = params.options ?? {}
  const inputs = getQuoteInputsFromFabricationFiles(params.files)
  if (params.board?.thickness) {
    inputs.features.thicknessMm = params.board.thickness
  }
  if (params.board?.material) {
    if (
      params.board.material !== "flex" &&
      inputs.features.material === "flex"
    ) {
      delete inputs.features.stiffenerCount
      if (!params.board.thickness) inputs.features.thicknessMm = 1.6
      inputs.warnings = inputs.warnings.filter(
        (warning) => !warning.startsWith("Stiffener"),
      )
      inputs.warnings.push(
        `Quoted as ${params.board.material}, but the files contain a stiffener layer, which only flex boards use`,
      )
    }
    inputs.features.material = params.board.material
  }
  const bom = options.assembly === "none" ? [] : inputs.bom
  if (bom.length > 0 && options.lookupParts !== false) {
    inputs.warnings.push(
      ...(await lookupJlcParts({
        bom,
        baseUrl: options.jlcsearchBaseUrl,
        fetch: options.fetch,
        partSource: options.partSource,
      })),
    )
  }
  return estimateJlcpcbQuote({
    features: inputs.features,
    bom,
    jointsPerBoard: inputs.jointsPerBoard,
    options,
    warnings: inputs.warnings,
  })
}
