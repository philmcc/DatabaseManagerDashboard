import pg from 'pg';
const { Client, Pool } = pg;

import { logger } from "./logger";
import { db } from "@db";
import { SSHTunnel } from "./ssh-tunnel";
import type { SelectInstance, SelectDatabaseConnection } from "@db/schema";

// Map to keep track of active SSH tunnels
const activeTunnels = new Map<string, { tunnel: SSHTunnel; refCount: number }>();

interface ConnectionConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  useSSHTunnel?: boolean;
  sshHost?: string;
  sshPort?: number;
  sshUsername?: string;
  sshPassword?: string;
  sshPrivateKey?: string;
  sshKeyPassphrase?: string;
}

export async function createConnection(config: ConnectionConfig, usePool = false) {
  let tunnel: SSHTunnel | null = null;
  let connectionConfig: any = {
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    ssl: { rejectUnauthorized: false }
  };

  try {
    if (config.useSSHTunnel) {
      logger.info('Setting up SSH tunnel...');
      tunnel = new SSHTunnel({
        sshHost: config.sshHost!,
        sshPort: config.sshPort || 22,
        sshUsername: config.sshUsername!,
        sshPassword: config.sshPassword,
        sshPrivateKey: config.sshPrivateKey,
        sshKeyPassphrase: config.sshKeyPassphrase,
        dbHost: config.host,
        dbPort: config.port
      });

      const localPort = await tunnel.connect();
      logger.info(`SSH tunnel established on port: ${localPort}`);

      // Update connection config to use tunnel
      connectionConfig.host = 'localhost';
      connectionConfig.port = localPort;
    }

    // Create either a Pool or Client based on usePool parameter
    const connection = usePool ? new Pool(connectionConfig) : new Client(connectionConfig);
    
    // Add cleanup method
    const cleanup = async () => {
      await connection.end();
      if (tunnel) {
        tunnel.close();
      }
    };

    return { connection, cleanup };
  } catch (error) {
    if (tunnel) {
      tunnel.close();
    }
    throw error;
  }
}

export async function getInstanceConnection(instanceId: number) {
  const instance = await db.query.instances.findFirst({
    where: (instances, { eq }) => eq(instances.id, instanceId)
  });

  if (!instance) {
    throw new Error('Instance not found');
  }

  return createConnection({
    host: instance.hostname,
    port: instance.port,
    database: instance.defaultDatabaseName || 'postgres',
    user: instance.username,
    password: instance.password,
    useSSHTunnel: instance.useSSHTunnel,
    sshHost: instance.sshHost || undefined,
    sshPort: instance.sshPort,
    sshUsername: instance.sshUsername || undefined,
    sshPassword: instance.sshPassword || undefined,
    sshPrivateKey: instance.sshPrivateKey || undefined,
    sshKeyPassphrase: instance.sshKeyPassphrase || undefined
  });
}

export async function getDatabaseConnection(databaseId: number) {
  const dbConn = await db.query.databaseConnections.findFirst({
    where: (connections, { eq }) => eq(connections.id, databaseId),
    with: {
      instance: true
    }
  });

  if (!dbConn) {
    throw new Error('Database connection not found');
  }

  return createConnection({
    host: dbConn.instance.hostname,
    port: dbConn.instance.port,
    database: dbConn.databaseName,
    user: dbConn.username,
    password: dbConn.password,
    useSSHTunnel: dbConn.useSSHTunnel,
    sshHost: dbConn.sshHost || undefined,
    sshPort: dbConn.sshPort,
    sshUsername: dbConn.sshUsername || undefined,
    sshPassword: dbConn.sshPassword || undefined,
    sshPrivateKey: dbConn.sshPrivateKey || undefined,
    sshKeyPassphrase: dbConn.sshKeyPassphrase || undefined
  });
} 