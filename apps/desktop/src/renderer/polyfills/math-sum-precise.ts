type MathWithSumPrecise = Math & {
  sumPrecise?: (items: Iterable<number>) => number
}

const mathWithSumPrecise = Math as MathWithSumPrecise

if (typeof mathWithSumPrecise.sumPrecise !== 'function') {
  Object.defineProperty(Math, 'sumPrecise', {
    value: function sumPrecise(items: Iterable<number>): number {
      let sum = 0
      let compensation = 0
      let hasFiniteValue = false
      let hasPositiveInfinity = false
      let hasNegativeInfinity = false
      let hasPositiveZero = false

      for (const value of items) {
        if (typeof value !== 'number') {
          throw new TypeError('Math.sumPrecise expects numbers.')
        }

        if (Number.isNaN(value)) {
          return Number.NaN
        }

        if (value === Infinity) {
          hasPositiveInfinity = true
          continue
        }

        if (value === -Infinity) {
          hasNegativeInfinity = true
          continue
        }

        if (value === 0) {
          hasPositiveZero ||= Object.is(value, 0)
          continue
        }

        hasFiniteValue = true
        const adjustedValue = value - compensation
        const nextSum = sum + adjustedValue
        compensation = (nextSum - sum) - adjustedValue
        sum = nextSum
      }

      if (hasPositiveInfinity && hasNegativeInfinity) {
        return Number.NaN
      }

      if (hasPositiveInfinity) {
        return Infinity
      }

      if (hasNegativeInfinity) {
        return -Infinity
      }

      if (hasFiniteValue) {
        return sum
      }

      return hasPositiveZero ? 0 : -0
    },
    configurable: true,
    writable: true
  })
}
