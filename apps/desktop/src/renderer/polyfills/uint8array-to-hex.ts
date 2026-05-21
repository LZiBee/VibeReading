type Uint8ArrayWithToHex = Uint8Array & {
  toHex?: () => string
}

const uint8ArrayPrototype = Uint8Array.prototype as Uint8ArrayWithToHex

if (typeof uint8ArrayPrototype.toHex !== 'function') {
  Object.defineProperty(Uint8Array.prototype, 'toHex', {
    value: function toHex(this: Uint8Array): string {
      let output = ''

      for (const byte of this) {
        output += byte.toString(16).padStart(2, '0')
      }

      return output
    },
    configurable: true,
    writable: true
  })
}
