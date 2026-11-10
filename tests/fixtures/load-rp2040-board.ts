import { type CircuitJson, parseCircuitJson } from "lib/index"
import rp2040Board from "../assets/rp2040-board.circuit.json"

/**
 * A 30x25mm 4-layer board rendered by tscircuit: an RP2040 (C2040), three
 * 0402 resistors, two capacitors, an LED and a pin header. Only the RP2040
 * carries a JLC part number.
 */
export const loadRp2040Board = (): CircuitJson => parseCircuitJson(rp2040Board)
