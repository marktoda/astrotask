/**
 * @fileoverview Generic transformation utilities for database <-> API compatibility
 * 
 * This module provides reusable functions for transforming database entities
 * to API-compatible formats. It centralizes the null/undefined transformation
 * logic that was previously duplicated across entity schemas.
 * 
 * @module schemas/transformUtils
 * @since 1.0.0
 */

/**
 * Transform nullable database fields to optional API fields
 * 
 * @param value - Database value (possibly null)
 * @returns API value (possibly undefined)
 */
export function nullToUndefined<T>(value: T | null): T | undefined {
  return value ?? undefined;
}

/**
 * Transform optional API fields to nullable database fields
 * 
 * @param value - API value (possibly undefined)
 * @returns Database value (possibly null)
 */
export function undefinedToNull<T>(value: T | undefined): T | null {
  return value ?? null;
}

/**
 * Transform Date objects to ISO string format for API serialization
 * 
 * @param date - Database Date object
 * @returns ISO string representation
 */
export function dateToIsoString(date: Date): string {
  return date.toISOString();
}

/**
 * Transform nullable database fields in an object to optional API fields
 * 
 * @param obj - Object with potentially nullable fields
 * @param fields - Fields to transform from null to undefined
 * @returns New object with transformed fields
 */
export function transformNullableFields<T extends Record<string, any>>(
  obj: T,
  fields: (keyof T)[]
): T {
  const result = { ...obj };
  for (const field of fields) {
    if (field in result) {
      (result as any)[field] = nullToUndefined(result[field]);
    }
  }
  return result;
}

/**
 * Transform optional API fields in an object to nullable database fields
 * 
 * @param obj - Object with potentially optional fields
 * @param fields - Fields to transform from undefined to null
 * @returns New object with transformed fields
 */
export function transformOptionalFields<T extends Record<string, any>>(
  obj: T,
  fields: (keyof T)[]
): T {
  const result = { ...obj };
  for (const field of fields) {
    if (field in result) {
      (result as any)[field] = undefinedToNull(result[field]);
    }
  }
  return result;
}

/**
 * Transform Date fields in an object to ISO string format
 * 
 * @param obj - Object with potentially Date fields
 * @param fields - Fields to transform from Date to ISO string
 * @returns New object with transformed fields
 */
export function transformDateFields<T extends Record<string, any>>(
  obj: T,
  fields: (keyof T)[]
): T {
  const result = { ...obj };
  for (const field of fields) {
    if (field in result && (result[field] as any) instanceof Date) {
      (result as any)[field] = dateToIsoString(result[field] as Date);
    }
  }
  return result;
}