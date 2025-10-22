// Mock for uuid to avoid ESM import issues in Jest

let counter = 0;

export function v4(): string {
  counter++;
  const hex = counter.toString(16).padStart(8, '0');
  return `${hex}-0000-4000-a000-${hex}00000000`.slice(0, 36);
}

export default { v4 };
