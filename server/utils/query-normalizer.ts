/**
 * SQL Query Normalizer utility
 * 
 * This utility normalizes SQL queries by replacing literal values with placeholders.
 * It helps in identifying structurally identical queries that might have different 
 * parameter values, particularly in IN clauses with varying numbers of parameters.
 */

import crypto from 'crypto';
import { logger } from '../utils/logger.js';

/**
 * Normalizes a SQL query by replacing literal values with placeholders.
 * 
 * @param query The SQL query to normalize
 * @returns The normalized query with literals replaced by placeholders
 */
export function normalizeQuery(query: string): string {
  try {
    if (!query || typeof query !== 'string') {
      return '';
    }

    let normalizedQuery = query.trim();

    // Replace quoted strings with a placeholder
    normalizedQuery = normalizedQuery.replace(/'[^']*'/g, "'?'");
    normalizedQuery = normalizedQuery.replace(/"[^"]*"/g, '"?"');

    // Replace numbers with a placeholder
    normalizedQuery = normalizedQuery.replace(/\b\d+\b/g, '?');

    // Replace IN clauses with a single parameter
    // This handles cases like "IN (1, 2, 3)" or "IN ('a', 'b', 'c')"
    normalizedQuery = normalizedQuery.replace(/\bIN\s*\([^)]+\)/gi, 'IN (?)');

    // Replace multiple whitespace with a single space
    normalizedQuery = normalizedQuery.replace(/\s+/g, ' ');

    return normalizedQuery;
  } catch (error) {
    logger.error('Error normalizing query:', error);
    return query; // Return original query if normalization fails
  }
}

/**
 * Generates a hash for the normalized query to use as an identifier.
 * 
 * @param normalizedQuery The normalized query to hash
 * @returns A hash string that uniquely identifies the normalized query
 */
export function generateNormalizedQueryHash(normalizedQuery: string): string {
  return crypto.createHash('md5').update(normalizedQuery).digest('hex');
}

/**
 * Normalizes a query and generates a hash for it.
 * 
 * @param query The SQL query to normalize and hash
 * @returns An object containing the normalized query and its hash
 */
export function normalizeAndHashQuery(query: string): { 
  normalizedQuery: string; 
  normalizedHash: string;
} {
  const normalizedQuery = normalizeQuery(query);
  const normalizedHash = generateNormalizedQueryHash(normalizedQuery);
  
  return {
    normalizedQuery,
    normalizedHash
  };
} 