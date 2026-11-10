import { expect, test } from "bun:test"
import { lookupJlcParts } from "lib/index"
import type { BomLine, FetchLike } from "lib/index"
import {
  createFakeFetch,
  createFootprintShapes,
} from "./fixtures/create-fake-fetch"

const lookup = (bom: BomLine[], fetch: FetchLike) =>
  lookupJlcParts(bom, {
    fetch,
    jlcsearchBaseUrl: "https://jlcsearch.test",
    partSource: "jlcpcb",
  })

const line: BomLine = {
  designators: ["U1"],
  quantity: 1,
  comment: "PART7",
  requestedJlcPartNumber: "C7",
}

const jlcpcbComponent = {
  componentModelEn: "PART7",
  componentSpecificationEn: "0603",
  describe: "a part",
  componentLibraryType: "expand",
  preferredComponentFlag: true,
  stockCount: 42,
  lossNumber: 8,
  leastPatchNumber: 20,
  componentPrices: [
    { startNumber: 30, endNumber: -1, productPrice: 0.3 },
    { startNumber: 1, endNumber: 29, productPrice: 0.5 },
  ],
}

test("reads tiers, spares and flags from JLCPCB's parts library", async () => {
  const result = await lookup(
    [line],
    createFakeFetch({
      jlcpcbComponents: { C7: jlcpcbComponent },
      footprintShapes: {
        C7: createFootprintShapes({ smt: 2, throughHole: 3 }),
      },
    }),
  )
  expect(result.unresolvedBomLines).toEqual([])
  expect(result.pricedBom).toEqual([
    {
      ...line,
      matchMethod: "jlc_part_number",
      footprintJoints: { smt: 2, throughHole: 3 },
      part: {
        lcsc: "C7",
        mfr: "PART7",
        package: "0603",
        isBasic: false,
        isPreferred: true,
        unitPrice: 0.5,
        stock: 42,
        priceTiers: [
          { fromQuantity: 1, unitPrice: 0.5 },
          { fromQuantity: 30, unitPrice: 0.3 },
        ],
        billing: { spareQuantity: 8, minimumQuantity: 20 },
        source: "jlcpcb",
      },
    },
  ])
  // The input line is left untouched.
  expect(line).not.toHaveProperty("part")
})

test("reports parts that cannot be priced, with the reason", async () => {
  const result = await lookup(
    [
      line,
      { designators: ["J1"], quantity: 1, comment: "pinrow4" },
      { ...line, designators: ["U2"], requestedJlcPartNumber: "C8" },
    ],
    createFakeFetch({
      jlcpcbComponents: { C7: jlcpcbComponent, C8: jlcpcbComponent },
    }),
  )
  expect(result.pricedBom).toEqual([])
  expect(
    result.unresolvedBomLines.map(({ line: unresolved, reason }) => [
      unresolved.designators.join(),
      reason,
    ]),
  ).toEqual([
    ["U1", "C7 has no footprint, so its solder joints are unknown"],
    ["J1", "no JLCPCB part number"],
    ["U2", "C8 has no footprint, so its solder joints are unknown"],
  ])
})

test("a malformed answer throws instead of being treated as not found", async () => {
  const brokenFetch: FetchLike = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ code: 500, message: "nope" }),
  })
  await expect(lookup([line], brokenFetch)).rejects.toThrow(
    "Unexpected answer from JLCPCB's parts library for C7",
  )
})
