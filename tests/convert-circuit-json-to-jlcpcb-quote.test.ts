import { expect, test } from "bun:test"
import {
  convertCircuitJsonToFabricationFiles,
  convertCircuitJsonToJlcpcbQuote,
  formatJlcpcbQuote,
} from "lib/index"
import circuitJson from "./assets/rp2040-board.circuit.json"

/**
 * rp2040-board.circuit.json was rendered by tscircuit: a 30x25mm 4-layer
 * board with an RP2040 (C2040), three 0402 resistors, two capacitors, an LED
 * and a pin header. Only the RP2040 carries a JLC part number.
 */
const jlcpcbLibrary: Record<string, object> = {
  C2040: {
    componentModelEn: "RP2040",
    componentSpecificationEn: "LQFN-56(7x7)",
    componentLibraryType: "expand",
    preferredComponentFlag: false,
    stockCount: 5000,
    initialPrice: 1,
    lossNumber: 0,
    leastPatchNumber: 0,
    componentPrices: [{ startNumber: 1, endNumber: -1, productPrice: 1 }],
  },
  C25744: {
    componentModelEn: "0402WGF1002TCE",
    componentSpecificationEn: "0402",
    componentLibraryType: "base",
    stockCount: 100000,
    initialPrice: 0.001,
    lossNumber: 15,
    leastPatchNumber: 20,
    componentPrices: [{ startNumber: 1, endNumber: -1, productPrice: 0.001 }],
  },
}

const fakeFetch = (async (url: string, init?: RequestInit) => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status })
  if (url.includes("jlcpcb.com")) {
    const code = JSON.parse(String(init?.body)).keyword
    const part = jlcpcbLibrary[code]
    return json({
      code: 200,
      data: {
        componentPageInfo: {
          list: part ? [{ componentCode: code, ...part }] : [],
        },
      },
    })
  }
  const { pathname, searchParams } = new URL(url)
  if (pathname === "/resistors/list.json") {
    return json({
      resistors:
        searchParams.get("resistance") === "10000" &&
        searchParams.get("package") === "0402"
          ? [
              {
                lcsc: 25744,
                mfr: "0402WGF1002TCE",
                package: "0402",
                description: "",
                is_basic: true,
                is_preferred: false,
                stock: 1,
                price1: 0.001,
              },
            ]
          : [],
    })
  }
  if (pathname.endsWith("/list.json")) {
    return json({ [pathname.split("/")[1]!]: [] })
  }
  if (pathname.startsWith("/api/easyeda_components/")) return json({}, 404)
  return json({ components: [] })
}) as unknown as typeof fetch

test("generates the same fabrication bundle as the tscircuit export", async () => {
  const files = await convertCircuitJsonToFabricationFiles(circuitJson as any)
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
  expect(files["pick_and_place.csv"]!.split(/\r?\n/)[0]).toBe(
    "Designator,Mid X,Mid Y,Layer,Rotation",
  )
})

test("quotes Circuit JSON through its fabrication files", async () => {
  const quote = await convertCircuitJsonToJlcpcbQuote({
    circuitJson: circuitJson as any,
    fetch: fakeFetch,
  })

  expect(quote.features).toMatchObject({
    widthMm: 30,
    heightMm: 25,
    numLayers: 4,
    material: "fr4",
    sidesWithComponents: ["top"],
  })
  expect(quote.options.assembly).toBe("economic")
  expect(
    quote.bom.map((line) => [line.designators.join(), line.part?.lcsc]),
  ).toEqual([
    ["U1", "C2040"],
    ["R1,R2", "C25744"], // no part number: matched by value and footprint
    ["R3", undefined],
    ["C1", undefined],
    ["C2", undefined],
    ["D1", undefined],
    ["J1", undefined],
  ])

  const cost = Object.fromEntries(
    quote.lineItems.map((item) => [item.key, item.cost]),
  )
  expect(cost).toEqual({
    pcb_base: 7,
    confirm_production_file: 1.05,
    deburring: 0.1,
    setup: 8.24,
    stencil: 1.55,
    feeder_loading: 3.09, // RP2040 only; the resistor is basic
    nitrogen_reflow: 0.91,
    smt_placement: cost.smt_placement!,
    confirm_parts_placement: 0.45,
    components: 2, // 2 x $1 + 4 basic resistors at $0.001, no spares
  })
  // Joints are the paste openings of the generated F_Paste layer.
  const pasteOpenings = (
    (await convertCircuitJsonToFabricationFiles(circuitJson as any))[
      "F_Paste.gbr"
    ]!.match(/D03\*/g) ?? []
  ).length
  expect(pasteOpenings).toBeGreaterThan(60)
  expect(cost.smt_placement).toBe(
    Math.round(pasteOpenings * 2 * 0.0017 * 100) / 100,
  )
  expect(quote.warnings.join("\n")).toContain("J1: no JLCPCB part found")
  expect(formatJlcpcbQuote(quote)).toContain("4-layer FR4")
})

test("bare-board quote skips part lookups", async () => {
  const quote = await convertCircuitJsonToJlcpcbQuote({
    circuitJson: circuitJson as any,
    assembly: "none",
    fetch: (() => {
      throw new Error("should not fetch")
    }) as unknown as typeof fetch,
  })
  expect(quote.assemblyTotal).toBe(0)
  expect(quote.total).toBe(8.15)
})
