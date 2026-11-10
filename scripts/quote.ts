#!/usr/bin/env bun
/**
 * Quote a Circuit JSON file. The fabrication files JLCPCB would receive are
 * generated first and the quote is computed from them.
 *
 * bun scripts/quote.ts board.circuit.json [--qty 5] [--assembled 2]
 *   [--assembly auto|economic|standard|none]
 *   [--finish hasl_leaded|hasl_lead_free|enig]
 *   [--exclude-unresolved]  quote without parts that cannot be priced
 *   [--out DIR]             also write the generated fabrication files
 *   [--json]
 */
import { mkdir } from "node:fs/promises"
import { dirname, join } from "node:path"
import {
  convertCircuitJsonToFabricationFiles,
  convertCircuitJsonToJlcpcbQuote,
  formatJlcpcbQuote,
  parseCircuitJson,
} from "../lib/index"
import { readFlag, readQuoteOptions } from "./read-cli-options"

const args = process.argv.slice(2)
const circuitJsonPath = args[0]
if (!circuitJsonPath || circuitJsonPath.startsWith("--")) {
  console.error("usage: bun scripts/quote.ts <circuit.json> [options]")
  process.exit(1)
}
const circuitJson = parseCircuitJson(await Bun.file(circuitJsonPath).json())

const outputDirectory = readFlag(args, "out")
if (outputDirectory) {
  const files = await convertCircuitJsonToFabricationFiles(circuitJson)
  for (const [fileName, content] of Object.entries(files)) {
    // Same layout as the tscircuit.com fabrication zip.
    const path = join(
      outputDirectory,
      fileName.endsWith(".csv") ? fileName : `gerber/${fileName}`,
    )
    await mkdir(dirname(path), { recursive: true })
    await Bun.write(path, content)
  }
}
const quote = await convertCircuitJsonToJlcpcbQuote({
  circuitJson,
  ...readQuoteOptions(args),
})
console.log(
  args.includes("--json")
    ? JSON.stringify(quote, null, 2)
    : formatJlcpcbQuote(quote),
)
