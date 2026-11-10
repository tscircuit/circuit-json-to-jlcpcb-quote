import type { z } from "zod"

/**
 * Validate an API answer against its schema. A shape we do not recognise is
 * an error, never "not found".
 */
export const parseApiResponse = <Schema extends z.ZodTypeAny>(response: {
  schema: Schema
  json: unknown
  /** e.g. "JLCPCB's parts library for C25744" */
  source: string
}): z.infer<Schema> => {
  const parsed = response.schema.safeParse(response.json)
  if (!parsed.success) {
    throw new Error(
      `Unexpected answer from ${response.source}: ${parsed.error.message}`,
    )
  }
  return parsed.data
}
