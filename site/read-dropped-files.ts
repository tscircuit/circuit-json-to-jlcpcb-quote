import { unzipSync } from "fflate"
import {
  type CircuitJson,
  type FabricationFiles,
  parseCircuitJson,
} from "../lib/index"

/** A file the user dropped, or one unpacked from a dropped zip */
export interface DroppedFile {
  /** Path as dropped or as stored in the zip, e.g. "gerber/F_Cu.gbr" */
  path: string
  bytes: Uint8Array
}

export type QuoteInput =
  | { kind: "circuit_json"; circuitJson: CircuitJson; sourceName: string }
  | { kind: "fabrication_files"; files: FabricationFiles; sourceName: string }

const FABRICATION_FILE = /\.(gbr|g[tb][lpso]|gko|gm1|g\d+|drl|xln|csv)$/i
const CIRCUIT_JSON_FILE = /\.json$/i
const ZIP_FILE = /\.zip$/i

const getFileName = (path: string) => path.split("/").pop() ?? path

/** Replace each zip with the files inside it; macOS metadata is dropped. */
const unpackZips = (droppedFiles: DroppedFile[]): DroppedFile[] =>
  droppedFiles.flatMap((droppedFile) => {
    if (!ZIP_FILE.test(droppedFile.path)) return [droppedFile]
    return Object.entries(unzipSync(droppedFile.bytes))
      .filter(
        ([path, bytes]) =>
          !path.endsWith("/") &&
          !path.startsWith("__MACOSX/") &&
          !getFileName(path).startsWith(".") &&
          bytes.length > 0,
      )
      .map(([path, bytes]) => ({ path, bytes }))
  })

/**
 * Decide what was dropped: a fabrication bundle (Gerbers, drills, BOM and
 * pick-and-place CSVs, loose or zipped) or a Circuit JSON file. A bundle wins
 * when both are present, since it is what JLCPCB receives.
 */
export const readDroppedFiles = (droppedFiles: DroppedFile[]): QuoteInput => {
  const unpackedFiles = unpackZips(droppedFiles)
  const decoder = new TextDecoder()
  const sourceName = droppedFiles
    .map((file) => getFileName(file.path))
    .join(", ")

  const fabricationFiles = unpackedFiles.filter((file) =>
    FABRICATION_FILE.test(file.path),
  )
  if (fabricationFiles.length > 0) {
    const files: FabricationFiles = {}
    for (const file of fabricationFiles) {
      files[getFileName(file.path)] = decoder.decode(file.bytes)
    }
    return { kind: "fabrication_files", files, sourceName }
  }

  const circuitJsonFile = unpackedFiles.find((file) =>
    CIRCUIT_JSON_FILE.test(file.path),
  )
  if (circuitJsonFile) {
    return {
      kind: "circuit_json",
      circuitJson: parseCircuitJson(
        JSON.parse(decoder.decode(circuitJsonFile.bytes)),
      ),
      sourceName,
    }
  }
  throw new Error(
    "Drop a fabrication zip, Gerber and drill files with bom.csv and pick_and_place.csv, or a Circuit JSON file",
  )
}
