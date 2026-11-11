import type { FetchLike, PartLookupProgress } from "../types"

/** Shared by every part lookup */
export interface LookupContext {
  fetch: FetchLike
  jlcsearchBaseUrl: string
  onProgress?: (progress: PartLookupProgress) => void
}
