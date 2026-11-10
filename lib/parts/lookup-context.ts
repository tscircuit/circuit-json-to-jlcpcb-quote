import type { FetchLike, PartSource } from "../types"

/** Shared by every part lookup */
export interface LookupContext {
  fetch: FetchLike
  jlcsearchBaseUrl: string
  partSource: PartSource
}
