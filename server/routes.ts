import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { db } from "@db";
import { users, databaseConnections, tags, databaseTags, databaseOperationLogs, databaseMetrics, clusters, instances } from "@db/schema";
import { eq, and, ne, sql, desc } from "drizzle-orm";
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

      // First check if database exists and user has access
      let whereCondition;
      if (req.user.role === 'ADMIN') {
        whereCondition = eq(databaseConnections.id, parsedId);
      } else {
        whereCondition = and(
          eq(databaseConnections.id, parsedId),
          eq(databaseConnections.userId, req.user.id)
        );
      }

      const dbConnection = await db.query.databaseConnections.findFirst({
        where: whereCondition,
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
        return res.status(403).json({
          message: "You don't have access to this database connection",
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
    try {
      const { id } = req.params;
      const parsedId = parseInt(id);

      console.log(`Fetching metrics for database ID: ${parsedId}, User: ${req.user.id} (${req.user.role})`);

      // Get database connection details with instance
      const dbConnection = await db.query.databaseConnections.findFirst({
        where: and(
          eq(databaseConnections.id, parsedId),
          // For non-admin users, check ownership
          req.user.role === 'ADMIN' ? undefined : eq(databaseConnections.userId, req.user.id)
        ),
        with: {
          instance: {
            columns: {
              hostname: true,
              port: true,
              username: true,
              password: true,
            },
          },
        },
        columns: {
          id: true,
          name: true,
          username: true,
          password: true,
          databaseName: true,
          instanceId: true,
          userId: true,
        },
      });

      console.log('Database connection query result:', dbConnection);

      if (!dbConnection) {
        console.log('Database connection not found or access denied');
        return res.status(404).send("Database connection not found or you don't have access to it");
      }

      const instance = dbConnection.instance;
      if (!instance) {
        console.log('Associated instance not found');
        return res.status(404).send("Associated instance not found");
      }

      console.log('Found database connection:', {
        id: dbConnection.id,
        name: dbConnection.name,
        instanceId: dbConnection.instanceId,
        databaseName: dbConnection.databaseName,
        instance: {
          hostname: instance.hostname,
          port: instance.port,
        }
      });

      // Get the latest metrics
      const latestMetrics = await db
        .select()
        .from(databaseMetrics)
        .where(eq(databaseMetrics.databaseId, parsedId))
        .orderBy(desc(databaseMetrics.timestamp))
        .limit(1);

      // If no metrics exist yet, collect them
      if (!latestMetrics.length) {
        console.log('No existing metrics found, collecting new metrics');

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
          console.log('Connected to database for metrics collection');

          const metrics: any = {};

          // Get active connections
          const connectionsResult = await client.query(
            "SELECT count(*) as count FROM pg_stat_activity WHERE state = 'active'"
          );
          metrics.activeConnections = parseInt(connectionsResult.rows[0].count);

          // Get database size
          const sizeResult = await client.query(
            "SELECT pg_database_size($1) as size",
            [dbConnection.databaseName]
          );
          metrics.databaseSize = parseInt(sizeResult.rows[0].size);

          // Get slow queries (queries taking more than 1000ms)
          const slowQueriesResult = await client.query(
            "SELECT count(*) as count FROM pg_stat_activity WHERE state = 'active' AND now() - query_start > interval '1 second'"
          );
          metrics.slowQueries = parseInt(slowQueriesResult.rows[0].count);

          // Get cache hit ratio
          const cacheResult = await client.query(`
            SELECT
              CASE WHEN sum(heap_blks_hit) + sum(heap_blks_read) = 0 
                   THEN 0
                   ELSE sum(heap_blks_hit)::float / (sum(heap_blks_hit) + sum(heap_blks_read))
              END as ratio
            FROM pg_statio_user_tables
          `);
          metrics.cacheHitRatio = parseFloat(cacheResult.rows[0].ratio || 0);

          // Get average query time
          const avgTimeResult = await client.query(`
            SELECT coalesce(avg(total_exec_time), 0) as avg_time
            FROM pg_stat_statements
            WHERE calls > 0
          `);
          metrics.avgQueryTime = parseFloat(avgTimeResult.rows[0].avg_time || 0);

          await client.end();
          console.log('Metrics collected successfully:', metrics);

          // Store the metrics
          const [newMetrics] = await db
            .insert(databaseMetrics)
            .values({
              databaseId: parsedId,
              activeConnections: metrics.activeConnections,
              databaseSize: metrics.databaseSize.toString(),
              slowQueries: metrics.slowQueries,
              avgQueryTime: metrics.avgQueryTime.toString(),
              cacheHitRatio: metrics.cacheHitRatio.toString(),
              metrics: metrics,
            })
            .returning();

          res.json(newMetrics);
        } catch (error: any) {
          console.error("Metrics collection error:", error);
          res.status(500).json({
            message: "Failed to collect metrics",
            error: error.message
          });
        } finally {
          try {
            await client.end();
          } catch (e) {
            console.error("Error closing client:", e);
          }
        }
      } else {
        console.log('Returning existing metrics');
        res.json(latestMetrics[0]);
      }
    } catch (error) {
      console.error("Metrics fetch error:", error);
      res.status(500).send("Error fetching metrics");
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