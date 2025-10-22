// Mock for nanoid to avoid ESM import issues in Jest

let counter = 0;

export function nanoid(size: number = 21): string {
  counter++;
  // Use base36 encoding for compact representation
  // This allows us to fit large counters in fewer characters
  const counterStr = counter.toString(36).padStart(8, '0');
  const id = `test-${counterStr}`;

  // Ensure we don't truncate the counter by padding at the end only
  if (id.length < size) {
    return id.padEnd(size, '0');
  }
  return id;
}

// Export reset function for tests that need to control ID generation
export function resetCounter(): void {
  counter = 0;
}

export default nanoid;
