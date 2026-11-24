
function calculate(a: number, b: number){
    return a + b
}

export class InvalidDiscountInputError extends Error {
    constructor(message: string) {
        super(message)
        this.name = "InvalidDiscountInputError"
    }
}

function validatePrice(price: number): void {
    if (!Number.isFinite(price) || price < 0) {
        throw new InvalidDiscountInputError(
            "Price must be a finite number greater than or equal to 0.",
        )
    }
}

function validateDiscountPercentage(discountPercentage: number): void {
    if (
        !Number.isFinite(discountPercentage) ||
        discountPercentage < 0 ||
        discountPercentage > 100
    ) {
        throw new InvalidDiscountInputError(
            "Discount percentage must be a finite number between 0 and 100.",
        )
    }
}

export function calculateDiscount(price: number, discountPercentage: number): number {
    validatePrice(price)
    validateDiscountPercentage(discountPercentage)

    const discountAmount = (price * discountPercentage) / 100
    const discountedPrice = price - discountAmount

    return discountedPrice
}

const result = calculate(4,5)

console.log("calculate: ", result)