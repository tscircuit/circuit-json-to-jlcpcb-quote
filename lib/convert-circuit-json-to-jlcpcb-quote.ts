import type { AnyCircuitElement } from "circuit-json"

/**
 * Placeholder: the quote conversion is not implemented yet, so this always
 * rejects. It exists so the package, its CI and its release pipeline are in
 * place before the implementation lands.
 */
export const convertCircuitJsonToJlcpcbQuote = async (params: {
  circuitJson: AnyCircuitElement[]
}): Promise<never> => {
  throw new Error(
    `convertCircuitJsonToJlcpcbQuote is not implemented yet (received ${params.circuitJson.length} circuit elements)`,
  )
}
