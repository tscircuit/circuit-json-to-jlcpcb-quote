import type { FetchLike, LcscPartNumber } from "lib/index"

/** Path and query, e.g. "/resistors/list.json?resistance=10000&package=0402" */
type JlcsearchListUrl = string

const jsonResponse = (body: unknown, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => body,
})

/**
 * A fetch that answers like jlcsearch, from in-memory catalogs. Anything not
 * in a catalog is "not found".
 */
export const createFakeFetch = (catalog: {
  /** jlcsearch /api/search rows, without the lcsc number */
  components?: Partial<Record<LcscPartNumber, object>>
  /** jlcsearch category rows keyed by path and query */
  jlcsearchLists?: Partial<Record<JlcsearchListUrl, object[]>>
  /** EasyEDA "PAD~..." shapes per part */
  footprintShapes?: Partial<Record<LcscPartNumber, string[]>>
}): FetchLike => {
  return async (url) => {
    const { pathname, search, searchParams } = new URL(url)
    if (pathname === "/api/search") {
      const lcsc = searchParams.get("q") ?? ""
      const component = catalog.components?.[lcsc]
      return jsonResponse({
        components: component
          ? [{ lcsc: Number(lcsc.slice(1)), ...component }]
          : [],
      })
    }
    if (pathname.startsWith("/api/easyeda_components/")) {
      const shape = catalog.footprintShapes?.[pathname.split("/").pop() ?? ""]
      if (!shape) return jsonResponse({}, 404)
      return jsonResponse({
        easyeda_component_details: {
          easyeda_json: { packageDetail: { dataStr: { shape } } },
        },
      })
    }
    if (pathname.endsWith("/list.json")) {
      const category = pathname.split("/")[1] ?? ""
      const rows =
        catalog.jlcsearchLists?.[`${pathname}${search}`] ??
        catalog.jlcsearchLists?.[
          `${pathname}${search.replace("&is_basic=true", "")}`
        ]
      return jsonResponse({ [category]: rows ?? [] })
    }
    return jsonResponse({ components: [] })
  }
}

/** An EasyEDA footprint with this many SMT and through-hole pads */
export const createFootprintShapes = (pads: {
  smt: number
  throughHole: number
}): string[] => [
  ...Array.from({ length: pads.smt }, () => "PAD~RECT~0~0~1~1~1~~1"),
  ...Array.from(
    { length: pads.throughHole },
    () => "PAD~ELLIPSE~0~0~1~1~11~~1",
  ),
  "TRACK~1~3~~0 0 1 1",
]
