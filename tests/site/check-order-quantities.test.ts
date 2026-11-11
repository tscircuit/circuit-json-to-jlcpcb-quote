import { expect, test } from "bun:test"
import { checkOrderQuantities } from "site/check-order-quantities"

const check = (quantityText: string, assembledQuantityText: string) =>
  checkOrderQuantities({
    quantityText,
    assembledQuantityText,
    isAssembled: true,
  })

test("assembled boards may be fewer than PCBs, never more", () => {
  expect(check("5", "2")).toBeNull()
  expect(check("5", "5")).toBeNull()
  expect(check("10", "3")).toBeNull()
  expect(check("5", "6")).toBe(
    "Assembled boards (6) cannot be more than the PCB quantity (5).",
  )
})

test("quantities must be whole numbers of at least 1", () => {
  expect(check("0", "1")).toBe(
    "PCB quantity must be a whole number of at least 1.",
  )
  expect(check("", "1")).toBe(
    "PCB quantity must be a whole number of at least 1.",
  )
  expect(check("5", "2.5")).toBe(
    "Assembled boards must be a whole number of at least 1.",
  )
})

test("the assembled count is ignored without assembly", () => {
  expect(
    checkOrderQuantities({
      quantityText: "5",
      assembledQuantityText: "9",
      isAssembled: false,
    }),
  ).toBeNull()
})
