import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { db } from "@db";
import { users, databaseConnections, tags, databaseTags, databaseOperationLogs, databaseMetrics, clusters, instances, healthCheckQueries, healthCheckExecutions, healthCheckQueryResults, healthCheckReports } from "@db/schema";
import { eq, and, ne, sql, desc, asc } from "drizzle-orm";
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
      const userDatabases = await db.query.databaseConnections.findMany({
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

      // Only check if database exists, no user role/ownership check
      const dbConnection = await db.query.databaseConnections.findFirst({
        where: eq(databaseConnections.id, parsedId),
        with: {
          instance: {
            columns: {
              hostname: true,
              port: true,
            },
          },
        },
      });

      if (!dbConnection) {
        return res.status(404).json({
          message: "Database connection not found",
        });
      }

      const instance = dbConnection.instance;
      if (!instance) {
        return res.status(404).json({
          message: "Associated instance not found",
        });
      }

      // Test connection using instance configuration
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

        res.json({ message: "Connection successful" });
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
      const conditions = [];

      // Always filter by accessible databases for non-admin users
      if (req.user.role !== 'ADMIN' && userDatabaseIds.length > 0) {
        conditions.push(sql`${databaseOperationLogs.databaseId} = ANY(${sql`ARRAY[${sql.join(userDatabaseIds, sql`, `)}]`})`);
      }

      // Add specific database filter if provided
      if (databaseId) {
        conditions.push(eq(databaseOperationLogs.databaseId, databaseId));
      }

      // Add tag filter if provided
      if (tagId) {
        const databasesWithTag = await db
          .select({ databaseId: databaseTags.databaseId })
          .from(databaseTags)
          .where(eq(databaseTags.tagId, tagId));

        const taggedDatabaseIds = databasesWithTag.map(d => d.databaseId);
        if (taggedDatabaseIds.length > 0) {
          conditions.push(sql`${databaseOperationLogs.databaseId} = ANY(${sql`ARRAY[${sql.join(taggedDatabaseIds, sql`, `)}]`})`);
        }
      }

      // Get total count
      const totalResult = await db.select({
        count: sql<number>`COUNT(*)::integer`,
      })
        .from(databaseOperationLogs)
        .where(conditions.length > 0 ? and(...conditions) : undefined);

      const total = totalResult[0]?.count || 0;

      // Get logs with related data
      const logs = await db.query.databaseOperationLogs.findMany({
        where: conditions.length > 0 ? and(...conditions) : undefined,
        with: {
          database: {
            columns: {
              name: true,
              databaseName: true,
            },
            with: {
              instance: {
                columns: {
                  hostname: true,
                  port: true,
                },
              },
            },
          },
          user: {
            columns: {
              username: true,
              fullName: true,
            },
          },
        },
        orderBy: (logs, { desc }) => [desc(logs.timestamp)],
        limit: pageSize,
        offset: offset,
      });

      res.json({ logs, total });
    } catch (error) {
      console.error("Database logs fetch error:", error);
      res.status(500).send("Error fetching database logs");
    }
  });

  // Update metrics endpoint with proper access control
  app.get("/api/databases/:id/metrics", requireAuth, async (req, res) => {
    console.log('Metrics endpoint called for database ID:', req.params.id);

    try {
      const { id } = req.params;
      const parsedId = parseInt(id);

      console.log('Fetching database connection details');
      // Get database connection details
      const dbConnection = await db.query.databaseConnections.findFirst({
        where: eq(databaseConnections.id, parsedId),
        with: {
          instance: {
            columns: {
              hostname: true,
              port: true,
            },
          },
        },
      });

      console.log('Database connection query result:', {
        found: !!dbConnection,
        hasInstance: !!dbConnection?.instance,
        connectionDetails: dbConnection ? {
          id: dbConnection.id,
          name: dbConnection.name,
          databaseName: dbConnection.databaseName,
          instance: dbConnection.instance ? {
            hostname: dbConnection.instance.hostname,
            port: dbConnection.instance.port
          } : null
        } : null
      });

      if (!dbConnection || !dbConnection.instance) {
        console.log('Database connection or instance not found');
        return res.status(404).json({
          message: "Database connection or instance not found",
        });
      }

      console.log('Creating database client with connection details');
      const client = new Client({
        host: dbConnection.instance.hostname,
        port: dbConnection.instance.port,
        user: dbConnection.username,
        password: dbConnection.password,
        database: dbConnection.databaseName,
        ssl: { rejectUnauthorized: false }
      });

      console.log('Attempting to connect to database');
      try {
        await client.connect();
        console.log('Successfully connected to database');

        const metrics = {
          timestamp: new Date().toISOString(),
          connections: 0,
          databaseSize: '0',
          slowQueries: 0,
          cacheHitRatio: 0,
          tableStats: [],
        };

        console.log('Collecting active connections');
        const connectionsResult = await client.query(
          "SELECT count(*) as count FROM pg_stat_activity WHERE datname = $1",
          [dbConnection.databaseName]
        );
        metrics.connections = parseInt(connectionsResult.rows[0].count);
        console.log('Active connections:', metrics.connections);

        console.log('Collecting database size');
        const sizeResult = await client.query(
          "SELECT pg_size_pretty(pg_database_size($1)) as size",
          [dbConnection.databaseName]
        );
        metrics.databaseSize = sizeResult.rows[0].size;
        console.log('Database size:', metrics.databaseSize);

        console.log('Collecting table statistics');
        const tableStatsResult = await client.query(`
          SELECT 
            schemaname,
            relname as table_name,
            n_live_tup as row_count,
            pg_size_pretty(pg_relation_size(schemaname || '.' || relname)) as size
          FROM pg_stat_usertables 
          ORDER BY n_live_tup DESC 
          LIMIT 5;
        `);
        metrics.tableStats = tableStatsResult.rows;
        console.log('Table statistics:', metrics.tableStats);

        console.log('Collecting cache statistics');
        const cacheResult = await client.query(databaseMetricsQueries.bufferCacheHitRatio);

        const heapHit = parseInt(cacheResult.rows[0].heap_hit);
        const heapRead = parseInt(cacheResult.rows[0].heap_read);
        metrics.cacheHitRatio = heapRead + heapHit === 0
          ? 0
          : Math.round((heapHit / (heapRead + heapHit)) * 100);
        console.log('Cache hit ratio:', metrics.cacheHitRatio);

        console.log('Closing database connection');
        await client.end();

        console.log('Sending metrics response:', metrics);
        res.json(metrics);
      } catch (error) {
        console.error('Error during metrics collection:', error);
        try {
          await client.end();
        } catch (closeError) {
          console.error('Error closing client after collection error:', closeError);
        }
        throw error; // Re-throw to be caught by outer catch block
      }
    } catch (error) {
      console.error("Metrics collection error:", error);
      res.status(500).json({
        message: "Failed to collect database metrics",
        error: error instanceof Error ? error.message : String(error)
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

  // Health Check Endpoints
  app.post("/api/clusters/:clusterId/health-check", requireAuth, async (req, res) => {
    try {
      const { clusterId } = req.params;
      const [cluster] = await db
        .select()
        .from(clusters)
        .where(eq(clusters.id, parseInt(clusterId)));

      if (!cluster) {
        return res.status(404).json({ message: "Cluster not found" });
      }

      // Create health check report
      const [report] = await db
        .insert(healthCheckReports)
        .values({
          clusterId: parseInt(clusterId),
          userId: req.user.id,
          status: "running",
          reportType: "combined", // Always run all checks
        })
        .returning();

      // Run checks asynchronously
      process.nextTick(async () => {
        try {
          const results = [];
          let markdown = "# Health Check Report\n\n";

          // Get all instances in the cluster
          const clusterInstances = await db
            .select()
            .from(instances)
            .where(eq(instances.clusterId, parseInt(clusterId)));

          const masterInstance = clusterInstances.find(i => i.isWriter);
          if (!masterInstance) {
            throw new Error("No master instance found in cluster");
          }

          // Connect to master instance
          const masterClient = new Client({
            host: masterInstance.hostname,
            port: masterInstance.port,
            user: masterInstance.username,
            password: masterInstance.password,
            database: masterInstance.defaultDatabaseName || 'postgres',
            ssl: { rejectUnauthorized: false }
          });

          try {
            await masterClient.connect();

            // Cluster-level checks (on master instance)

            // Database sizes
            try {
              const dbSizesResult = await masterClient.query(databaseMetricsQueries.databaseSizes);

              results.push({
                id: results.length + 1,
                checkName: 'database_sizes',
                title: 'Database Sizes',
                status: 'success',
                details: dbSizesResult.rows,
                description: 'List of databases and their sizes'
              });

              markdown += "\n## Database Sizes\n\n";
              markdown += "| Database | Size | Tablespace Size |\n|-----------|------|----------------|\n";
              dbSizesResult.rows.forEach(row => {
                markdown += `| ${row.database} | ${row.size} | ${row.tablespace_size} |\n`;
              });
            } catch (error) {
              results.push({
                id: results.length + 1,
                checkName: 'database_sizes',
                title: 'Database Sizes',
                status: 'error',
                details: { error: error.message },
                description: 'Failed to check database sizes'
              });
            }

            // Transaction ID Wraparound Check
            try {
              const wraparoundResult = await masterClient.query(databaseMetricsQueries.transactionWraparound);

              results.push({
                id: results.length + 1,
                checkName: 'transaction_wraparound',
                title: 'Transaction ID Wraparound Risk',
                status: wraparoundResult.rows.some(row => row.status !== 'ok') ? 'warning' : 'success',
                details: wraparoundResult.rows,
                description: 'Objects approaching transaction ID wraparound'
              });

              markdown += "\n## Transaction ID Wraparound Risk\n\n";
              if (wraparoundResult.rows.length > 0) {
                markdown += "| Schema | Table | XID Age | % Towards Wraparound | Status |\n|---------|-------|----------|-----------------------|--------|\n";
                wraparoundResult.rows.forEach(row => {
                  markdown += `| ${row.schema} | ${row.table} | ${row.xid_age} | ${row.perc_towards_wraparound} | ${row.status} |\n`;
                });
              } else {
                markdown += "No tables at risk of transaction ID wraparound.\n";
              }
            } catch (error) {
              results.push({
                id: results.length + 1,
                checkName: 'transaction_wraparound',
                title: 'Transaction ID Wraparound Risk',
                status: 'error',
                details: { error: error.message },
                description: 'Failed to check transaction wraparound'
              });
            }

            // Dead Tuples Check
            try {
              const deadTuplesResult = await masterClient.query(databaseMetricsQueries.deadTuples);

              results.push({
                id: results.length + 1,
                checkName: 'dead_tuples',
                title: 'Dead Tuples Analysis',
                status: 'success',
                details: deadTuplesResult.rows,
                description: 'Tables with dead tuples that need cleanup'
              });

              markdown += "\n## Dead Tuples Analysis\n\n";
              markdown += "| Schema | Table | Dead Tuples | Live Tuples | Dead/Live Ratio (%) |\n|---------|-------|--------------|-------------|-------------------|\n";
              deadTuplesResult.rows.forEach(row => {
                markdown += `| ${row.schema} | ${row.table} | ${row.dead_tuples} | ${row.live_tuples} | ${row.dead_tuples_ratio} |\n`;
              });
            } catch (error) {
              results.push({
                id: results.length + 1,
                checkName: 'dead_tuples',
                title: 'Dead Tuples Analysis',
                status: 'error',
                details: { error: error.message },
                description: 'Failed to check dead tuples'
              });
            }

            // Heap Bloat Check
            try {
              const heapBloatResult = await masterClient.query(databaseMetricsQueries.tableBloat);

              results.push({
                id: results.length + 1,
                checkName: 'heap_bloat',
                title: 'Heap Bloat Analysis',
                status: heapBloatResult.rows.length > 0 ? 'warning' : 'success',
                details: heapBloatResult.rows,
                description: 'Tables with significant heap bloat'
              });

              markdown += "\n## Heap Bloat Analysis\n\n";
              markdown += "| Schema | Table | Bloat Size | Bloat Ratio (%) |\n|---------|-------|-------------|----------------|\n";
              heapBloatResult.rows.forEach(row => {
                markdown += `| ${row.schema} | ${row.table} | ${row.bloat_size} | ${row.bloat_ratio} |\n`;
              });
            } catch (error) {
              results.push({
                id: results.length + 1,
                checkName: 'heap_bloat',
                title: 'Heap Bloat Analysis',
                status: 'error',
                details: { error: error.message },
                description: 'Failed to check heap bloat'
              });
            }

            // Invalid and Duplicate Indexes Check
            try {
              const invalidIndexesResult = await masterClient.query(`
                SELECT 
                  schemaname as schema,
                  tablename as table,
                  indexname as index,
                  pg_size_pretty(pg_relation_size(i.indexrelid)) as index_size
                FROM pg_index i
                JOIN pg_class c ON i.indexrelid = c.oid
                JOIN pg_stat_user_indexes ui ON i.indexrelid = ui.indexrelid
                WHERE NOT i.indisvalid
                ORDER BY pg_relation_size(i.indexrelid) DESC;
              `);

              results.push({
                id: results.length + 1,
                checkName: 'invalid_indexes',
                title: 'Invalid Indexes',
                status: invalidIndexesResult.rows.length > 0 ? 'warning' : 'success',
                details: invalidIndexesResult.rows,
                description: 'Invalid indexes that should be rebuilt'
              });

              markdown += "\n## Invalid Indexes\n\n";
              if (invalidIndexesResult.rows.length > 0) {
                markdown += "| Schema | Table | Index | Size |\n|---------|-------|-------|------|\n";
                invalidIndexesResult.rows.forEach(row => {
                  markdown += `| ${row.schema} | ${row.table} | ${row.index} | ${row.index_size} |\n`;
                });
              } else {
                markdown += "No invalid indexes found.\n";
              }
            } catch (error) {
              results.push({
                id: results.length + 1,
                checkName: 'invalid_indexes',
                title: 'Invalid Indexes',
                status: 'error',
                details: { error: error.message },
                description: 'Failed to check invalid indexes'
              });
            }

            // Non-indexed Foreign Keys Check
            try {
              const nonIndexedFKsResult = await masterClient.query(databaseMetricsQueries.missingForeignKeys);

              results.push({
                id: results.length + 1,
                checkName: 'non_indexed_fks',
                title: 'Non-indexed Foreign Keys',
                status: nonIndexedFKsResult.rows.length > 0 ? 'warning' : 'success',
                details: nonIndexedFKsResult.rows,
                description: 'Foreign keys without corresponding indexes'
              });

              markdown += "\n## Non-indexed Foreign Keys\n\n";
              if (nonIndexedFKsResult.rows.length > 0) {
                markdown += "| Table | Column | Foreign Key | Referenced Table |\n|-------|--------|-------------|------------------|\n";
                nonIndexedFKsResult.rows.forEach(row => {
                  markdown += `| ${row.table} | ${row.column} | ${row.foreign_key} | ${row.referenced_table} |\n`;
                });
              } else {
                markdown += "All foreign keys are properly indexed.\n";
              }
            } catch (error) {
              results.push({
                id: results.length + 1,
                checkName: 'non_indexed_fks',
                title: 'Non-indexed Foreign Keys',
                status: 'error',
                details: { error: error.message },
                description: 'Failed to check non-indexed foreign keys'
              });
            }

            // Instance-level checks for each instance
            for (const instance of clusterInstances) {
              const instanceClient = new Client({
                host: instance.hostname,
                port: instance.port,
                user: instance.username,
                password: instance.password,
                database: instance.defaultDatabaseName || 'postgres',
                ssl: { rejectUnauthorized: false }
              });

              try {
                await instanceClient.connect();

                // Unused and Rarely Used Indexes
                try {
                  const indexUsageResult = await instanceClient.query(databaseMetricsQueries.unusedIndexes);

                  results.push({
                    id: results.length + 1,
                    checkName: 'index_usage',
                    title: `Index Usage Analysis - ${instance.hostname}:${instance.port}`,
                    status: 'success',
                    details: indexUsageResult.rows,
                    description: 'Rarely used or unused indexes',
                    instance: {
                      hostname: instance.hostname,
                      port: instance.port
                    }
                  });

                  markdown += `\n## Index Usage Analysis - ${instance.hostname}:${instance.port}\n\n`;
                  markdown += "| Schema | Table | Index | Size |\n|---------|-------|-------|------|\n";
                  indexUsageResult.rows.forEach(row => {
                    markdown += `| ${row.schema} | ${row.table} | ${row.index} | ${row.index_size} |\n`;
                  });
                } catch (error) {
                  results.push({
                    id: results.length + 1,
                    checkName: 'index_usage',
                    title: `Index Usage Analysis - ${instance.hostname}:${instance.port}`,
                    status: 'error',
                    details: { error: error.message },
                    description: 'Failed to check index usage',
                    instance: {
                      hostname: instance.hostname,
                      port: instance.port
                    }
                  });
                }

                // Top Queries by Total Time
                try {
                  const topQueriesResult = await instanceClient.query(`
                    SELECT 
                      substring(query, 1, 200) as query,
                      round(total_exec_time::numeric, 2) as total_time,
                      calls,
                      round(mean_exec_time::numeric, 2) as mean_time,
                      round((100 * total_exec_time / sum(total_exec_time) over ())::numeric, 2) as percentage_cpu
                    FROM pg_stat_statements
                    ORDER BY total_exec_time DESC
                    LIMIT 50;
                  `);

                  results.push({
                    id: results.length + 1,
                    checkName: 'top_queries',
                    title: `Top Queries by Total Time - ${instance.hostname}:${instance.port}`,
                    status: 'success',
                    details: topQueriesResult.rows,
                    description: 'Queries consuming the most total execution time',
                    instance: {
                      hostname: instance.hostname,
                      port: instance.port
                    }
                  });

                  markdown += `\n## Top Queries by Total Time - ${instance.hostname}:${instance.port}\n\n`;
                  markdown += "| Query | Total Time (ms) | Calls | Mean Time (ms) | CPU % |\n|-------|----------------|--------|---------------|--------|\n";
                  topQueriesResult.rows.forEach(row => {
                    markdown += `| \`${row.query.replace(/\|/g, '\\|')}\` | ${row.total_time} | ${row.calls} | ${row.mean_time} | ${row.percentage_cpu} |\n`;
                  });
                } catch (error) {
                  results.push({
                    id: results.length + 1,
                    checkName: 'top_queries',
                    title: `Top Queries by Total Time - ${instance.hostname}:${instance.port}`,
                    status: 'error',
                    details: { error: error.message },
                    description: 'Failed to check top queries',
                    instance: {
                      hostname: instance.hostname,
                      port: instance.port
                    }
                  });
                }

                await instanceClient.end();
              } catch (error) {
                console.error(`Error checking instance ${instance.hostname}:${instance.port}:`, error);
                results.push({
                  id: results.length + 1,
                  checkName: 'instance_connection',
                  title: `Instance Connection - ${instance.hostname}:${instance.port}`,
                  status: 'error',
                  details: { error: error.message },
                  description: 'Failed to connect to instance',
                  instance: {
                    hostname: instance.hostname,
                    port: instance.port
                  }
                });
              }
            }

            await masterClient.end();

            // Update report with results
            await db
              .update(healthCheckReports)
              .set({
                status: 'completed',
                completedAt: new Date(),
                markdown: markdown
              })
              .where(eq(healthCheckReports.id, report.id));

            // Insert individual check results
            for (const result of results) {
              await db
                .insert(healthCheckResults)
                .values({
                  reportId: report.id,
                  checkName: result.checkName,
                  status: result.status,
                  details: result.details
                });
            }

          } catch (error) {
            console.error('Error in master instance checks:', error);
            await db
              .update(healthCheckReports)
              .set({
                status: 'failed',
                completedAt: new Date(),
                markdown: `# Health Check Failed\n\nError: ${error.message}`
              })
              .where(eq(healthCheckReports.id, report.id));
          }
        } catch (error) {
          console.error('Error in health check process:', error);
          await db
            .update(healthCheckReports)
            .set({
              status: 'failed',
              completedAt: new Date(),
              markdown: `# Health Check Failed\n\nError: ${error.message}`
            })
            .where(eq(healthCheckReports.id, report.id));
        }
      });

      res.json(report);
    } catch (error) {
      console.error('Health check error:', error);
      res.status(500).json({
        message: 'Error performing health check',
        error: error.message
      });
    }
  });

  // Get health check reports for a cluster
  app.get("/api/clusters/:clusterId/health-checks", requireAuth, async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const { clusterId } = req.params;

      const reports = await db.query.healthCheckReports.findMany({
        where: eq(healthCheckReports.clusterId, parseInt(clusterId)),
        with: {
          results: true,
        },
        orderBy: (table, { desc }) => [desc(table.createdAt)],
      });

      res.json(reports);
    } catch (error) {
      console.error("Health check reports fetch error:", error);
      res.status(500).send("Error fetching health check reports");
    }
  });

  // Get all health check reports
  app.get("/api/health-checks", requireAuth, async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      // Get active queries in their specified order
      const activeQueries = await db.query.healthCheckQueries.findMany({
        where: eq(healthCheckQueries.isActive, true),
        orderBy: (queries, { asc }) => [asc(queries.orderIndex)],
      });

      // Get the most recent executions
      const recentExecutions = await db.query.healthCheckExecutions.findMany({
        limit: 5,
        orderBy: (executions, { desc }) => [desc(executions.startedAt)],
        with: {
          cluster: true,
          results: {
            with: {
              query: true,
              instance: true,
            },
          },
        },
      });

      res.json({
        queries: activeQueries,
        recentExecutions: recentExecutions,
      });
    } catch (error) {
      console.error("Health checks fetch error:", error);
      res.status(500).send("Error fetching health checks");
    }
  });

  // Get a specific health check report
  app.get("/api/health-checks/:id", requireAuth, async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const { id } = req.params;

      const report = await db.query.healthCheckReports.findFirst({
        where: eq(healthCheckReports.id, parseInt(id)),
        with: {
          cluster: true,
          results: {
            with: {
              instance: true,
            },
          },
        },
      });

      if (!report) {
        return res.status(404).send("Report not found");
      }

      res.json(report);
    } catch (error) {
      console.error("Health check report fetch error:", error);
      res.status(500).send("Error fetching health check report");
    }
  });

  // Health Check System Endpoints
  app.get("/api/health-check/queries", requireAuth, async (req, res) => {
    try {
      const queries = await db.query.healthCheckQueries.findMany({
        orderBy: (queries, { asc }) => [asc(queries.orderIndex)],
      });
      res.json(queries);
    } catch (error) {
      console.error("Health check queries fetch error:", error);
      res.status(500).send("Error fetching health check queries");
    }
  });

  app.post("/api/health-check/queries", requireWriterOrAdmin, async (req, res) => {
    try {
      const { title, query, scope, isActive } = req.body;

      // Get max order index
      const maxOrderResult = await db
        .select({
          maxOrder: sql<number>`COALESCE(MAX(${healthCheckQueries.orderIndex}), 0)`,
        })
        .from(healthCheckQueries);

      const newOrderIndex = (maxOrderResult[0]?.maxOrder || 0) + 1;

      const [newQuery] = await db
        .insert(healthCheckQueries)
        .values({
          title,
          query,
          scope,
          isActive: isActive ?? true,
          orderIndex: newOrderIndex,
          userId: req.user.id,
        })
        .returning();

      res.json(newQuery);
    } catch (error) {
      console.error("Health check query creation error:", error);
      res.status(500).send("Error creating health check query");
    }
  });

  app.patch("/api/health-check/queries/:id", requireWriterOrAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { title, query, scope, isActive, orderIndex } = req.body;

      const [updatedQuery] = await db
        .update(healthCheckQueries)
        .set({
          title,
          query,
          scope,
          isActive,
          orderIndex,
          updatedAt: new Date(),
        })
        .where(eq(healthCheckQueries.id, parseInt(id)))
        .returning();

      res.json(updatedQuery);
    } catch (error) {
      console.error("Health check query update error:", error);
      res.status(500).send("Error updating health check query");
    }
  });

  app.post("/api/health-check/queries/reorder", requireWriterOrAdmin, async (req, res) => {
    try {
      const { orderUpdates } = req.body;

      // Validate input
      if (!Array.isArray(orderUpdates)) {
        return res.status(400).json({ message: "Invalid order updates format" });
      }

      // Update each query's order
      const updates = await Promise.all(
        orderUpdates.map(({ id, orderIndex }) =>
          db
            .update(healthCheckQueries)
            .set({ orderIndex })
            .where(eq(healthCheckQueries.id, id))
            .returning()
        )
      );

      res.json(updates.flat());
    } catch (error) {
      console.error("Queryreorder error:", error);
      res.status(500).send("Error reordering queries");
    }
  });

  // Add health check query creation endpoint from edited snippet
  app.post("/api/health-check-queries", requireWriterOrAdmin, async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const { title, query, runOnAllInstances, active } = req.body;

      // Validate required fields
      if (!title || !query) {
        return res.status(400).json({
          message: "Title and query are required fields"
        });
      }

      const [newQuery] = await db
        .insert(healthCheckQueries)
        .values({
          title,
          query,
          runOnAllInstances,
          active,
          user_id: req.user!.id,
          displayOrder: (await db.select({ count: sql<number>`count(*)` }).from(healthCheckQueries))[0].count
        })
        .returning();

      console.log('Created new health check query:', newQuery);

      res.json(newQuery);
    } catch (error) {
      console.error("Error creating health check query:", error);
      res.status(500).json({
        message: "Failed to create health check query",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.get("/api/health-check-queries", requireAuth, async (req, res) => {
    try {
      const queries = await db
        .select()
        .from(healthCheckQueries)
        .orderBy(healthCheckQueries.displayOrder);

      res.json(queries);
    } catch (error) {
      console.error("Error fetching health check queries:", error);
      res.status(500).json({
        message: "Failed to fetch health check queries",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

const databaseMetricsQueries = {
  bufferCacheHitRatio: `
    SELECT 
      COALESCE(sum(heap_blks_hit), 0) as heap_hit,
      COALESCE(sum(heap_blks_read), 0) as heap_read
    FROM pg_statio_user_tables;
  `,

  databaseSizes: `
    SELECT 
      datname AS database,
      pg_size_pretty(pg_database_size(datname)) AS size,
      pg_size_pretty(pg_tablespace_size('pg_default')) AS tablespace_size
    FROM pg_database
    WHERE datname NOT IN ('template0', 'template1', 'postgres')
    ORDER BY pg_database_size(datname) DESC;
  `,

  transactionWraparound: `
    SELECT 
      n.nspname as schema,
      c.relname as table,
      age(c.relfrozenxid) as xid_age,
      ROUND((age(c.relfrozenxid) / 2000000000::float4)::numeric, 1) as perc_towards_wraparound,
      CASE
        WHEN age(c.relfrozenxid) > 1500000000 THEN 'critical'
        WHEN age(c.relfrozenxid) > 1000000000 THEN 'warning'
        ELSE 'ok'
      END as status
    FROM pg_class c
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE c.relkind IN ('r', 't', 'm')
      AND n.nspname NOT IN ('pg_catalog', 'information_schema')
    ORDER BY age(c.relfrozenxid) DESC
    LIMIT 10;
  `,

  deadTuples: `
    SELECT 
      schemaname as schema,
      relname as table,
      n_dead_tup as dead_tuples,
      n_live_tup as live_tuples,
      ROUND(n_dead_tup::numeric * 100.0 / NULLIF(n_live_tup + n_dead_tup, 0), 1) as dead_tuples_ratio
    FROM pg_stat_user_tables
    WHERE n_dead_tup > 10000
    ORDER BY n_dead_tup DESC
    LIMIT 10;
  `,

  tableBloat: `
    WITH RECURSIVE constants AS (
      SELECT current_setting('block_size')::numeric AS bs
    ),
    relation_stats AS (
      SELECT 
        schemaname,
        tablename,
        (n_live_tup + n_dead_tup) AS total_tuples,
        seq_scan,
        idx_scan
      FROM pg_stat_user_tables
    ),
    table_bloat AS (
      SELECT
        schemaname as schema,
        tablename as table,
        CASE
          WHEN avg_width IS NULL OR avg_width <= 0 THEN NULL
          ELSE ceil(bs::numeric * count(*) / (bs - 24)::numeric)
        END AS expected_pages,
        relpages AS actual_pages,
        CASE
          WHEN relpages IS NULL THEN NULL
          ELSE relpages - ceil(bs::numeric * count(*) / (bs - 24)::numeric)
        END AS bloat_pages
      FROM pg_class c
      JOIN pg_namespace n ON c.relnamespace = n.oid
      JOIN pg_stats ON tablename = relname
      CROSS JOIN constants
      WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
        AND c.relkind = 'r'
      GROUP BY schemaname, tablename, bs, avg_width, relpages
    )
    SELECT 
      schema,
      table,
      pg_size_pretty(bloat_pages::bigint * bs::bigint) AS bloat_size,
      CASE
        WHEN expected_pages = 0 THEN 0
        ELSE round((bloat_pages::numeric / expected_pages::numeric)::numeric, 1)
        ELSE round((bloat_pages::numeric / expected_pages::numeric)::numeric, 1)
      END AS bloat_ratio
    FROM table_bloat
    CROSS JOIN constants
    WHERE bloat_pages > 0
  `,

  unusedIndexes: `
    SELECT 
      schemaname as schema,
      tablename as table,
      indexname as index,
      pg_size_pretty(pg_relation_size(indexrelid::regclass)) as index_size
    FROM pg_stat_user_indexes
    WHERE idx_scan = 0
      AND schemaname NOT IN ('pg_catalog', 'pg_toast')
    ORDER BY pg_relation_size(indexrelid::regclass) DESC
    LIMIT 10;
  `,

  missingForeignKeys: `
    SELECT DISTINCT
      c.conrelid::regclass as table,
      a.attname as column,
      c.conname as foreign_key,
      c.confrelid::regclass as referenced_table
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attnum = ANY(c.conkey) AND a.attrelid = c.conrelid
    LEFT JOIN pg_index i ON c.conrelid = i.indrelid AND a.attnum = ANY(i.indkey)
    WHERE c.contype = 'f'
      AND i.indrelid IS NULL
    ORDER BY c.conrelid::regclass::text, a.attname;
  `,
};