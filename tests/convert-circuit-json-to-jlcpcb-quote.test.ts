import { expect, test } from "bun:test"
import { convertCircuitJsonToJlcpcbQuote, formatJlcpcbQuote } from "lib/index"

const pad = (id: string, component: string, x: number) => ({
  type: "pcb_smtpad",
  pcb_smtpad_id: id,
  pcb_component_id: component,
  shape: "rect",
  x,
  y: 0,
  width: 0.5,
  height: 0.5,
  layer: "top",
})

const circuitJson: any[] = [
  {
    type: "pcb_board",
    pcb_board_id: "b1",
    width: 40,
    height: 20,
    thickness: 1.6,
    num_layers: 2,
    material: "fr4",
    center: { x: 0, y: 0 },
  },
  {
    type: "source_component",
    source_component_id: "s1",
    name: "R1",
    ftype: "simple_resistor",
    resistance: 10000,
    supplier_part_numbers: { jlcpcb: ["C25744"] },
  },
  {
    type: "source_component",
    source_component_id: "s2",
    name: "R2",
    ftype: "simple_resistor",
    resistance: 10000,
    supplier_part_numbers: { jlcpcb: ["C25744"] },
  },
  {
    type: "source_component",
    source_component_id: "s3",
    name: "U1",
    ftype: "simple_chip",
    manufacturer_part_number: "RP2040",
  },
  {
    type: "source_component",
    source_component_id: "s4",
    name: "J1",
    ftype: "simple_pin_header",
  },
  ...["c1", "c2", "c3", "c4"].map((id, i) => ({
    type: "pcb_component",
    pcb_component_id: id,
    source_component_id: `s${i + 1}`,
    layer: "top",
    center: { x: 0, y: 0 },
    rotation: 0,
    width: 1,
    height: 1,
  })),
  pad("p1", "c1", 0),
  pad("p2", "c1", 1),
  pad("p3", "c2", 0),
  pad("p4", "c2", 1),
  ...Array.from({ length: 57 }, (_, i) => pad(`u${i}`, "c3", i)),
  pad("j1", "c4", 0),
  {
    type: "pcb_via",
    pcb_via_id: "v1",
    x: 0,
    y: 0,
    hole_diameter: 0.2,
    outer_diameter: 0.4,
    layers: ["top", "bottom"],
  },
  {
    type: "pcb_via",
    pcb_via_id: "v2",
    x: 1,
    y: 0,
    hole_diameter: 0.3,
    outer_diameter: 0.6,
    layers: ["top", "bottom"],
  },
]

const fakeFetch = (async (url: string) => {
  const query = decodeURIComponent(new URL(url).searchParams.get("q") ?? "")
  const catalog = [
    {
      lcsc: 25744,
      mfr: "0402WGF1002TCE",
      package: "0402",
      description: "10kΩ 0402",
      is_basic: true,
      is_preferred: false,
      stock: 1000,
      price: 0.001,
    },
    {
      lcsc: 2040,
      mfr: "RP2040",
      package: "LQFN-56(7x7)",
      description: "MCU",
      is_basic: false,
      is_preferred: false,
      stock: 500,
      price: 1,
    },
  ]
  const components = catalog.filter(
    (c) => query === `C${c.lcsc}` || query === c.mfr,
  )
  return new Response(JSON.stringify({ components }))
}) as unknown as typeof fetch

test("quotes a small assembled board end to end", async () => {
  const quote = await convertCircuitJsonToJlcpcbQuote({
    circuitJson,
    fetch: fakeFetch,
  })

  expect(quote.features).toMatchObject({
    widthMm: 40,
    heightMm: 20,
    numLayers: 2,
    viaCount: 2,
    smallestVia: { holeDiameterMm: 0.2, outerDiameterMm: 0.4 },
  })
  expect(quote.options.assembly).toBe("economic")
  expect(
    quote.bom.map((line) => [line.designators.join(), line.part?.lcsc]),
  ).toEqual([
    ["R1,R2", "C25744"],
    ["U1", "C2040"],
    ["J1", undefined],
  ])

  const cost = Object.fromEntries(
    quote.lineItems.map((item) => [item.key, item.cost]),
  )
  expect(cost).toEqual({
    pcb_base: 2,
    four_wire_kelvin_test: 54.18,
    deburring: 0.1,
    setup: 8.18,
    stencil: 1.53,
    feeder_loading: 3.07, // RP2040 only; the resistor is basic
    smt_placement: 0.2, // (2 * 2 + 57) joints * 2 boards * 0.0016
    components: 2.01, // 2 * $1 + (4 used + 5 spare) * $0.001
  })
  expect(quote.total).toBe(71.27)
  expect(quote.warnings.join("\n")).toContain("J1: no JLCPCB part found")
  expect(formatJlcpcbQuote(quote)).toContain("4-wire Kelvin test")
})

test("bare-board quote skips part lookups", async () => {
  const quote = await convertCircuitJsonToJlcpcbQuote({
    circuitJson,
    assembly: "none",
    fetch: (() => {
      throw new Error("should not fetch")
    }) as unknown as typeof fetch,
  })
  expect(quote.assemblyTotal).toBe(0)
  expect(quote.total).toBe(56.28)
})
