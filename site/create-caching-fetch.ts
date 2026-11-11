import type { FetchLike } from "../lib/index"

/** Method, URL and body of a request */
type RequestKey = string

/**
 * A fetch that remembers successful answers for the life of the page, so
 * changing an order option re-quotes instantly instead of looking every part
 * up again.
 */
export const createCachingFetch = (fetchJson: FetchLike): FetchLike => {
  const answers = new Map<RequestKey, Awaited<ReturnType<FetchLike>>>()
  return async (url, init) => {
    const requestKey: RequestKey = `${init?.method ?? "GET"} ${url} ${init?.body ?? ""}`
    const cachedAnswer = answers.get(requestKey)
    if (cachedAnswer) return cachedAnswer
    const response = await fetchJson(url, init)
    if (response.status >= 500 || response.status === 429) return response
    const json = await response.json()
    const answer = {
      ok: response.ok,
      status: response.status,
      json: async () => json,
    }
    answers.set(requestKey, answer)
    return answer
  }
}
