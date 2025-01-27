import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { db } from "@db";
import { users, databaseConnections, tags, databaseTags, databaseOperationLogs, databaseMetrics, clusters, instances } from "@db/schema";
import { eq, and, ne, sql } from "drizzle-orm";
import pkg from 'pg';
const { Client } = pkg;

function requireAuth(req: Express.Request, res: Express.Response, next: Express.NextFunction) {
  if (!req.isAuthenticated()) {
    return res.status(401).send("Not authenticated");
  }
  next();
}

function requireAdmin(req: Express.Request, res: Express.Response, next: Express.NextFunction) {
  if (!req.isAuthenticated()) {
    return res.status(401).send("Not authenticated");
  }
  if (req.user.role !== 'ADMIN') {
    return res.status(403).send("Not authorized");
  }
  next();
}

function requireWriterOrAdmin(req: Express.Request, res: Express.Response, next: Express.NextFunction) {
  if (!req.isAuthenticated()) {
    return res.status(401).send("Not authenticated");
  }
  if (req.user.role !== 'ADMIN' && req.user.role !== 'WRITER') {
    return res.status(403).send("Not authorized");
  }
  next();
}

export function registerRoutes(app: Express): Server {
  setupAuth(app);

  // Add user management routes
  app.get("/api/users", requireAdmin, async (req, res) => {
    try {
      const allUsers = await db
        .select({
          id: users.id,
          username: users.username,
          role: users.role,
          isApproved: users.isApproved,
          approvedAt: users.approvedAt,
          approvedBy: users.approvedBy,
          approvedByUser: {
            username: sql<string>`approver.username`
          }
        })
        .from(users)
        .leftJoin(
          sql`${users} as approver`,
          eq(users.approvedBy, sql`approver.id`)
        );

      res.json(allUsers);
    } catch (error) {
      console.error("Users fetch error:", error);
      res.status(500).send("Error fetching users");
    }
  });

  app.patch("/api/users/:id/role", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { role } = req.body;

      if (parseInt(id) === req.user.id) {
        return res.status(400).send("Cannot change your own role");
      }

      const [updatedUser] = await db
        .update(users)
        .set({
          role,
          updatedAt: new Date(),
        })
        .where(eq(users.id, parseInt(id)))
        .returning();

      res.json(updatedUser);
    } catch (error) {
      console.error("User role update error:", error);
      res.status(500).send("Error updating user role");
    }
  });

  app.post("/api/users/:id/approve", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;

      const [updatedUser] = await db
        .update(users)
        .set({
          isApproved: true,
          approvedBy: req.user.id,
          approvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(users.id, parseInt(id)))
        .returning();

      res.json(updatedUser);
    } catch (error) {
      console.error("User approval error:", error);
      res.status(500).send("Error approving user");
    }
  });

  app.post("/api/users/:id/revoke", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;

      if (parseInt(id) === req.user.id) {
        return res.status(400).send("Cannot revoke your own access");
      }

      const [updatedUser] = await db
        .update(users)
        .set({
          isApproved: false,
          updatedAt: new Date(),
        })
        .where(eq(users.id, parseInt(id)))
        .returning();

      res.json(updatedUser);
    } catch (error) {
      console.error("User revocation error:", error);
      res.status(500).send("Error revoking user access");
    }
  });

  // Update existing profile update endpoint
  app.patch("/api/user/profile", requireAuth, async (req, res) => {
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
  app.get("/api/databases", requireAuth, async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const query = db.query.databaseConnections.findMany({
        with: {
          tags: {
            with: {
              tag: true,
            },
          },
          instance: {
            with: {
              cluster: true,
            },
          },
        },
      });

      // Apply filters based on user role
      if (req.user.role !== 'ADMIN') {
        query.where = eq(databaseConnections.userId, req.user.id);
      }

      const userDatabases = await query;

      // Transform response to include formatted instance details
      const formattedDatabases = userDatabases.map(db => ({
        ...db,
        instanceDetails: db.instance ? {
          id: db.instance.id,
          hostname: db.instance.hostname,
          port: db.instance.port,
          description: db.instance.description,
        } : null,
        clusterDetails: db.instance?.cluster ? {
          id: db.instance.cluster.id,
          name: db.instance.cluster.name,
        } : null,
      }));

      res.json(formattedDatabases);
    } catch (error) {
      console.error("Database fetch error:", error);
      res.status(500).send("Error fetching databases");
    }
  });

  app.get("/api/databases/:id", requireAuth, async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const { id } = req.params;
      const query = db.query.databaseConnections.findFirst({
        where: eq(databaseConnections.id, parseInt(id)),
        with: {
          tags: {
            with: {
              tag: true,
            },
          },
          instance: {
            with: {
              cluster: true,
            },
          },
        },
      });

      // Apply additional filters for non-admin users
      if (req.user.role !== 'ADMIN') {
        query.where = and(eq(databaseConnections.id, parseInt(id)), eq(databaseConnections.userId, req.user.id));
      }

      const database = await query;

      if (!database) {
        return res.status(404).send("Database not found");
      }

      // Transform response to include formatted instance details
      const formattedDatabase = {
        ...database,
        instanceDetails: database.instance ? {
          id: database.instance.id,
          hostname: database.instance.hostname,
          port: database.instance.port,
          description: database.instance.description,
        } : null,
        clusterDetails: database.instance?.cluster ? {
          id: database.instance.cluster.id,
          name: database.instance.cluster.name,
        } : null,
      };

      res.json(formattedDatabase);
    } catch (error) {
      console.error("Database fetch error:", error);
      res.status(500).send("Error fetching database");
    }
  });

  app.post("/api/databases", requireWriterOrAdmin, async (req, res) => {
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
        ssl: { rejectUnauthorized: false }
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

  app.patch("/api/databases/:id", requireWriterOrAdmin, async (req, res) => {
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
        ssl: { rejectUnauthorized: false }
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

  // Database connection test endpoint from edited snippet
  app.post("/api/databases/:id/test", requireAuth, async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const { id } = req.params;
      const parsedId = parseInt(id);

      // Get database connection details with instance
      const dbConnection = await db.query.databaseConnections.findFirst({
        where: req.user.role === 'ADMIN'
          ? eq(databaseConnections.id, parsedId)
          : and(
              eq(databaseConnections.id, parsedId),
              eq(databaseConnections.userId, req.user.id)
            ),
        with: {
          instance: true,
        },
      });

      if (!dbConnection) {
        return res.status(404).send("Database connection not found or you don't have access to it");
      }

      // Get instance details
      const instance = dbConnection.instance;
      if (!instance) {
        return res.status(404).send("Associated instance not found");
      }

      // Test connection using direct configuration
      const client = new Client({
        host: instance.hostname,
        port: instance.port,
        user: dbConnection.username,
        password: dbConnection.password,
        database: dbConnection.databaseName,
        ssl: { rejectUnauthorized: false }
      });

      try {
        await client.connect();
        await client.end();

        // Log successful test
        await db.insert(databaseOperationLogs).values({
          databaseId: parsedId,
          userId: req.user.id,
          operationType: 'test',
          operationResult: 'success',
          details: {
            name: dbConnection.name,
            instanceId: dbConnection.instanceId,
            databaseName: dbConnection.databaseName,
          },
        });

        res.json({ success: true, message: "Connection successful" });
      } catch (error: any) {
        // Log failed test
        await db.insert(databaseOperationLogs).values({
          databaseId: parsedId,
          userId: req.user.id,
          operationType: 'test',
          operationResult: 'failure',
          details: {
            error: error.message,
            connectionDetails: {
              name: dbConnection.name,
              instanceId: dbConnection.instanceId,
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

  // Add instance list endpoint
  app.get("/api/instances", requireAuth, async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      // For admin users, show all instances
      // For other users, show only their own instances
      const where = req.user.role === 'ADMIN'
        ? undefined
        : eq(instances.userId, req.user.id);

      const userInstances = await db.query.instances.findMany({
        where,
        with: {
          cluster: true,
        },
      });

      res.json(userInstances);
    } catch (error) {
      console.error("Instances fetch error:", error);
      res.status(500).send("Error fetching instances");
    }
  });

  // Add instance creation route
  app.post("/api/clusters/:clusterId/instances", requireWriterOrAdmin, async (req, res) => {
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
        ssl: { rejectUnauthorized: false }
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
  app.patch("/api/instances/:id", requireWriterOrAdmin, async (req, res) => {
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
        ssl: { rejectUnauthorized: false }
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

  // Instance fetch endpoint from edited snippet
  app.get("/api/instances/:id", requireAuth, async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const { id } = req.params;
      const whereConditions = req.user.role === 'ADMIN'
        ? eq(instances.id, parseInt(id))
        : and(
            eq(instances.id, parseInt(id)),
            eq(instances.userId, req.user.id)
          );

      const instance = await db.query.instances.findFirst({
        where: whereConditions,
        with: {
          cluster: true,
          databases: true,
        },
      });

      if (!instance) {
        return res.status(404).send("Instance not found");
      }

      res.json(instance);
    } catch (error) {
      console.error("Instance fetch error:", error);
      res.status(500).send("Error fetching instance");
    }
  });


  // Tags Management Endpoints
  app.get("/api/tags", requireAuth, async (req, res) => {
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

  app.post("/api/tags", requireAuth, async (req, res) => {
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

  // Database logs endpoint from edited snippet
  app.get("/api/database-logs", requireAuth, async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 100;
      const offset = (page - 1) * pageSize;
      const databaseId = req.query.databaseId ? parseInt(req.query.databaseId as string) : undefined;
      const tagId = req.query.tagId ? parseInt(req.query.tagId as string) : undefined;

      // Get database IDs accessible to the user
      const userDatabases = await db.select({
        id: databaseConnections.id
      })
        .from(databaseConnections)
        .where(
          req.user.role === 'ADMIN'
            ? undefined
            : eq(databaseConnections.userId, req.user.id)
        );

      const userDatabaseIds = userDatabases.map(db => db.id);

      // Build where conditions
      let whereConditions = [];

      // Always filter by accessible databases
      if (req.user.role !== 'ADMIN') {
        whereConditions.push(sql`${databaseOperationLogs.databaseId} = ANY(${userDatabaseIds})`);
      }

      if (databaseId) {
        whereConditions.push(eq(databaseOperationLogs.databaseId, databaseId));
      }

      if (tagId) {
        const databasesWithTag = db
          .select({ databaseId: databaseTags.databaseId })
          .from(databaseTags)
          .where(eq(databaseTags.tagId, tagId));

        whereConditions.push(
          sql`${databaseOperationLogs.databaseId} IN (${databasesWithTag})`
        );
      }

      const finalWhere = whereConditions.length > 0
        ? and(...whereConditions)
        : undefined;

      // Get total count
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(databaseOperationLogs)
        .where(finalWhere || sql`true`);

      // Get logs with related data
      const logs = await db.query.databaseOperationLogs.findMany({
        where: finalWhere,
        with: {
          database: true,
          user: {
            columns: {
              username: true,
              fullName: true
            }
          },
        },
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

  app.get("/api/databases/:id/metrics", requireAuth, async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const { id } = req.params;
      const timeRange = req.query.timeRange || '1h'; // Default to last hour

      // Get database connection details with instance
      const [dbConnection] = await db
        .select({
          database: databaseConnections,
          instance: instances,
        })
        .from(databaseConnections)
        .leftJoin(instances, eq(instances.id, databaseConnections.instanceId))
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

      if (!dbConnection.instance) {
        return res.status(404).send("Instance not found");
      }

      // Connect to the database to collect metrics
      const client = new Client({
        host: dbConnection.instance.hostname,
        port: dbConnection.instance.port,
        user: dbConnection.database.username,
        password: dbConnection.database.password,
        database: dbConnection.database.databaseName,
        ssl: { rejectUnauthorized: false }
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
        });        // Get historical metrics
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
      } finally {        if (client) {          try {
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
  app.get("/api/clusters", requireAuth, async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      // For admin users, show all clusters
      // For other users, show only their own clusters
      const where = req.user.role === 'ADMIN'
        ? undefined
        : eq(clusters.userId, req.user.id);

      const userClusters = await db.query.clusters.findMany({
        where,
        with: {
          instances: true,
        },
      });

      res.json(userClusters);
    } catch (error) {
      console.error("Clusters fetch error:", error);
      res.status(500).send("Error fetching clusters");
    }
  });

  app.post("/api/clusters", requireWriterOrAdmin, async (req, res) => {
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
  app.get("/api/clusters/:id", requireAuth, async (req, res) => {
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

  app.patch("/api/clusters/:id", requireWriterOrAdmin, async (req, res) => {
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

  const httpServer = createServer(app);
  return httpServer;
}