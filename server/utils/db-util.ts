import { db } from '@/db';
import { getDatabaseConnection } from '@/lib/database';
import { logger } from './logger';

export async function getQueryStatistics(databaseId: number) {
  try {
    const connection = await getDatabaseConnection(databaseId);
    // Common query statistics function
    // ...
  } catch (error) {
    logger.error(`Database statistics error: ${error.message}`, { databaseId });
    throw new Error(`Failed to get database statistics: ${error.message}`);
  }
}

export async function checkPgStatStatementsExtension(databaseId: number) {
  try {
    const connection = await getDatabaseConnection(databaseId);
    const result = await connection.query(
      "SELECT * FROM pg_extension WHERE extname = 'pg_stat_statements'"
    );
    return result.rows.length > 0;
  } catch (error) {
    logger.error(`Extension check error: ${error.message}`, { databaseId });
    throw new Error(`Failed to check pg_stat_statements: ${error.message}`);
  }
} 