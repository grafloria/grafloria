// Mock for nanoid to avoid ESM import issues in Jest

let counter = 0;

export function nanoid(size: number = 21): string {
  counter++;
  return `test-id-${counter}`.padEnd(size, '0').slice(0, size);
}

export default nanoid;
