// ID generation utilities

import { nanoid } from 'nanoid';
import { v4 as uuidv4 } from 'uuid';

/**
 * Generate a short unique ID (12 characters)
 * Used for internal references
 */
export function generateId(): string {
  return nanoid(12);
}

/**
 * Generate a UUID
 * Used for persistent identifiers
 */
export function generateUUID(): string {
  return uuidv4();
}

/**
 * Generate a prefixed ID
 */
export function generatePrefixedId(prefix: string): string {
  return `${prefix}_${nanoid(8)}`;
}

/**
 * Validate if string is a valid ID format
 */
export function isValidId(id: string): boolean {
  return typeof id === 'string' && id.length > 0;
}

/**
 * Validate if string is a valid UUID format
 */
export function isValidUUID(uuid: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}
