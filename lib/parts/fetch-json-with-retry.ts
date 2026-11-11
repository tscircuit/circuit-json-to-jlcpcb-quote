import { lookupRetry } from "../jlcpcb-price-table"
import type { LookupContext } from "./lookup-context"

const isOverloaded = (status: number) => status === 429 || status >= 500

const wait = (delayMs: number) =>
  new Promise((resolve) => setTimeout(resolve, delayMs))

/**
 * Fetch JSON, retrying network errors and overload responses (429, 5xx).
 * Any other status is returned to the caller. Throws once the attempts are
 * used up, so a lookup never silently comes back empty.
 */
export const fetchJsonWithRetry = async (
  request: { url: string; method?: "GET" | "POST"; jsonBody?: object },
  ctx: LookupContext,
): Promise<{ status: number; json: unknown }> => {
  let lastFailure = ""
  for (let attempt = 0; attempt < lookupRetry.attempts; attempt++) {
    if (attempt > 0) await wait(lookupRetry.delayMsPerAttempt * attempt)
    try {
      const response = await ctx.fetch(request.url, {
        method: request.method ?? "GET",
        ...(request.jsonBody
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(request.jsonBody),
            }
          : {}),
      })
      if (isOverloaded(response.status)) {
        lastFailure = `HTTP ${response.status}`
        continue
      }
      return { status: response.status, json: await response.json() }
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error)
    }
  }
  throw new Error(
    `${request.url} failed after ${lookupRetry.attempts} attempts: ${lastFailure}`,
  )
}
