"use strict";
/**
 * SQL Query Normalizer utility
 *
 * This utility normalizes SQL queries by replacing parameter values with placeholders.
 * It helps in identifying structurally identical queries that might have different
 * parameter values, particularly in IN clauses with varying numbers of parameters.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeQuery = normalizeQuery;
exports.generateNormalizedQueryHash = generateNormalizedQueryHash;
exports.normalizeAndHashQuery = normalizeAndHashQuery;
var crypto_1 = __importDefault(require("crypto"));
var logger_js_1 = require("../utils/logger.js");
/**
 * Normalizes a SQL query by replacing parameter values with generic placeholders.
 * Preserves column names and query structure while normalizing only parameter values.
 *
 * @param query The SQL query to normalize
 * @returns The normalized query with parameter values replaced by placeholders
 */
function normalizeQuery(query) {
    try {
        if (!query || typeof query !== 'string') {
            return '';
        }
        var normalizedQuery = query.trim();
        // Replace IN clauses with multiple parameters with a generic form
        // This handles cases like "IN ($1, $2, $3)" or "IN ($4, $5, $6)"
        normalizedQuery = normalizedQuery.replace(/\bIN\s*\(\s*(\$\d+\s*,\s*)*\$\d+\s*\)/gi, 'IN ($?)');
        
        // After handling specific patterns like IN clauses, replace remaining $n parameters
        normalizedQuery = normalizedQuery.replace(/\$\d+/g, '$?');
        
        // Handle OFFSET $n and LIMIT $n (for clarity, though already replaced by the step above)
        normalizedQuery = normalizedQuery.replace(/\bOFFSET\s+\$\?/gi, 'OFFSET $?');
        normalizedQuery = normalizedQuery.replace(/\bLIMIT\s+\$\?/gi, 'LIMIT $?');
        
        // Replace multiple whitespace with a single space
        normalizedQuery = normalizedQuery.replace(/\s+/g, ' ');
        return normalizedQuery;
    }
    catch (error) {
        logger_js_1.logger.error('Error normalizing query:', error);
        return query; // Return original query if normalization fails
    }
}
/**
 * Generates a hash for the normalized query to use as an identifier.
 *
 * @param normalizedQuery The normalized query to hash
 * @returns A hash string that uniquely identifies the normalized query
 */
function generateNormalizedQueryHash(normalizedQuery) {
    return crypto_1.default.createHash('md5').update(normalizedQuery).digest('hex');
}
/**
 * Normalizes a query and generates a hash for it.
 *
 * @param query The SQL query to normalize and hash
 * @returns An object containing the normalized query and its hash
 */
function normalizeAndHashQuery(query) {
    var normalizedQuery = normalizeQuery(query);
    var normalizedHash = generateNormalizedQueryHash(normalizedQuery);
    return {
        normalizedQuery: normalizedQuery,
        normalizedHash: normalizedHash
    };
}
