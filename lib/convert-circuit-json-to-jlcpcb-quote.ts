import { estimateJlcpcbQuote } from "./estimate-jlcpcb-quote"
import { extractBoardFeatures } from "./extract-board-features"
import { getBomLines } from "./get-bom-lines"
import { lookupJlcParts } from "./lookup-jlc-parts"
import type { CircuitJson, JlcpcbQuote, JlcpcbQuoteOptions } from "./types"

/**
 * Estimate what JLCPCB will charge to fabricate (and optionally assemble) a
 * board: bare PCBs, the charges their engineers add after review, assembly
 * fees and parts. Shipping, duties and taxes are not included.
 */
export const convertCircuitJsonToJlcpcbQuote = async (
  params: { circuitJson: CircuitJson } & JlcpcbQuoteOptions,
): Promise<JlcpcbQuote> => {
  const { circuitJson, ...options } = params
  const { features, warnings } = extractBoardFeatures(circuitJson)
  const bom = options.assembly === "none" ? [] : getBomLines(circuitJson)
  if (bom.length > 0 && options.lookupParts !== false) {
    warnings.push(
      ...(await lookupJlcParts({
        bom,
        baseUrl: options.jlcsearchBaseUrl,
        fetch: options.fetch,
      })),
    )
  }
  return estimateJlcpcbQuote({ features, bom, options, warnings })
}
