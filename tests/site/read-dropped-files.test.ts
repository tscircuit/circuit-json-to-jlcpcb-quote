import { expect, test } from "bun:test"
import { strToU8, zipSync } from "fflate"
import { readDroppedFiles } from "site/read-dropped-files"

const encode = (text: string) => strToU8(text)

test("a tscircuit fabrication zip becomes a flat fabrication bundle", () => {
  const zipBytes = zipSync({
    "gerber/F_Cu.gbr": encode("%FSLAX46Y46*%"),
    "gerber/drill-L1-L2.drl": encode("M48"),
    "bom.csv": encode('"Designator","Comment"'),
    "pick_and_place.csv": encode("Designator,Mid X,Mid Y,Layer,Rotation"),
    "__MACOSX/gerber/._F_Cu.gbr": encode("resource fork"),
    "gerber/.DS_Store": encode("finder"),
  })
  const quoteInput = readDroppedFiles([
    { path: "board_fabrication_files.zip", bytes: zipBytes },
  ])
  expect(quoteInput.kind).toBe("fabrication_files")
  expect(
    quoteInput.kind === "fabrication_files" &&
      Object.keys(quoteInput.files).sort(),
  ).toEqual(["F_Cu.gbr", "bom.csv", "drill-L1-L2.drl", "pick_and_place.csv"])
})

test("a Circuit JSON file is read as Circuit JSON", () => {
  const quoteInput = readDroppedFiles([
    {
      path: "board.circuit.json",
      bytes: encode(JSON.stringify([{ type: "pcb_board", pcb_board_id: "b" }])),
    },
  ])
  expect(quoteInput).toMatchObject({
    kind: "circuit_json",
    sourceName: "board.circuit.json",
  })
})

test("anything else is refused with what to drop instead", () => {
  expect(() =>
    readDroppedFiles([{ path: "notes.txt", bytes: encode("hello") }]),
  ).toThrow("Drop a fabrication zip")
})
