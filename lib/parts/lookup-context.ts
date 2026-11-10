import type { FetchLike } from "../types"

/** Shared by every part lookup */
export interface LookupContext {
  fetch: FetchLike
  jlcsearchBaseUrl: string
}
