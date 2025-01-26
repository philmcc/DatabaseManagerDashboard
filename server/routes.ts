import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { db } from "@db";
import { users, databaseConnections, tags, databaseTags, databaseOperationLogs, databaseMetrics, clusters, instances } from "@db/schema";
import { eq, and, ne } from "drizzle-orm";
import pkg from 'pg';
const { Client } = pkg;
import { sql } from 'drizzle-orm';

export function registerRoutes(app: Express): Server {
  setupAuth(app);

  // Profile update endpoint (existing)
  app.patch("/api/user/profile", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const { fullName, bio, theme } = req.body;
      const userId = req.user?.id;

      const [updatedUser] = await db
        .update(users)
        .set({
          fullName,
          bio,
          theme,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId))
        .returning();

      res.json(updatedUser);
    } catch (error) {
      console.error("Profile update error:", error);
      res.status(500).send("Error updating profile");
    }
  });

  // Database Management Endpoints
  app.get("/api/databases", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const userDatabases = await db.query.databaseConnections.findMany({
        where: eq(databaseConnections.userId, req.user.id),
        with: {
          tags: {
            with: {
              tag: true,
            },
          },
        },
      });

      res.json(userDatabases);
    } catch (error) {
      console.error("Database fetch error:", error);
      res.status(500).send("Error fetching databases");
    }
  });

  app.get("/api/databases/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const { id } = req.params;
      const database = await db.query.databaseConnections.findFirst({
        where: and(
          eq(databaseConnections.id, parseInt(id)),
          eq(databaseConnections.userId, req.user.id)
        ),
        with: {
          tags: {
            with: {
              tag: true,
            },
          },
        },
      });

      if (!database) {
        return res.status(404).send("Database not found");
      }

      res.json(database);
    } catch (error) {
      console.error("Database fetch error:", error);
      res.status(500).send("Error fetching database");
    }
  });

  app.post("/api/databases", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const { name, instanceId, username, password, databaseName, tags: tagIds } = req.body;

      // Get instance details
      const [instance] = await db
        .select()
        .from(instances)
        .where(
          and(
            eq(instances.id, instanceId),
            eq(instances.userId, req.user.id)
          )
        )
        .limit(1);

      if (!instance) {
        return res.status(404).json({
          message: "Instance not found",
        });
      }

      // Test connection first using instance details
      const client = new Client({
        host: instance.hostname,
        port: instance.port,
        user: username,
        password,
        database: databaseName,
      });

      try {
        await client.connect();
        await client.end();
      } catch (error: any) {
        // Log failed connection attempt
        await db.insert(databaseOperationLogs).values({
          userId: req.user.id,
          operationType: 'create',
          operationResult: 'failure',
          details: {
            error: error.message,
            connectionDetails: { name, instanceId, username, databaseName }
          },
        });

        return res.status(400).json({
          message: "Failed to connect to database",
          error: error.message,
        });
      }

      // If connection test passed, save the database
      const [newDatabase] = await db
        .insert(databaseConnections)
        .values({
          name,
          instanceId,
          username,
          password,
          databaseName,
          userId: req.user.id,
        })
        .returning();

      // Add tags if provided
      if (tagIds && tagIds.length > 0) {
        await db.insert(databaseTags).values(
          tagIds.map((tagId: number) => ({
            databaseId: newDatabase.id,
            tagId,
          }))
        );
      }

      // Log successful creation
      await db.insert(databaseOperationLogs).values({
        databaseId: newDatabase.id,
        userId: req.user.id,
        operationType: 'create',
        operationResult: 'success',
        details: {
          name: newDatabase.name,
          instanceId: newDatabase.instanceId,
          databaseName: newDatabase.databaseName,
        },
      });

      res.status(201).json(newDatabase);
    } catch (error) {
      console.error("Database creation error:", error);
      res.status(500).send("Error creating database connection");
    }
  });

  app.patch("/api/databases/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const { id } = req.params;
      const { name, instanceId, username, password, databaseName, tags: tagIds } = req.body;

      // Get existing database details before update
      const [existingDatabase] = await db
        .select()
        .from(databaseConnections)
        .where(
          and(
            eq(databaseConnections.id, parseInt(id)),
            eq(databaseConnections.userId, req.user.id)
          )
        )
        .limit(1);

      if (!existingDatabase) {
        return res.status(404).send("Database not found");
      }

      // Get instance details
      const [instance] = await db
        .select()
        .from(instances)
        .where(
          and(
            eq(instances.id, instanceId),
            eq(instances.userId, req.user.id)
          )
        )
        .limit(1);

      if (!instance) {
        return res.status(404).json({
          message: "Instance not found",
        });
      }

      // Get existing tags
      const existingTags = await db
        .select()
        .from(databaseTags)
        .where(eq(databaseTags.databaseId, parseInt(id)));

      const existingTagIds = existingTags.map(t => t.tagId);
      const newTagIds = tagIds || [];

      // Test connection first using instance details
      const client = new Client({
        host: instance.hostname,
        port: instance.port,
        user: username,
        password,
        database: databaseName,
      });

      try {
        await client.connect();
        await client.end();
      } catch (error: any) {
        // Log failed update attempt
        await db.insert(databaseOperationLogs).values({
          databaseId: parseInt(id),
          userId: req.user.id,
          operationType: 'update',
          operationResult: 'failure',
          details: {
            error: error.message,
            before: {
              name: existingDatabase.name,
              instanceId: existingDatabase.instanceId,
              username: existingDatabase.username,
              databaseName: existingDatabase.databaseName,
              tags: existingTagIds
            },
            attempted: {
              name,
              instanceId,
              username,
              databaseName,
              tags: newTagIds
            }
          },
        });

        return res.status(400).json({
          message: "Failed to connect to database",
          error: error.message,
        });
      }

      // Update the database if connection test passed
      const [updatedDatabase] = await db
        .update(databaseConnections)
        .set({
          name,
          instanceId,
          username,
          password,
          databaseName,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(databaseConnections.id, parseInt(id)),
            eq(databaseConnections.userId, req.user.id)
          )
        )
        .returning();

      // Update tags
      if (tagIds !== undefined) {
        // Remove existing tags
        await db
          .delete(databaseTags)
          .where(eq(databaseTags.databaseId, updatedDatabase.id));

        // Add new tags
        if (tagIds.length > 0) {
          await db.insert(databaseTags).values(
            tagIds.map((tagId: number) => ({
              databaseId: updatedDatabase.id,
              tagId,
            }))
          );
        }
      }

      // Get tag names for logging
      const allTags = await db.select().from(tags);
      const getTagNames = (ids: number[]) =>
        ids.map(id => allTags.find(t => t.id === id)?.name || `Unknown (${id})`);

      // Log successful update with before/after values including tags
      await db.insert(databaseOperationLogs).values({
        databaseId: updatedDatabase.id,
        userId: req.user.id,
        operationType: 'update',
        operationResult: 'success',
        details: {
          before: {
            name: existingDatabase.name,
            instanceId: existingDatabase.instanceId,
            username: existingDatabase.username,
            databaseName: existingDatabase.databaseName,
            tags: getTagNames(existingTagIds)
          },
          after: {
            name: updatedDatabase.name,
            instanceId: updatedDatabase.instanceId,
            username: updatedDatabase.username,
            databaseName: updatedDatabase.databaseName,
            tags: getTagNames(newTagIds)
          }
        },
      });

      res.json(updatedDatabase);
    } catch (error) {
      console.error("Database update error:", error);
      res.status(500).send("Error updating database connection");
    }
  });

  app.post("/api/databases/:id/test", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const { id } = req.params;
      const [dbConnection] = await db
        .select()
        .from(databaseConnections)
        .where(
          and(
            eq(databaseConnections.id, parseInt(id)),
            eq(databaseConnections.userId, req.user.id)
          )
        )
        .limit(1);

      if (!dbConnection) {
        return res.status(404).send("Database connection not found");
      }

      const client = new Client({
        host: dbConnection.host,
        port: dbConnection.port,
        user: dbConnection.username,
        password: dbConnection.password,
        database: dbConnection.databaseName,
      });

      try {
        await client.connect();
        await client.end();

        // Log successful test
        await db.insert(databaseOperationLogs).values({
          databaseId: parseInt(id),
          userId: req.user.id,
          operationType: 'test',
          operationResult: 'success',
          details: {
            name: dbConnection.name,
            host: dbConnection.host,
            port: dbConnection.port,
            databaseName: dbConnection.databaseName,
          },
        });

        res.json({ success: true, message: "Connection successful" });
      } catch (error: any) {
        // Log failed test
        await db.insert(databaseOperationLogs).values({
          databaseId: parseInt(id),
          userId: req.user.id,
          operationType: 'test',
          operationResult: 'failure',
          details: {
            error: error.message,
            connectionDetails: {
              name: dbConnection.name,
              host: dbConnection.host,
              port: dbConnection.port,
              databaseName: dbConnection.databaseName,
            }
          },
        });

        res.status(400).json({
          success: false,
          message: "Connection failed",
          error: error.message,
        });
      }
    } catch (error) {
      console.error("Connection test error:", error);
      res.status(500).send("Error testing connection");
    }
  });

  // Tags Management Endpoints
  app.get("/api/tags", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const userTags = await db
        .select()
        .from(tags)
        .where(eq(tags.userId, req.user.id));

      res.json(userTags);
    } catch (error) {
      console.error("Tags fetch error:", error);
      res.status(500).send("Error fetching tags");
    }
  });

  app.post("/api/tags", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const { name } = req.body;
      const [newTag] = await db
        .insert(tags)
        .values({
          name,
          userId: req.user.id,
        })
        .returning();

      res.status(201).json(newTag);
    } catch (error) {
      console.error("Tag creation error:", error);
      res.status(500).send("Error creating tag");
    }
  });

  app.get("/api/database-logs", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 100;
      const offset = (page - 1) * pageSize;
      const databaseId = req.query.databaseId ? parseInt(req.query.databaseId as string) : undefined;
      const tagId = req.query.tagId ? parseInt(req.query.tagId as string) : undefined;

      // Build where conditions
      let whereConditions = [eq(databaseOperationLogs.userId, req.user.id)];
      if (databaseId) {
        whereConditions.push(eq(databaseOperationLogs.databaseId, databaseId));
      }
      if (tagId) {
        // Get all database IDs that have the selected tag
        const databasesWithTag = db
          .select({ databaseId: databaseTags.databaseId })
          .from(databaseTags)
          .where(eq(databaseTags.tagId, tagId));

        whereConditions.push(
          sql`${databaseOperationLogs.databaseId} IN (${databasesWithTag})`
        );
      }

      // Get total count for pagination with filters
      const [{ count }] = await db
        .select({ count: sql`count(*)::integer` })
        .from(databaseOperationLogs)
        .where(and(...whereConditions));

      const logs = await db.query.databaseOperationLogs.findMany({
        with: {
          database: true,
          user: {
            columns: {
              username: true,
              fullName: true
            }
          },
        },
        where: and(...whereConditions),
        orderBy: (logs, { desc }) => [desc(logs.timestamp)],
        limit: pageSize,
        offset: offset,
      });

      res.json({ logs, total: count });
    } catch (error) {
      console.error("Database logs fetch error:", error);
      res.status(500).send("Error fetching database logs");
    }
  });

  app.get("/api/databases/:id/metrics", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const { id } = req.params;
      const timeRange = req.query.timeRange || '1h'; // Default to last hour

      // Get database connection details
      const [dbConnection] = await db
        .select()
        .from(databaseConnections)
        .where(
          and(
            eq(databaseConnections.id, parseInt(id)),
            eq(databaseConnections.userId, req.user.id)
          )
        )
        .limit(1);

      if (!dbConnection) {
        return res.status(404).send("Database connection not found");
      }

      // Connect to the database to collect metrics
      const client = new Client({
        host: dbConnection.host,
        port: dbConnection.port,
        user: dbConnection.username,
        password: dbConnection.password,
        database: dbConnection.databaseName,
      });

      try {
        await client.connect();

        // Collect various metrics
        const metrics = {
          activeConnections: 0,
          databaseSize: 0,
          slowQueries: 0,
          avgQueryTime: 0,
          cacheHitRatio: 0,
          tableStats: [],
        };

        // Get active connections
        const activeConnectionsResult = await client.query(
          "SELECT count(*) as count FROM pg_stat_activity WHERE state = 'active'"
        );
        metrics.activeConnections = parseInt(activeConnectionsResult.rows[0].count);

        // Get database size
        const dbSizeResult = await client.query(
          "SELECT pg_database_size(current_database()) / 1024.0 / 1024.0 as size_mb"
        );
        metrics.databaseSize = parseFloat(dbSizeResult.rows[0].size_mb);

        // Get slow queries (queries taking more than 1000ms)
        const slowQueriesResult = await client.query(
          "SELECT count(*) as count FROM pg_stat_activity WHERE state = 'active' AND now() - query_start > interval '1 second'"
        );
        metrics.slowQueries = parseInt(slowQueriesResult.rows[0].count);

        // Get cache hit ratio
        const cacheHitResult = await client.query(`
          SELECT 
            CASE 
              WHEN sum(heap_blks_hit) + sum(heap_blks_read) = 0 THEN 0
              ELSE sum(heap_blks_hit)::float / (sum(heap_blks_hit) + sum(heap_blks_read))
            END as ratio
          FROM pg_statio_user_tables
        `);
        metrics.cacheHitRatio = parseFloat(cacheHitResult.rows[0].ratio || 0);

        // Get table statistics
        const tableStatsResult = await client.query(`
          SELECT 
            relname as table_name,
            n_live_tup as row_count,
            n_dead_tup as dead_tuples,
            pg_total_relation_size(relid) / 1024.0 / 1024.0 as size_mb
          FROM pg_stat_user_tables
          ORDER BY n_live_tup DESC
          LIMIT 10
        `);
        metrics.tableStats = tableStatsResult.rows;

        await client.end();

        // Store metrics in our database
        await db.insert(databaseMetrics).values({
          databaseId: parseInt(id),
          activeConnections: metrics.activeConnections,
          databaseSize: metrics.databaseSize,
          slowQueries: metrics.slowQueries,
          avgQueryTime: 0, // We'll calculate this in a future update
          cacheHitRatio: metrics.cacheHitRatio,
          metrics: metrics,
        });

        // Get historical metrics
        const timeFilter = timeRange === '24h'
          ? sql`interval '24 hours'`
          : timeRange === '7d'
            ? sql`interval '7 days'`
            : sql`interval '1 hour'`;

        const historicalMetrics = await db
          .select()
          .from(databaseMetrics)
          .where(
            and(
              eq(databaseMetrics.databaseId, parseInt(id)),
              sql`${databaseMetrics.timestamp} >= now() - ${timeFilter}`
            )
          )
          .orderBy(databaseMetrics.timestamp);

        res.json({
          current: metrics,
          historical: historicalMetrics,
        });
      } catch (error: any) {
        console.error("Error collecting metrics:", error);
        res.status(500).json({
          message: "Error collecting database metrics",
          error: error.message
        });
      } finally {
        if (client) {
          try {
            await client.end();
          } catch (e) {
            console.error("Error closing client:", e);
          }
        }
      }
    } catch (error: any) {
      console.error("Database metrics error:", error);
      res.status(500).json({
        message: "Error fetching database metrics",
        error: error.message,
      });
    }
  });

  // Clusters Management Endpoints
  // Modified clusters fetch endpoint
  app.get("/api/clusters", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const userClusters = await db
        .select()
        .from(clusters)
        .where(eq(clusters.userId, req.user.id));

      res.json(userClusters);
    } catch (error) {
      console.error("Clusters fetch error:", error);
      res.status(500).send("Error fetching clusters");
    }
  });

  app.post("/api/clusters", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const { name, description } = req.body;
      const [newCluster] = await db
        .insert(clusters)
        .values({
          name,
          description,
          userId: req.user.id,
        })
        .returning();

      res.status(201).json(newCluster);
    } catch (error) {
      console.error("Cluster creation error:", error);
      res.status(500).send("Error creating cluster");
    }
  });

  // Modified cluster details endpoint
  app.get("/api/clusters/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const { id } = req.params;
      const cluster = await db
        .select()
        .from(clusters)
        .where(
          and(
            eq(clusters.id, parseInt(id)),
            eq(clusters.userId, req.user.id)
          )
        )
        .limit(1);

      if (!cluster.length) {
        return res.status(404).send("Cluster not found");
      }

      // Fetch instances separately
      const clusterInstances = await db
        .select()
        .from(instances)
        .where(eq(instances.clusterId, parseInt(id)));

      res.json({
        ...cluster[0],
        instances: clusterInstances
      });
    } catch (error) {
      console.error("Cluster fetch error:", error);
      res.status(500).send("Error fetching cluster");
    }
  });

  app.patch("/api/clusters/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const { id } = req.params;
      const { name, description } = req.body;

      const [updatedCluster] = await db
        .update(clusters)
        .set({
          name,
          description,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(clusters.id, parseInt(id)),
            eq(clusters.userId, req.user.id)
          )
        )
        .returning();

      if (!updatedCluster) {
        return res.status(404).send("Cluster not found");
      }

      res.json(updatedCluster);
    } catch (error) {
      console.error("Cluster update error:", error);
      res.status(500).send("Error updating cluster");
    }
  });

  // Add instance list endpoint
  app.get("/api/instances", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const userInstances = await db
        .select()
        .from(instances)
        .where(eq(instances.userId, req.user.id));

      res.json(userInstances);
    } catch (error) {
      console.error("Instances fetch error:", error);
      res.status(500).send("Error fetching instances");
    }
  });

  // Add instance creation route
  app.post("/api/clusters/:clusterId/instances", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const { clusterId } = req.params;
      const { hostname, port, username, password, description, isWriter, defaultDatabaseName } = req.body;

      // Test connection first
      const client = new Client({
        host: hostname,
        port,
        user: username,
        password,
        database: defaultDatabaseName || 'postgres',
      });

      try {
        await client.connect();
        await client.end();
      } catch (error: any) {
        return res.status(400).json({
          message: "Failed to connect to database instance",
          error: error.message,
        });
      }

      // If connection test passed, create the instance
      const [newInstance] = await db
        .insert(instances)
        .values({
          hostname,
          port,
          username,
          password,
          description,
          isWriter,
          defaultDatabaseName,
          clusterId: parseInt(clusterId),
          userId: req.user.id,
        })
        .returning();

      // If this is a writer instance, update other instances in the cluster to be readers
      if (isWriter) {
        await db
          .update(instances)
          .set({ isWriter: false })
          .where(
            and(
              eq(instances.clusterId, parseInt(clusterId)),
              ne(instances.id, newInstance.id)
            )
          );
      }

      res.json(newInstance);
    } catch (error) {
      console.error("Instance creation error:", error);
      res.status(500).json({
        message: "Error creating instance",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Add instance update endpoint
  app.patch("/api/instances/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const { id } = req.params;
      const { hostname, port, username, password, description, isWriter, defaultDatabaseName } = req.body;

      // Get existing instance
      const [existingInstance] = await db
        .select()
        .from(instances)
        .where(
          and(
            eq(instances.id, parseInt(id)),
            eq(instances.userId, req.user.id)
          )
        )
        .limit(1);

      if (!existingInstance) {
        return res.status(404).send("Instance not found");
      }

      // Test connection first
      const client = new Client({
        host: hostname,
        port,
        user: username,
        password,
        database: defaultDatabaseName || 'postgres',
      });

      try {
        await client.connect();
        await client.end();
      } catch (error: any) {
        return res.status(400).json({
          message: "Failed to connect to database instance",
          error: error.message,
        });
      }

      // Update the instance
      const [updatedInstance] = await db
        .update(instances)
        .set({
          hostname,
          port,
          username,
          password,
          description,
          isWriter,
          defaultDatabaseName,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(instances.id, parseInt(id)),
            eq(instances.userId, req.user.id)
          )
        )
        .returning();

      // If this instance is set as writer, update other instances in the cluster to be readers
      if (isWriter) {
        await db
          .update(instances)
          .set({ isWriter: false })
          .where(
            and(
              eq(instances.clusterId, updatedInstance.clusterId),
              ne(instances.id, updatedInstance.id)
            )
          );
      }

      res.json(updatedInstance);
    } catch (error) {
      console.error("Instance update error:", error);
      res.status(500).json({
        message: "Error updating instance",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Add instance fetch endpoint
  app.get("/api/instances/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const { id } = req.params;
      const [instance] = await db
        .select()
        .from(instances)
        .where(
          and(
            eq(instances.id, parseInt(id)),
            eq(instances.userId, req.user.id)
          )
        )
        .limit(1);

      if (!instance) {
        return res.status(404).send("Instance not found");
      }

      res.json(instance);
    } catch (error) {
      console.error("Instance fetch error:", error);
      res.status(500).send("Error fetching instance");
    }
  });

  // Add test connection endpoint
  app.post("/api/instances/test-connection", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const { hostname, port, username, password, defaultDatabaseName } = req.body;

      const client = new Client({
        host: hostname,
        port,
        user: username,
        password,
        database: defaultDatabaseName || 'postgres',
      });

      try {
        await client.connect();
        await client.end();
        res.json({ success: true, message: "Connection successful" });
      } catch (error: any) {
        res.status(400).json({
          success: false,
          message: "Connection failed",
          error: error.message,
        });
      }
    } catch (error) {
      console.error("Connection test error:", error);
      res.status(500).json({
        message: "Error testing connection",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}