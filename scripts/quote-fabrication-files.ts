#!/usr/bin/env bun
/**
 * Quote a folder of fabrication files (Gerbers, drills, bom.csv,
 * pick_and_place.csv) instead of Circuit JSON.
 *
 * bun scripts/quote-fabrication-files.ts <dir> [--qty 5] [--assembled 2]
 *   [--assembly auto|economic|standard|none] [--finish hasl_leaded|...] [--json]
 */
import { readdir } from "node:fs/promises"
import { join } from "node:path"
import {
  estimateJlcpcbQuote,
  formatJlcpcbQuote,
  getQuoteInputsFromFabricationFiles,
  lookupJlcParts,
} from "../lib/index"

const args = process.argv.slice(2)
const flag = (name: string) => {
  const index = args.indexOf(`--${name}`)
  return index === -1 ? undefined : args[index + 1]
}
const dir = args[0]
if (!dir || dir.startsWith("--")) {
  console.error("usage: bun scripts/quote-fabrication-files.ts <dir> [options]")
  process.exit(1)
}
const files: Record<string, string> = {}
for (const name of await readdir(dir)) {
  files[name] = await Bun.file(join(dir, name)).text()
}
const inputs = getQuoteInputsFromFabricationFiles(files)
const assembly = flag("assembly") as any
if (assembly !== "none") {
  inputs.warnings.push(...(await lookupJlcParts({ bom: inputs.bom })))
}
// JLCPCB lists through-hole parts with the package "Plugin". The files do not
// say which holes belong to them, so every plated component hole is counted.
const throughHoleParts = inputs.bom.filter((line) =>
  /plugin|through.?hole/i.test(line.part?.package ?? ""),
)
if (throughHoleParts.length > 0 && inputs.platedComponentHoleCount > 0) {
  inputs.jointsPerBoard.throughHole = inputs.platedComponentHoleCount
  inputs.warnings.push(
    `Through-hole parts (${throughHoleParts.flatMap((line) => line.designators).join(", ")}) are hand-soldered; all ${inputs.platedComponentHoleCount} plated component holes are counted as joints, which is an upper bound`,
  )
}
const quote = estimateJlcpcbQuote({
  features: inputs.features,
  bom: assembly === "none" ? [] : inputs.bom,
  jointsPerBoard: inputs.jointsPerBoard,
  warnings: inputs.warnings,
  options: {
    quantity: flag("qty") ? Number(flag("qty")) : undefined,
    assembledQuantity: flag("assembled")
      ? Number(flag("assembled"))
      : undefined,
    assembly,
    surfaceFinish: flag("finish") as any,
  },
})
console.log(
  args.includes("--json")
    ? JSON.stringify(quote, null, 2)
    : formatJlcpcbQuote(quote),
)
