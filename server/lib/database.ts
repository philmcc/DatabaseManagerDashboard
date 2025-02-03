import { logger } from "@/lib/logger";
import { db } from "@/db";
import { pg } from "@/lib/pg";

export async function getDatabaseConnection(databaseId: string) {
  try {
    logger.info(`Getting database connection details for ID: ${databaseId}`);
    
    // Get database connection info from your database
    const dbConnection = await db.query.databaseConnections.findFirst({
      where: (connections, { eq }) => eq(connections.id, parseInt(databaseId)),
      with: {
        instance: true
      }
    });

    if (!dbConnection) {
      logger.error(`No database found with ID ${databaseId}`);
      throw new Error('Database not found');
    }

    logger.info('Creating connection pool...');
    // Create a connection pool for the database
    const pool = new pg.Pool({
      host: dbConnection.instance.hostname,
      port: dbConnection.instance.port,
      database: dbConnection.databaseName,
      user: dbConnection.username,
      password: dbConnection.password,
      ssl: dbConnection.useSSL ? {
        rejectUnauthorized: false
      } : undefined
    });

    // Test the connection
    logger.info('Testing connection...');
    await pool.query('SELECT 1');
    logger.info('Connection successful');

    return pool;
  } catch (error) {
    logger.error('Error getting database connection:', error);
    throw error;
  }
} 