import { fabricationFileRules } from "../jlcpcb-price-table"
import type { DrillHit } from "./parse-excellon-drill"

/** Distance from a point to a hole's centre, or to a slot's centre line */
const getDistanceToHit = (
  point: { x: number; y: number },
  hit: DrillHit,
): number => {
  const end = hit.slotEnd ?? hit
  const dx = end.x - hit.x
  const dy = end.y - hit.y
  const lengthSquared = dx * dx + dy * dy
  const along =
    lengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            ((point.x - hit.x) * dx + (point.y - hit.y) * dy) / lengthSquared,
          ),
        )
  return Math.hypot(
    point.x - (hit.x + along * dx),
    point.y - (hit.y + along * dy),
  )
}

/** Whether a pad or paste opening is centred on a drilled hole or slot */
export const isOnDrillHit = (
  point: { x: number; y: number },
  hits: DrillHit[],
): boolean =>
  hits.some(
    (hit) =>
      getDistanceToHit(point, hit) <=
      fabricationFileRules.viaPadPositionToleranceMm,
  )
