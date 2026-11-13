/** 0.08625 -> "8.625%", 0.35 -> "35%" */
export const formatPercent = (rate: number) =>
  `${Number((rate * 100).toFixed(3))}%`
