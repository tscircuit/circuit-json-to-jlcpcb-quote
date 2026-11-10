/**
 * Count the SMT and through-hole pads of a part's JLCPCB (EasyEDA) footprint,
 * through jlcsearch's cached copy. Used when the input has no per-part pad
 * data (fabrication files); Circuit JSON carries its own pads.
 */
export const fetchFootprintJoints = async (
  lcscNumber: number,
  options: { baseUrl?: string; fetch?: typeof fetch } = {},
): Promise<{ smt: number; throughHole: number } | null> => {
  const baseUrl = options.baseUrl ?? "https://jlcsearch.tscircuit.com"
  const fetchFn = options.fetch ?? fetch
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 2000 * attempt))
    try {
      const response = await fetchFn(
        `${baseUrl}/api/easyeda_components/C${lcscNumber}`,
      )
      if (response.status === 404) return null
      const body: any = await response.json().catch(() => null)
      let data =
        body?.easyeda_component_details?.easyeda_json?.packageDetail?.dataStr
      if (typeof data === "string") data = JSON.parse(data)
      if (!Array.isArray(data?.shape)) continue
      let smt = 0
      let throughHole = 0
      for (const shape of data.shape as string[]) {
        if (!shape.startsWith("PAD~")) continue
        // Field 6 is the layer; 11 is "multi-layer", i.e. a plated hole.
        if (shape.split("~")[6] === "11") throughHole++
        else smt++
      }
      return { smt, throughHole }
    } catch {
      // retry
    }
  }
  return null
}
