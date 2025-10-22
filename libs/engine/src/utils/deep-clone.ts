// Deep clone utility

/**
 * Deep clone an object with circular reference handling
 * Handles dates, arrays, maps, sets, plain objects, and circular references
 */
export function deepClone<T>(value: T, visited: WeakMap<any, any> = new WeakMap()): T {
  // Primitives and null/undefined
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value !== 'object') {
    return value;
  }

  // Check if we've already cloned this object (circular reference)
  if (visited.has(value)) {
    return visited.get(value);
  }

  // Date objects
  if (value instanceof Date) {
    return new Date(value.getTime()) as T;
  }

  // RegExp objects
  if (value instanceof RegExp) {
    return new RegExp(value.source, value.flags) as T;
  }

  // Class instances (not plain objects) - return as-is to avoid breaking them
  if (value.constructor && value.constructor !== Object && value.constructor !== Array) {
    // Check if it's a Map, Set, or Date (which we want to clone)
    if (!(value instanceof Map) && !(value instanceof Set) && !(value instanceof Date) && !(value instanceof RegExp)) {
      return value; // Return class instances as-is
    }
  }

  // Arrays
  if (Array.isArray(value)) {
    const cloned: any[] = [];
    visited.set(value, cloned); // Register BEFORE recursing to handle circular refs

    for (let i = 0; i < value.length; i++) {
      cloned[i] = deepClone(value[i], visited);
    }

    return cloned as T;
  }

  // Maps
  if (value instanceof Map) {
    const cloned = new Map();
    visited.set(value, cloned); // Register BEFORE recursing

    value.forEach((val, key) => {
      cloned.set(deepClone(key, visited), deepClone(val, visited));
    });

    return cloned as T;
  }

  // Sets
  if (value instanceof Set) {
    const cloned = new Set();
    visited.set(value, cloned); // Register BEFORE recursing

    value.forEach((val) => {
      cloned.add(deepClone(val, visited));
    });

    return cloned as T;
  }

  // Plain objects
  const cloned: any = {};
  visited.set(value, cloned); // Register BEFORE recursing to handle circular refs

  for (const key in value) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      cloned[key] = deepClone((value as any)[key], visited);
    }
  }

  return cloned as T;
}

/**
 * Check if two values are deeply equal
 */
export function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;

  if (a === null || a === undefined || b === null || b === undefined) {
    return a === b;
  }

  if (typeof a !== 'object' || typeof b !== 'object') {
    return a === b;
  }

  if (a.constructor !== b.constructor) {
    return false;
  }

  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    return a.every((item, index) => deepEqual(item, b[index]));
  }

  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) return false;
    for (const [key, value] of a) {
      if (!b.has(key) || !deepEqual(value, b.get(key))) {
        return false;
      }
    }
    return true;
  }

  if (a instanceof Set && b instanceof Set) {
    if (a.size !== b.size) return false;
    for (const value of a) {
      if (!b.has(value)) return false;
    }
    return true;
  }

  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }

  // Plain objects
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) return false;

  return keysA.every((key) => deepEqual(a[key], b[key]));
}
