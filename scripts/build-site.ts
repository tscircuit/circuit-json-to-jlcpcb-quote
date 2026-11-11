#!/usr/bin/env bun
/**
 * Build the drag-and-drop quote page into site/dist, a static site that
 * Vercel serves as is. Quotes run in the browser; jlcsearch allows that.
 */
import { cp, mkdir, rm } from "node:fs/promises"

const OUTPUT_DIRECTORY = "site/dist"

await rm(OUTPUT_DIRECTORY, { recursive: true, force: true })
await mkdir(OUTPUT_DIRECTORY, { recursive: true })

const build = await Bun.build({
  entrypoints: ["site/main.ts"],
  outdir: OUTPUT_DIRECTORY,
  target: "browser",
  minify: true,
  sourcemap: "linked",
})
if (!build.success) {
  for (const message of build.logs) console.error(message)
  process.exit(1)
}
for (const fileName of ["index.html", "styles.css"]) {
  await cp(`site/${fileName}`, `${OUTPUT_DIRECTORY}/${fileName}`)
}
console.log(`Built ${OUTPUT_DIRECTORY}`)
