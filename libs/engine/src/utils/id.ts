// ID generation utilities

import { nanoid } from 'nanoid';
import { v4 as uuidv4 } from 'uuid';
import { deterministicPrefix, nextDeterministicSeq } from './deterministic';

/**
 * Generate a short unique ID (12 characters)
 * Used for internal references
 */
export function generateId(): string {
  // Inside runDeterministic: a counter, never crypto (see deterministic.ts).
  const seq = nextDeterministicSeq();
  if (seq !== null) return `${deterministicPrefix()}${seq.toString(36).padStart(11, '0')}`;
  return nanoid(12);
}

/**
 * Generate a UUID
 * Used for persistent identifiers
 */
export function generateUUID(): string {
  const seq = nextDeterministicSeq();
  if (seq !== null) return `00000000-0000-4000-8000-${seq.toString(16).padStart(12, '0')}`;
  return uuidv4();
}

/**
 * Generate a prefixed ID
 */
export function generatePrefixedId(prefix: string): string {
  const seq = nextDeterministicSeq();
  if (seq !== null) return `${prefix}_${seq.toString(36).padStart(8, '0')}`;
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
