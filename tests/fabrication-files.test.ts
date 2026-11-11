import { expect, test } from "bun:test"
import { getQuoteInputsFromFabricationFiles } from "lib/index"

const gerber = (body: string) => `%FSLAX46Y46*%\n%MOMM*%\n${body}\nM02*\n`

/** A 10x10mm board with one top-side through-hole part, J1, at (5, 5) */
const createFiles = (bottomPasteFlashes: string) => ({
  "Edge_Cuts.gbr": gerber(
    "%ADD10C,0.05*%\nD10*\nX0Y0D02*\nX10000000Y0D01*\nX10000000Y10000000D01*\nX0Y10000000D01*\nX0Y0D01*",
  ),
  "F_Cu.gbr": gerber("%ADD10C,1.6*%\nD10*\nX5000000Y5000000D03*"),
  "F_Paste.gbr": gerber("%ADD10C,1.6*%\nD10*\nX5000000Y5000000D03*"),
  "B_Paste.gbr": gerber(`%ADD10C,1.6*%\nD10*\n${bottomPasteFlashes}`),
  // A round pin at (5, 5) and a slot from (2, 8) to (4, 8).
  "drill-L1-L2.drl":
    "M48\nMETRIC\nT1C1.0\nT2C0.8\n%\nT1\nX5.0Y5.0\nT2\nX2.0Y8.0\nG85X4.0Y8.0\nM30\n",
  "bom.csv": "Designator,Comment,Value,Footprint,JLCPCB Part #\nJ1,,,,C1\n",
  "pick_and_place.csv":
    "Designator,Mid X,Mid Y,Layer,Rotation\nJ1,5.0,5.0,top,0\n",
})

test("bottom paste on through-hole pins and slots draws no warning", () => {
  const inputs = getQuoteInputsFromFabricationFiles(
    // On the round pin, and in the middle of the slot.
    createFiles("X5000000Y5000000D03*\nX3000000Y8000000D03*"),
  )
  expect(inputs.warnings).toEqual([])
  expect(inputs.features.sidesWithComponents).toEqual(["top"])
  expect(inputs.features.smtJointsPerBoard).toBe(1)
})

test("bottom paste away from any pin is reported", () => {
  const inputs = getQuoteInputsFromFabricationFiles(
    createFiles("X5000000Y5000000D03*\nX8000000Y2000000D03*"),
  )
  expect(inputs.warnings).toEqual([
    "1 paste openings on the bottom are not on a through-hole pin and no parts are placed there; not counted as joints",
  ])
})
