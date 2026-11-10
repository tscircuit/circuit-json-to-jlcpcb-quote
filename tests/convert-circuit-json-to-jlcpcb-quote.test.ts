import { expect, test } from "bun:test"
import {
  convertCircuitJsonToFabricationFiles,
  convertCircuitJsonToJlcpcbQuote,
  formatJlcpcbQuote,
} from "lib/index"
import {
  createFakeFetch,
  createFootprintShapes,
} from "./fixtures/create-fake-fetch"
import { loadRp2040Board } from "./fixtures/load-rp2040-board"

const fakeFetch = createFakeFetch({
  jlcpcbComponents: {
    C2040: {
      componentModelEn: "RP2040",
      componentSpecificationEn: "LQFN-56(7x7)",
      componentLibraryType: "expand",
      preferredComponentFlag: false,
      stockCount: 5000,
      lossNumber: 0,
      leastPatchNumber: 0,
      componentPrices: [{ startNumber: 1, endNumber: -1, productPrice: 1 }],
    },
    C25744: {
      componentModelEn: "0402WGF1002TCE",
      componentSpecificationEn: "0402",
      componentLibraryType: "base",
      stockCount: 100000,
      lossNumber: 15,
      leastPatchNumber: 20,
      componentPrices: [{ startNumber: 1, endNumber: -1, productPrice: 0.001 }],
    },
  },
  jlcsearchLists: {
    "/resistors/list.json?resistance=10000&package=0402": [
      {
        lcsc: 25744,
        mfr: "0402WGF1002TCE",
        package: "0402",
        is_basic: true,
        price1: 0.001,
      },
    ],
  },
  footprintShapes: {
    C2040: createFootprintShapes({ smt: 57, throughHole: 0 }),
    C25744: createFootprintShapes({ smt: 2, throughHole: 0 }),
  },
})

test("generates the same fabrication bundle as the tscircuit export", async () => {
  const files = await convertCircuitJsonToFabricationFiles(loadRp2040Board())
  expect(Object.keys(files).sort()).toEqual([
    "B_Cu.gbr",
    "B_Mask.gbr",
    "B_Paste.gbr",
    "B_SilkScreen.gbr",
    "Edge_Cuts.gbr",
    "F_Cu.gbr",
    "F_Fab.gbr",
    "F_Mask.gbr",
    "F_Paste.gbr",
    "F_SilkScreen.gbr",
    "In1_Cu.gbr",
    "In2_Cu.gbr",
    "bom.csv",
    "drill-L1-L4.drl",
    "pick_and_place.csv",
  ])
  expect(files["bom.csv"]).toContain('"U1","RP2040","C2040"')
  expect(files["pick_and_place.csv"]?.split(/\r?\n/)[0]).toBe(
    "Designator,Mid X,Mid Y,Layer,Rotation",
  )
})

test("refuses to quote when parts cannot be priced", async () => {
  await expect(
    convertCircuitJsonToJlcpcbQuote({
      circuitJson: loadRp2040Board(),
      fetch: fakeFetch,
    }),
  ).rejects.toThrow(
    /Cannot price 5 BOM lines: R3 .*J1 \(no JLCPCB part number\)/,
  )
})

test("quotes Circuit JSON through its fabrication files", async () => {
  const circuitJson = loadRp2040Board()
  const quote = await convertCircuitJsonToJlcpcbQuote({
    circuitJson,
    fetch: fakeFetch,
    unresolvedParts: "exclude",
  })

  expect(quote.features).toMatchObject({
    widthMm: 30,
    heightMm: 25,
    numLayers: 4,
    thicknessMm: 1.6,
    material: "fr4",
    sidesWithComponents: ["top"],
  })
  expect(quote.order.assembly).toBe("economic")
  expect(
    quote.bom.map((line) => [line.designators.join(), line.part.lcsc]),
  ).toEqual([
    ["U1", "C2040"],
    ["R1,R2", "C25744"], // no part number: matched by rating and footprint
  ])
  expect(
    quote.excludedBomLines.map(({ line }) => line.designators.join()),
  ).toEqual(["R3", "C1", "C2", "D1", "J1"])

  // Joints are the paste openings of the generated F_Paste layer.
  const files = await convertCircuitJsonToFabricationFiles(circuitJson)
  const pasteOpenings = files["F_Paste.gbr"]?.match(/D03\*/g)?.length ?? 0
  expect(pasteOpenings).toBeGreaterThan(60)
  expect(quote.features.smtJointsPerBoard).toBe(pasteOpenings)

  expect(
    Object.fromEntries(quote.lineItems.map((item) => [item.key, item.cost])),
  ).toEqual({
    pcb_base: 7,
    confirm_production_file: 1.05,
    deburring: 0.1,
    setup: 8.24,
    stencil: 1.55,
    feeder_loading: 3.09, // RP2040 only; the resistor is basic
    nitrogen_reflow: 0.91,
    smt_placement: 0.23,
    confirm_parts_placement: 0.45,
    components: 2, // 2 x $1 + 4 basic resistors at $0.001, no spares
  })
  expect(quote.warnings.join("\n")).toContain(
    "J1: no JLCPCB part number; left out of assembly and parts cost",
  )
  expect(formatJlcpcbQuote(quote)).toContain("4-layer FR4")
})

test("bare-board quote needs no part lookups", async () => {
  const quote = await convertCircuitJsonToJlcpcbQuote({
    circuitJson: loadRp2040Board(),
    assembly: "none",
    fetch: () => {
      throw new Error("should not fetch")
    },
  })
  expect(quote.assemblyTotal).toBe(0)
  expect(quote.total).toBe(8.15)
})
