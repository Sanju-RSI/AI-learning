import { calculateDiscount, InvalidDiscountInputError } from "../src/index.ts"

describe("calculateDiscount", () => {
    it("returns the price after applying the discount percentage", () => {
        expect(calculateDiscount(200, 25)).toBe(150)
    })

    it("returns the original price when the discount is 0 percent", () => {
        expect(calculateDiscount(80, 0)).toBe(80)
    })

    it("returns zero when the discount is 100 percent", () => {
        expect(calculateDiscount(80, 100)).toBe(0)
    })

    it("returns zero when the price is zero", () => {
        expect(calculateDiscount(0, 40)).toBe(0)
    })

    it("applies a fractional discount percentage", () => {
        expect(calculateDiscount(50, 12.5)).toBe(43.75)
    })

    it("rejects a negative price", () => {
        expect(() => calculateDiscount(-1, 10)).toThrow(InvalidDiscountInputError)
        expect(() => calculateDiscount(-1, 10)).toThrow(
            "Price must be a finite number greater than or equal to 0.",
        )
    })

    it("rejects a non-finite price", () => {
        expect(() => calculateDiscount(Number.NaN, 10)).toThrow(InvalidDiscountInputError)
        expect(() => calculateDiscount(Number.POSITIVE_INFINITY, 10)).toThrow(
            InvalidDiscountInputError,
        )
    })

    it("rejects a discount percentage below 0", () => {
        expect(() => calculateDiscount(100, -0.1)).toThrow(InvalidDiscountInputError)
        expect(() => calculateDiscount(100, -0.1)).toThrow(
            "Discount percentage must be a finite number between 0 and 100.",
        )
    })

    it("rejects a discount percentage above 100", () => {
        expect(() => calculateDiscount(100, 100.1)).toThrow(InvalidDiscountInputError)
    })

    it("rejects a non-finite discount percentage", () => {
        expect(() => calculateDiscount(100, Number.NaN)).toThrow(InvalidDiscountInputError)
        expect(() => calculateDiscount(100, Number.NEGATIVE_INFINITY)).toThrow(
            InvalidDiscountInputError,
        )
    })
})
