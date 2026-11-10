#!/usr/bin/env bun
/**
 * Quote a folder of fabrication files (Gerbers, drills, bom.csv,
 * pick_and_place.csv) instead of Circuit JSON.
 *
 * bun scripts/quote-fabrication-files.ts <dir> [--qty 5] [--assembled 2]
 *   [--assembly auto|economic|standard|none] [--finish hasl_leaded|...]
 *   [--material fr4|flex] [--json]
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
for (const name of await readdir(dir, { recursive: true })) {
  if (!/\.(gbr|g[tb][lpso]|gko|gm1|drl|xln|csv)$/i.test(name)) continue
  files[name.split("/").pop()!] = await Bun.file(join(dir, name)).text()
}
const inputs = getQuoteInputsFromFabricationFiles(files)
// --material fr4 quotes a board as rigid FR4 even if the files look like flex.
const material = flag("material")
if (material && material !== inputs.features.material) {
  inputs.features.material = material
  if (material !== "flex") {
    inputs.features.thicknessMm = 1.6
    delete inputs.features.stiffenerCount
    inputs.warnings = inputs.warnings.filter((w) => !w.startsWith("Stiffener"))
    inputs.warnings.push(
      `Quoted as ${material} at your request; the files contain a stiffener layer, which a rigid board does not use`,
    )
  }
}
const assembly = flag("assembly") as any
if (assembly !== "none") {
  inputs.warnings.push(...(await lookupJlcParts({ bom: inputs.bom })))
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
