/**
 * Container ID Generator for foreignObject elements
 *
 * Generates unique container IDs that Angular components can target
 * for rendering rich HTML content inside SVG foreignObject elements.
 *
 * @remarks
 * - IDs follow the format: `fo-{nodeId}-{counter}`
 * - Counter is globally incremented for uniqueness
 * - O(1) time complexity for all operations
 *
 * @example
 * ```typescript
 * const id1 = ContainerIdGenerator.generate('node-1'); // 'fo-node-1-1'
 * const id2 = ContainerIdGenerator.generate('node-1'); // 'fo-node-1-2'
 *
 * ContainerIdGenerator.isContainerId('fo-node-1-1'); // true
 * ContainerIdGenerator.getNodeId('fo-node-1-1'); // 'node-1'
 * ```
 *
 * @packageDocumentation
 */

/**
 * Generate unique container IDs for foreignObject elements
 *
 * This class provides static methods to generate and validate container IDs
 * used to link SVG foreignObject elements with their Angular component content.
 */
export class ContainerIdGenerator {
  /**
   * Global counter for generating unique IDs
   * @internal
   */
  private static counter = 0;

  /**
   * Generate a unique container ID for a foreignObject element
   *
   * @param nodeId - The node ID to include in the container ID
   * @returns A unique container ID in the format `fo-{nodeId}-{counter}`
   *
   * @example
   * ```typescript
   * const id = ContainerIdGenerator.generate('node-123');
   * // Returns: 'fo-node-123-1'
   * ```
   */
  static generate(nodeId: string): string {
    return `fo-${nodeId}-${++this.counter}`;
  }

  /**
   * Check if a given ID is a valid container ID
   *
   * Container IDs must start with 'fo-' prefix.
   * This is a lightweight check that only validates the prefix.
   *
   * @param id - The ID to check
   * @returns True if the ID is a container ID, false otherwise
   *
   * @example
   * ```typescript
   * ContainerIdGenerator.isContainerId('fo-node-1-1'); // true
   * ContainerIdGenerator.isContainerId('node-1'); // false
   * ```
   */
  static isContainerId(id: string): boolean {
    // Must match the full documented format `fo-{nodeId}-{counter}` — a bare
    // 'fo-' prefix accepted arbitrary ids like 'fo-invalid'
    return /^fo-.+-\d+$/.test(id);
  }

  /**
   * Extract the node ID from a container ID
   *
   * Parses a container ID and returns the original node ID.
   * Container IDs must follow the format: `fo-{nodeId}-{counter}`
   *
   * @param containerId - The container ID to parse
   * @returns The node ID if valid, null otherwise
   *
   * @example
   * ```typescript
   * ContainerIdGenerator.getNodeId('fo-node-123-5'); // 'node-123'
   * ContainerIdGenerator.getNodeId('invalid'); // null
   * ```
   */
  static getNodeId(containerId: string): string | null {
    const match = containerId.match(/^fo-(.+)-\d+$/);
    return match ? match[1] : null;
  }

  /**
   * Reset the internal counter to zero
   *
   * This method is primarily for testing purposes to ensure
   * predictable ID generation in test suites.
   *
   * @example
   * ```typescript
   * ContainerIdGenerator.reset();
   * const id = ContainerIdGenerator.generate('node-1');
   * // Returns: 'fo-node-1-1' (counter starts at 1)
   * ```
   */
  static reset(): void {
    this.counter = 0;
  }
}
