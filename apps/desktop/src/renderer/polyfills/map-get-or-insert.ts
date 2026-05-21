type MapWithInsert<TKey, TValue> = Map<TKey, TValue> & {
  getOrInsert?: (key: TKey, value: TValue) => TValue
  getOrInsertComputed?: (key: TKey, callback: (key: TKey) => TValue) => TValue
}

type WeakMapWithInsert<TKey extends WeakKey, TValue> = WeakMap<TKey, TValue> & {
  getOrInsert?: (key: TKey, value: TValue) => TValue
  getOrInsertComputed?: (key: TKey, callback: (key: TKey) => TValue) => TValue
}

const mapPrototype = Map.prototype as MapWithInsert<unknown, unknown>

if (typeof mapPrototype.getOrInsert !== 'function') {
  Object.defineProperty(Map.prototype, 'getOrInsert', {
    value: function getOrInsert<TKey, TValue>(this: Map<TKey, TValue>, key: TKey, value: TValue): TValue {
      if (this.has(key)) {
        return this.get(key) as TValue
      }

      this.set(key, value)
      return value
    },
    configurable: true,
    writable: true
  })
}

if (typeof mapPrototype.getOrInsertComputed !== 'function') {
  Object.defineProperty(Map.prototype, 'getOrInsertComputed', {
    value: function getOrInsertComputed<TKey, TValue>(
      this: Map<TKey, TValue>,
      key: TKey,
      callback: (key: TKey) => TValue
    ): TValue {
      if (this.has(key)) {
        return this.get(key) as TValue
      }

      const value = callback(key)
      this.set(key, value)
      return value
    },
    configurable: true,
    writable: true
  })
}

const weakMapPrototype = WeakMap.prototype as WeakMapWithInsert<WeakKey, unknown>

if (typeof weakMapPrototype.getOrInsert !== 'function') {
  Object.defineProperty(WeakMap.prototype, 'getOrInsert', {
    value: function getOrInsert<TKey extends WeakKey, TValue>(
      this: WeakMap<TKey, TValue>,
      key: TKey,
      value: TValue
    ): TValue {
      if (this.has(key)) {
        return this.get(key) as TValue
      }

      this.set(key, value)
      return value
    },
    configurable: true,
    writable: true
  })
}

if (typeof weakMapPrototype.getOrInsertComputed !== 'function') {
  Object.defineProperty(WeakMap.prototype, 'getOrInsertComputed', {
    value: function getOrInsertComputed<TKey extends WeakKey, TValue>(
      this: WeakMap<TKey, TValue>,
      key: TKey,
      callback: (key: TKey) => TValue
    ): TValue {
      if (this.has(key)) {
        return this.get(key) as TValue
      }

      const value = callback(key)
      this.set(key, value)
      return value
    },
    configurable: true,
    writable: true
  })
}
