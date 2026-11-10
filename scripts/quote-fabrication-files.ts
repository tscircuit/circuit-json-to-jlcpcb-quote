#!/usr/bin/env bun
/**
 * Quote a folder of fabrication files (Gerbers, drills, bom.csv,
 * pick_and_place.csv), such as an unzipped tscircuit fabrication export.
 *
 * bun scripts/quote-fabrication-files.ts <dir> [--qty 5] [--assembled 2]
 *   [--assembly auto|economic|standard|none] [--finish hasl_leaded|...]
 *   [--material fr4|flex] [--thickness 1.6] [--json]
 */
import { readdir } from "node:fs/promises"
import { join } from "node:path"
import { formatJlcpcbQuote, quoteFabricationFiles } from "../lib/index"

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
const quote = await quoteFabricationFiles({
  files,
  // The order form, not the files, says what the board is made of.
  board: {
    material: flag("material"),
    thickness: flag("thickness") ? Number(flag("thickness")) : undefined,
  },
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
