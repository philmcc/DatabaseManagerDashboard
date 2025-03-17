/**
 * Test Query Normalization
 * 
 * This script tests the query normalization implementation with some example queries.
 */

// Local implementation of the normalizeQuery function without dependencies
function normalizeQuery(query) {
  try {
    if (!query || typeof query !== 'string') {
      return '';
    }

    let normalizedQuery = query.trim();

    // Replace IN clauses with multiple parameters with a generic form
    // This handles cases like "IN ($1, $2, $3)" or "IN ($4, $5, $6)"
    normalizedQuery = normalizedQuery.replace(/\bIN\s*\(\s*(\$\d+\s*,\s*)*\$\d+\s*\)/gi, 'IN ($?)');

    // After handling specific patterns like IN clauses, replace remaining $n parameters
    normalizedQuery = normalizedQuery.replace(/\$\d+/g, '$?');

    // Handle OFFSET $n and LIMIT $n
    normalizedQuery = normalizedQuery.replace(/\bOFFSET\s+\$\?/gi, 'OFFSET $?');
    normalizedQuery = normalizedQuery.replace(/\bLIMIT\s+\$\?/gi, 'LIMIT $?');

    // Replace multiple whitespace with a single space
    normalizedQuery = normalizedQuery.replace(/\s+/g, ' ');

    return normalizedQuery;
  } catch (error) {
    console.error('Error normalizing query:', error);
    return query; // Return original query if normalization fails
  }
}

// Test queries
const testQueries = [
  // Original query from the screenshot
  `SELECT "public"."core_media"."id", "public"."core_media"."uuid", "public"."core_media"."created_at", "public"."core_media"."updated_at", "public"."core_media"."deleted_at", "public"."core_media"."blurred_preview_bucket_key", "public"."core_media"."bucket_key", "public"."core_media"."caption", "public"."core_media"."deleted_from_vault_at", "public"."core_media"."description", "public"."core_media"."error_reason", "public"."core_media"."external_id", "public"."core_media"."external_provider_text", "public"."core_media"."filename", "public"."core_media"."has_celebrity", "public"."core_media"."has_csam", "public"."core_media"."has_deepfake", "public"."core_media"."has_nudity", "public"."core_media"."has_underage", "public"."core_media"."height", "public"."core_media"."is_ai_generated", "public"."core_media"."length_ms", "public"."core_media"."media_type", "public"."core_media"."moderation_passed_at", "public"."core_media"."moderation_people_count", "public"."core_media"."moderation_people_count_at", "public"."core_media"."name", "public"."core_media"."reprocess_failed_at", "public"."core_media"."reprocessed_at", "public"."core_media"."status", "public"."core_media"."width", "public"."core_media"."owner_id", "public"."core_media"."ai_lora_fine_tune_operation_id", "public"."core_media"."ai_image_generation_id" FROM "public"."core_media" WHERE "public"."core_media"."id" IN ($1) OFFSET $2`,
  
  // Test with multiple parameters in IN clause
  `SELECT * FROM users WHERE id IN ($1, $2, $3) LIMIT $4`,
  
  // Test with various parameter formats
  `SELECT * FROM products WHERE category = $1 AND price > $2 ORDER BY name LIMIT $3 OFFSET $4`,
  
  // Test with JOIN and multiple tables
  `SELECT o.id, o.created_at, u.name FROM orders o JOIN users u ON o.user_id = u.id WHERE o.status = $1 AND u.active = $2`,
  
  // Test with NULL checks
  `SELECT * FROM posts WHERE author_id = $1 OR (published_at IS NOT NULL AND category_id = $2)`,
  
  // Test with multiple IN clauses
  `SELECT * FROM products WHERE category_id IN ($1, $2) AND tag_id IN ($3, $4, $5)`,
  
  // Test with subquery containing parameters
  `SELECT * FROM orders WHERE customer_id = $1 AND product_id IN (SELECT product_id FROM inventory WHERE quantity > $2)`
];

// Run tests
console.log('=== Query Normalization Test ===\n');

testQueries.forEach((query, index) => {
  const normalizedQuery = normalizeQuery(query);
  
  console.log(`Test Query ${index + 1}:`);
  console.log('Original:');
  console.log(query);
  console.log('\nNormalized:');
  console.log(normalizedQuery);
  console.log('\n' + '-'.repeat(80) + '\n');
});

console.log('Test completed!'); 