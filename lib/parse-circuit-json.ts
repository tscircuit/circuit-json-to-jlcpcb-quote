import type { AnyCircuitElement } from "circuit-json"
import type { CircuitJson } from "./types"

const isCircuitElement = (element: unknown): element is AnyCircuitElement =>
  typeof element === "object" &&
  element !== null &&
  "type" in element &&
  typeof element.type === "string"

/**
 * Check that parsed JSON is an array of Circuit JSON elements. Only the
 * `type` tag is checked: element schemas change between circuit-json
 * versions, and the converters ignore element types they do not know.
 */
export const parseCircuitJson = (json: unknown): CircuitJson => {
  if (!Array.isArray(json)) {
    throw new Error("Circuit JSON must be an array of elements")
  }
  const invalidIndex = json.findIndex((element) => !isCircuitElement(element))
  if (invalidIndex !== -1) {
    throw new Error(`Circuit JSON element ${invalidIndex} has no "type"`)
  }
  return json.filter(isCircuitElement)
}
