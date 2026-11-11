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
  components: {
    C2040: {
      mfr: "RP2040",
      package: "LQFN-56(7x7)",
      is_basic: false,
      is_preferred: false,
      stock: 5000,
      price: 1,
    },
    C25744: {
      mfr: "0402WGF1002TCE",
      package: "0402",
      is_basic: true,
      is_preferred: false,
      stock: 100000,
      price: 0.001,
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
  expect(quote.additionalFees.map((fee) => fee.key)).toEqual(["deburring"])
  const report = formatJlcpcbQuote(quote)
  expect(report).toContain("Board fabrication (5 boards)")
  expect(report).toContain("Additional fees (1 detected)")
  expect(report).toContain("Avoid: Make the shorter side at least 30mm")
  expect(report).toContain("Assembly, economic PCBA (2 boards)")
  expect(report).toContain("Assembly, standard PCBA (2 boards)")
})

test("the quote for a board, as returned to callers such as the CLI", async () => {
  const quote = await convertCircuitJsonToJlcpcbQuote({
    circuitJson: loadRp2040Board(),
    quantity: 5,
    assembledQuantity: 5,
    fetch: fakeFetch,
    unresolvedParts: "exclude",
  })
  // The quote is plain data: it survives JSON unchanged.
  expect(JSON.parse(JSON.stringify(quote))).toEqual(quote)
  expect(quote).toMatchInlineSnapshot(`
    {
      "additionalFees": [
        {
          "category": "additional_fee",
          "confidence": "published",
          "cost": 0.1,
          "highCost": 0.1,
          "howToAvoid": "Make the shorter side at least 30mm, or order the boards as a panel.",
          "key": "deburring",
          "label": "Small-board deburring",
          "lowCost": 0.1,
          "reason": "The board's shorter side is 25mm. JLCPCB deburrs boards with a side under 30mm by hand.",
        },
      ],
      "additionalFeesTotal": 0.1,
      "assemblyOptions": [
        {
          "assembly": "economic",
          "highTotal": 20.33,
          "lineItems": [
            {
              "category": "assembly",
              "confidence": "quoted",
              "cost": 8.24,
              "highCost": 8.24,
              "key": "setup",
              "label": "Setup fee",
              "lowCost": 8.24,
            },
            {
              "category": "assembly",
              "confidence": "quoted",
              "cost": 1.55,
              "highCost": 1.55,
              "key": "stencil",
              "label": "Stencil",
              "lowCost": 1.55,
            },
            {
              "category": "assembly",
              "confidence": "quoted",
              "cost": 3.09,
              "highCost": 3.09,
              "key": "feeder_loading",
              "label": "Extended parts loading (1 of 2 unique parts)",
              "lowCost": 3.09,
            },
            {
              "category": "assembly",
              "confidence": "quoted",
              "cost": 0.91,
              "highCost": 0.91,
              "key": "nitrogen_reflow",
              "label": "Nitrogen reflow soldering",
              "lowCost": 0.91,
            },
            {
              "category": "assembly",
              "confidence": "quoted",
              "cost": 0.58,
              "highCost": 0.58,
              "key": "smt_placement",
              "label": "SMT placement (340 joints)",
              "lowCost": 0.58,
            },
            {
              "category": "assembly",
              "confidence": "published",
              "cost": 0.45,
              "highCost": 0.45,
              "key": "confirm_parts_placement",
              "label": "Confirm parts placement",
              "lowCost": 0.45,
            },
            {
              "category": "components",
              "confidence": "calibrated",
              "cost": 5.01,
              "highCost": 5.51,
              "key": "components",
              "label": "Parts for 5 boards (2 unique)",
              "lowCost": 4.51,
              "note": "1 extended parts priced at the single-piece price with estimated spares",
            },
          ],
          "lowTotal": 19.33,
          "perBoard": 3.97,
          "total": 19.83,
          "unavailableReasons": [],
          "warnings": [],
        },
        {
          "assembly": "standard",
          "highTotal": 52.03,
          "lineItems": [
            {
              "category": "assembly",
              "confidence": "published",
              "cost": 25.56,
              "highCost": 25.56,
              "key": "setup",
              "label": "Setup fee (one side)",
              "lowCost": 25.56,
            },
            {
              "category": "assembly",
              "confidence": "published",
              "cost": 8.21,
              "highCost": 8.21,
              "key": "stencil",
              "label": "Stencil",
              "lowCost": 8.21,
            },
            {
              "category": "assembly",
              "confidence": "published",
              "cost": 3.06,
              "highCost": 3.06,
              "key": "feeder_loading",
              "label": "Parts loading (2 unique parts)",
              "lowCost": 3.06,
            },
            {
              "category": "assembly",
              "confidence": "published",
              "cost": 0.5,
              "highCost": 0.5,
              "key": "packaging",
              "label": "Packaging",
              "lowCost": 0.5,
            },
            {
              "category": "assembly",
              "confidence": "published",
              "cost": 8.2,
              "highCost": 8.2,
              "key": "xray",
              "label": "X-ray inspection (5 BGA/LGA/QFN placements)",
              "lowCost": 0,
              "note": "Optional on the order form",
            },
            {
              "category": "assembly",
              "confidence": "published",
              "cost": 0.54,
              "highCost": 0.54,
              "key": "smt_placement",
              "label": "SMT placement (340 joints)",
              "lowCost": 0.54,
            },
            {
              "category": "assembly",
              "confidence": "published",
              "cost": 0.45,
              "highCost": 0.45,
              "key": "confirm_parts_placement",
              "label": "Confirm parts placement",
              "lowCost": 0.45,
            },
            {
              "category": "components",
              "confidence": "calibrated",
              "cost": 5.01,
              "highCost": 5.51,
              "key": "components",
              "label": "Parts for 5 boards (2 unique)",
              "lowCost": 4.51,
              "note": "1 extended parts priced at the single-piece price with estimated spares",
            },
          ],
          "lowTotal": 42.83,
          "perBoard": 10.31,
          "total": 51.53,
          "unavailableReasons": [],
          "warnings": [],
        },
      ],
      "assemblyTotal": 19.83,
      "bom": [
        {
          "comment": "RP2040",
          "designators": [
            "U1",
          ],
          "footprintJoints": {
            "smt": 57,
            "throughHole": 0,
          },
          "matchMethod": "jlc_part_number",
          "part": {
            "billing": null,
            "isBasic": false,
            "isPreferred": false,
            "lcsc": "C2040",
            "mfr": "RP2040",
            "package": "LQFN-56(7x7)",
            "priceTiers": [],
            "stock": 5000,
            "unitPrice": 1,
          },
          "passiveLookup": undefined,
          "quantity": 1,
          "requestedJlcPartNumber": "C2040",
        },
        {
          "comment": "10k",
          "designators": [
            "R1",
            "R2",
          ],
          "footprintJoints": {
            "smt": 2,
            "throughHole": 0,
          },
          "matchMethod": "passive_spec",
          "part": {
            "billing": null,
            "isBasic": true,
            "isPreferred": false,
            "lcsc": "C25744",
            "mfr": "0402WGF1002TCE",
            "package": "0402",
            "priceTiers": [],
            "stock": 100000,
            "unitPrice": 0.001,
          },
          "passiveLookup": {
            "category": "resistors",
            "query": {
              "package": "0402",
              "resistance": "10000",
            },
          },
          "quantity": 2,
          "requestedJlcPartNumber": undefined,
        },
      ],
      "currency": "USD",
      "excludedBomLines": [
        {
          "line": {
            "comment": "5.1k",
            "designators": [
              "R3",
            ],
            "passiveLookup": {
              "category": "resistors",
              "query": {
                "package": "0402",
                "resistance": "5100",
              },
            },
            "quantity": 1,
            "requestedJlcPartNumber": undefined,
          },
          "reason": "no JLCPCB part with that rating and package",
        },
        {
          "line": {
            "comment": "100n",
            "designators": [
              "C1",
            ],
            "passiveLookup": {
              "category": "capacitors",
              "query": {
                "capacitance": "1.0000000000000001e-7",
                "package": "0402",
              },
            },
            "quantity": 1,
            "requestedJlcPartNumber": undefined,
          },
          "reason": "no JLCPCB part with that rating and package",
        },
        {
          "line": {
            "comment": "1u",
            "designators": [
              "C2",
            ],
            "passiveLookup": {
              "category": "capacitors",
              "query": {
                "capacitance": "1e-6",
                "package": "0603",
              },
            },
            "quantity": 1,
            "requestedJlcPartNumber": undefined,
          },
          "reason": "no JLCPCB part with that rating and package",
        },
        {
          "line": {
            "comment": "",
            "designators": [
              "D1",
            ],
            "passiveLookup": undefined,
            "quantity": 1,
            "requestedJlcPartNumber": undefined,
          },
          "reason": "no JLCPCB part number",
        },
        {
          "line": {
            "comment": "",
            "designators": [
              "J1",
            ],
            "passiveLookup": undefined,
            "quantity": 1,
            "requestedJlcPartNumber": undefined,
          },
          "reason": "no JLCPCB part number",
        },
      ],
      "fabricationLineItems": [
        {
          "category": "fabrication",
          "confidence": "calibrated",
          "cost": 7,
          "highCost": 7,
          "key": "pcb_base",
          "label": "4-layer FR4, 5 pcs, special offer",
          "lowCost": 7,
        },
        {
          "category": "fabrication",
          "confidence": "quoted",
          "cost": 1.05,
          "highCost": 1.05,
          "key": "confirm_production_file",
          "label": "Confirm production file",
          "lowCost": 1.05,
        },
      ],
      "fabricationPerBoard": 1.61,
      "fabricationTotal": 8.05,
      "features": {
        "heightMm": 25,
        "holeCount": 4,
        "material": "fr4",
        "minTraceWidthMm": null,
        "numLayers": 4,
        "sidesWithComponents": [
          "top",
        ],
        "smallestVia": null,
        "smtJointsPerBoard": 68,
        "stiffenerCount": 0,
        "thicknessMm": 1.6,
        "viaCount": 0,
        "widthMm": 30,
      },
      "highTotal": 28.48,
      "lineItems": [
        {
          "category": "fabrication",
          "confidence": "calibrated",
          "cost": 7,
          "highCost": 7,
          "key": "pcb_base",
          "label": "4-layer FR4, 5 pcs, special offer",
          "lowCost": 7,
        },
        {
          "category": "fabrication",
          "confidence": "quoted",
          "cost": 1.05,
          "highCost": 1.05,
          "key": "confirm_production_file",
          "label": "Confirm production file",
          "lowCost": 1.05,
        },
        {
          "category": "additional_fee",
          "confidence": "published",
          "cost": 0.1,
          "highCost": 0.1,
          "howToAvoid": "Make the shorter side at least 30mm, or order the boards as a panel.",
          "key": "deburring",
          "label": "Small-board deburring",
          "lowCost": 0.1,
          "reason": "The board's shorter side is 25mm. JLCPCB deburrs boards with a side under 30mm by hand.",
        },
        {
          "category": "assembly",
          "confidence": "quoted",
          "cost": 8.24,
          "highCost": 8.24,
          "key": "setup",
          "label": "Setup fee",
          "lowCost": 8.24,
        },
        {
          "category": "assembly",
          "confidence": "quoted",
          "cost": 1.55,
          "highCost": 1.55,
          "key": "stencil",
          "label": "Stencil",
          "lowCost": 1.55,
        },
        {
          "category": "assembly",
          "confidence": "quoted",
          "cost": 3.09,
          "highCost": 3.09,
          "key": "feeder_loading",
          "label": "Extended parts loading (1 of 2 unique parts)",
          "lowCost": 3.09,
        },
        {
          "category": "assembly",
          "confidence": "quoted",
          "cost": 0.91,
          "highCost": 0.91,
          "key": "nitrogen_reflow",
          "label": "Nitrogen reflow soldering",
          "lowCost": 0.91,
        },
        {
          "category": "assembly",
          "confidence": "quoted",
          "cost": 0.58,
          "highCost": 0.58,
          "key": "smt_placement",
          "label": "SMT placement (340 joints)",
          "lowCost": 0.58,
        },
        {
          "category": "assembly",
          "confidence": "published",
          "cost": 0.45,
          "highCost": 0.45,
          "key": "confirm_parts_placement",
          "label": "Confirm parts placement",
          "lowCost": 0.45,
        },
        {
          "category": "components",
          "confidence": "calibrated",
          "cost": 5.01,
          "highCost": 5.51,
          "key": "components",
          "label": "Parts for 5 boards (2 unique)",
          "lowCost": 4.51,
          "note": "1 extended parts priced at the single-piece price with estimated spares",
        },
      ],
      "lowTotal": 27.48,
      "order": {
        "assembledQuantity": 5,
        "assembly": "economic",
        "quantity": 5,
        "surfaceFinish": "hasl_leaded",
      },
      "priceTableVersion": "2026-11-10",
      "total": 27.98,
      "warnings": [
        "R1,R2: no part number given, matched "10k" to C25744 (0402WGF1002TCE)",
        "R3: no JLCPCB part with that rating and package; left out of assembly and parts cost",
        "C1: no JLCPCB part with that rating and package; left out of assembly and parts cost",
        "C2: no JLCPCB part with that rating and package; left out of assembly and parts cost",
        "D1: no JLCPCB part number; left out of assembly and parts cost",
        "J1: no JLCPCB part number; left out of assembly and parts cost",
      ],
    }
  `)
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
