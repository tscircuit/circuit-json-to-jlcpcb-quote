#!/usr/bin/env bun
/**
 * bun scripts/quote.ts board.circuit.json [--qty 5] [--assembled 2]
 *   [--assembly auto|economic|standard|none]
 *   [--finish hasl_leaded|hasl_lead_free|enig] [--json]
 */
import {
  convertCircuitJsonToJlcpcbQuote,
  formatJlcpcbQuote,
} from "../lib/index"

const args = process.argv.slice(2)
const flag = (name: string) => {
  const index = args.indexOf(`--${name}`)
  return index === -1 ? undefined : args[index + 1]
}
const file = args.find(
  (arg, i) => !arg.startsWith("--") && !args[i - 1]?.startsWith("--"),
)
if (!file) {
  console.error(
    "usage: bun scripts/quote.ts <circuit.json> [--qty N] [--assembled N] [--assembly TYPE] [--finish FINISH] [--json]",
  )
  process.exit(1)
}
const quote = await convertCircuitJsonToJlcpcbQuote({
  circuitJson: await Bun.file(file).json(),
  quantity: flag("qty") ? Number(flag("qty")) : undefined,
  assembledQuantity: flag("assembled") ? Number(flag("assembled")) : undefined,
  assembly: flag("assembly") as any,
  surfaceFinish: flag("finish") as any,
})
console.log(
  args.includes("--json")
    ? JSON.stringify(quote, null, 2)
    : formatJlcpcbQuote(quote),
)
