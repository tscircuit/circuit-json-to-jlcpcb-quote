import { expect, test } from "bun:test"
import { convertCircuitJsonToJlcpcbQuote } from "lib/index"

test("convertCircuitJsonToJlcpcbQuote rejects until it is implemented", async () => {
  await expect(
    convertCircuitJsonToJlcpcbQuote({ circuitJson: [] }),
  ).rejects.toThrow("not implemented yet")
})
