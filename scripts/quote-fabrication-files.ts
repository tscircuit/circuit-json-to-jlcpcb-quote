#!/usr/bin/env bun
/**
 * Quote a folder of fabrication files (Gerbers, drills, bom.csv,
 * pick_and_place.csv), such as an unzipped tscircuit fabrication export.
 *
 * bun scripts/quote-fabrication-files.ts <dir> [--qty 5] [--assembled 2]
 *   [--assembly auto|economic|standard|none] [--finish hasl_leaded|...]
 *   [--material fr4|flex] [--thickness 1.6] [--exclude-unresolved] [--json]
 */
import { readdir } from "node:fs/promises"
import { basename, join } from "node:path"
import {
  type FabricationFiles,
  formatJlcpcbQuote,
  quoteFabricationFiles,
} from "../lib/index"
import { readBoardOrderForm, readQuoteOptions } from "./read-cli-options"

const FABRICATION_FILE = /\.(gbr|g[tb][lpso]|gko|gm1|drl|xln|csv)$/i

const args = process.argv.slice(2)
const directory = args[0]
if (!directory || directory.startsWith("--")) {
  console.error("usage: bun scripts/quote-fabrication-files.ts <dir> [options]")
  process.exit(1)
}
const files: FabricationFiles = {}
for (const relativePath of await readdir(directory, { recursive: true })) {
  if (!FABRICATION_FILE.test(relativePath)) continue
  files[basename(relativePath)] = await Bun.file(
    join(directory, relativePath),
  ).text()
}
const quote = await quoteFabricationFiles({
  files,
  board: readBoardOrderForm(args),
  options: readQuoteOptions(args),
})
console.log(
  args.includes("--json")
    ? JSON.stringify(quote, null, 2)
    : formatJlcpcbQuote(quote),
)
