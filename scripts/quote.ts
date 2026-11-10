#!/usr/bin/env bun
/**
 * Quote a Circuit JSON file. The fabrication files JLCPCB would receive are
 * generated first and the quote is computed from them.
 *
 * bun scripts/quote.ts board.circuit.json [--qty 5] [--assembled 2]
 *   [--assembly auto|economic|standard|none]
 *   [--finish hasl_leaded|hasl_lead_free|enig]
 *   [--out DIR]   also write the generated fabrication files to DIR
 *   [--json]
 */
import { mkdir } from "node:fs/promises"
import { dirname, join } from "node:path"
import {
  convertCircuitJsonToFabricationFiles,
  formatJlcpcbQuote,
  quoteFabricationFiles,
} from "../lib/index"

const args = process.argv.slice(2)
const flag = (name: string) => {
  const index = args.indexOf(`--${name}`)
  return index === -1 ? undefined : args[index + 1]
}
const file = args[0]
if (!file || file.startsWith("--")) {
  console.error("usage: bun scripts/quote.ts <circuit.json> [options]")
  process.exit(1)
}
const circuitJson = await Bun.file(file).json()
const files = await convertCircuitJsonToFabricationFiles(circuitJson)
const out = flag("out")
if (out) {
  for (const [name, content] of Object.entries(files)) {
    // Same layout as the tscircuit.com fabrication zip.
    const path = join(out, name.endsWith(".csv") ? name : `gerber/${name}`)
    await mkdir(dirname(path), { recursive: true })
    await Bun.write(path, content)
  }
}
const quote = await quoteFabricationFiles({
  files,
  board: circuitJson.find((element: any) => element.type === "pcb_board"),
  options: {
    quantity: flag("qty") ? Number(flag("qty")) : undefined,
    assembledQuantity: flag("assembled")
      ? Number(flag("assembled"))
      : undefined,
    assembly: flag("assembly") as any,
    surfaceFinish: flag("finish") as any,
  },
})
console.log(
  args.includes("--json")
    ? JSON.stringify(quote, null, 2)
    : formatJlcpcbQuote(quote),
)
