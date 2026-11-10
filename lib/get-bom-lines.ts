import type { BomLine, CircuitJson } from "./types"

/**
 * Group placed components into BOM lines. Components sharing a JLC part
 * number (or, lacking one, the same MPN / value + footprint) share a line.
 */
export const getBomLines = (circuitJson: CircuitJson): BomLine[] => {
  const smtPads = new Map<string, number>()
  const platedHoles = new Map<string, number>()
  const padCenters = new Map<string, { x: number; y: number }[]>()
  for (const el of circuitJson) {
    if (el.type === "pcb_smtpad" && el.pcb_component_id) {
      smtPads.set(
        el.pcb_component_id,
        (smtPads.get(el.pcb_component_id) ?? 0) + 1,
      )
      if ("x" in el && "y" in el) {
        const list = padCenters.get(el.pcb_component_id) ?? []
        list.push({ x: el.x, y: el.y })
        padCenters.set(el.pcb_component_id, list)
      }
    } else if (el.type === "pcb_plated_hole" && el.pcb_component_id) {
      platedHoles.set(
        el.pcb_component_id,
        (platedHoles.get(el.pcb_component_id) ?? 0) + 1,
      )
    }
  }

  const sourceComponents = new Map<string, any>()
  for (const el of circuitJson) {
    if (el.type === "source_component") {
      sourceComponents.set(el.source_component_id, el)
    }
  }

  const lines = new Map<string, BomLine>()
  for (const el of circuitJson) {
    if (el.type !== "pcb_component") continue
    if (el.do_not_place) continue
    const source = sourceComponents.get(el.source_component_id)
    if (!source) continue
    const smtJoints = smtPads.get(el.pcb_component_id) ?? 0
    const thtJoints = platedHoles.get(el.pcb_component_id) ?? 0
    if (smtJoints + thtJoints === 0) continue

    const jlcPartNumber: string | undefined =
      source.supplier_part_numbers?.jlcpcb?.[0] ??
      source.supplier_part_numbers?.lcsc?.[0]
    const value = getValue(source)
    const chipPackage = getChipPackage(padCenters.get(el.pcb_component_id))
    const key =
      jlcPartNumber ??
      source.manufacturer_part_number ??
      `${source.ftype}:${value}:${chipPackage}:${smtJoints}:${thtJoints}`

    const line = lines.get(key)
    if (line) {
      line.designators.push(source.name)
      line.quantity++
      continue
    }
    lines.set(key, {
      designators: [source.name],
      quantity: 1,
      ftype: source.ftype,
      value: value && chipPackage ? `${value} ${chipPackage}` : value,
      manufacturerPartNumber: source.manufacturer_part_number,
      requestedJlcPartNumber: jlcPartNumber,
      smtJointsPerPart: smtJoints,
      throughHoleJointsPerPart: thtJoints,
      valueLookup: getValueLookup(source, chipPackage),
    })
  }
  return [...lines.values()]
}

const getValueLookup = (
  source: any,
  chipPackage: string | undefined,
): BomLine["valueLookup"] => {
  if (!chipPackage) return undefined
  if (source.ftype === "simple_resistor" && source.resistance != null) {
    return {
      category: "resistors",
      params: { resistance: String(source.resistance), package: chipPackage },
    }
  }
  if (source.ftype === "simple_capacitor" && source.capacitance != null) {
    return {
      category: "capacitors",
      params: { capacitance: String(source.capacitance), package: chipPackage },
    }
  }
  if (source.ftype === "simple_led") {
    return {
      category: "leds",
      params: {
        package: chipPackage,
        ...(source.color ? { color: String(source.color) } : {}),
      },
    }
  }
  return undefined
}

const getValue = (source: any): string | undefined => {
  if (source.ftype === "simple_resistor" && source.resistance != null) {
    return `${formatSi(source.resistance)}Ω`
  }
  if (source.ftype === "simple_capacitor" && source.capacitance != null) {
    return `${formatSi(source.capacitance)}F`
  }
  if (source.ftype === "simple_led") {
    return source.color ? `${source.color} LED` : "LED"
  }
  if (source.ftype === "simple_inductor" && source.inductance != null) {
    return `${formatSi(source.inductance)}H`
  }
  return undefined
}

/** 10000 -> "10k", 1e-7 -> "100n", the way JLCPCB writes part descriptions. */
export const formatSi = (value: number): string => {
  const prefixes: [number, string][] = [
    [1e6, "M"],
    [1e3, "k"],
    [1, ""],
    [1e-3, "m"],
    [1e-6, "u"],
    [1e-9, "n"],
    [1e-12, "p"],
  ]
  for (const [scale, prefix] of prefixes) {
    if (value >= scale * 0.9999) {
      return `${Number((value / scale).toPrecision(4))}${prefix}`
    }
  }
  return `${value}`
}

/** Imperial chip size of a two-pad part, guessed from the pad pitch. */
const getChipPackage = (
  pads: { x: number; y: number }[] | undefined,
): string | undefined => {
  if (!pads || pads.length !== 2) return undefined
  const pitch = Math.hypot(pads[0]!.x - pads[1]!.x, pads[0]!.y - pads[1]!.y)
  if (pitch < 0.75) return "0201"
  if (pitch < 1.3) return "0402"
  if (pitch < 1.75) return "0603"
  if (pitch < 2.5) return "0805"
  if (pitch < 3.6) return "1206"
  return undefined
}
