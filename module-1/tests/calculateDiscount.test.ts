const consoleLog = jest.spyOn(console, "log").mockImplementation(() => undefined)

const { calculateDiscount, InvalidDiscountInputError } =
    require("../src/index.ts") as typeof import("../src/index.ts")

describe("calculateDiscount", () => {
    afterAll(() => {
        consoleLog.mockRestore()
    })

    describe("happy path", () => {
        it("returns the price after applying the discount percentage", () => {
            expect(calculateDiscount(200, 25)).toBe(150)
        })

        it("applies a fractional discount percentage", () => {
            expect(calculateDiscount(50, 12.5)).toBe(43.75)
        })

        it("applies a discount to a fractional price", () => {
            expect(calculateDiscount(19.99, 15)).toBeCloseTo(16.9915)
        })
    })

    describe("edge cases", () => {
        it("returns the original price when the discount is 0 percent", () => {
            expect(calculateDiscount(80, 0)).toBe(80)
        })

        it("returns zero when the discount is 100 percent", () => {
            expect(calculateDiscount(80, 100)).toBe(0)
        })

        it("returns zero when the price is zero", () => {
            expect(calculateDiscount(0, 40)).toBe(0)
        })

        it("returns zero when both the price and the discount are zero", () => {
            expect(calculateDiscount(0, 0)).toBe(0)
        })

        it("keeps a very large finite price when the discount is 0 percent", () => {
            expect(calculateDiscount(Number.MAX_VALUE, 0)).toBe(Number.MAX_VALUE)
        })

        it("overflows to negative infinity when a huge finite price is discounted", () => {
            expect(calculateDiscount(Number.MAX_VALUE, 50)).toBe(Number.NEGATIVE_INFINITY)
            expect(calculateDiscount(1e308, 10)).toBe(Number.NEGATIVE_INFINITY)
        })

        it("returns the binary floating-point result for a tenth discounted by 10 percent", () => {
            expect(calculateDiscount(0.1, 10)).toBe(0.09000000000000001)
        })
    })

    describe("invalid price", () => {
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
            expect(() => calculateDiscount(Number.NEGATIVE_INFINITY, 10)).toThrow(
                InvalidDiscountInputError,
            )
        })

        it("names the error and reports the price before an invalid discount", () => {
            let caught: unknown

            try {
                calculateDiscount(Number.NaN, Number.NaN)
            } catch (error) {
                caught = error
            }

            expect(caught).toBeInstanceOf(Error)
            expect(caught).toBeInstanceOf(InvalidDiscountInputError)
            expect((caught as InvalidDiscountInputError).name).toBe("InvalidDiscountInputError")
            expect((caught as InvalidDiscountInputError).message).toBe(
                "Price must be a finite number greater than or equal to 0.",
            )
        })
    })

    describe("invalid discount percentage", () => {
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
            expect(() => calculateDiscount(100, Number.POSITIVE_INFINITY)).toThrow(
                InvalidDiscountInputError,
            )
        })
    })

    describe("module load", () => {
        it("mocks console.log and records the sample calculation", () => {
            expect(consoleLog).toHaveBeenCalledWith("calculate: ", 9)
        })
    })
})
