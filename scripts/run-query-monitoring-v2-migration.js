/**
 * Run Query Monitoring V2 Migration
 * 
 * This script runs the migration to upgrade the query monitoring system
 * to use the new schema with normalized and collected queries.
 */

import { migrateQueryMonitoringV2 } from '../db/migrations/query-monitoring-v2.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

console.log('=== Query Monitoring V2 Migration ===');
console.log('This will update the database schema to use the new query monitoring approach');
console.log('with normalized queries and improved statistics tracking.\n');

// Run the migration
migrateQueryMonitoringV2()
  .then(() => {
    console.log('\nMigration completed successfully!');
    console.log('You can now use the new query monitoring system.');
    process.exit(0);
  })
  .catch(error => {
    console.error('\nMigration failed:', error);
    process.exit(1);
  }); 