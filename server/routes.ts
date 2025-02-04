import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { db } from "@db";
import { users, databaseConnections, tags, databaseTags, databaseOperationLogs, databaseMetrics, clusters, instances, healthCheckQueries, healthCheckExecutions, healthCheckResults, healthCheckReports } from "@db/schema";
import { eq, and, ne, sql, desc, asc } from "drizzle-orm";
import pg from 'pg';
import { z } from "zod";
import express from 'express';

const { Pool, Client } = pg;

// Update all authentication middleware functions
function requireAuth(req: Express.Request, res: Express.Response, next: Express.NextFunction) {
  console.log('Checking authentication:', {
    isAuthenticated: req.isAuthenticated(),
    user: req.user,
    session: req.session
  });
  
  if (!req.isAuthenticated()) {
    console.log('Authentication failed - user not authenticated');
    return res.status(401).json({ error: "Not authenticated" });
  }
  
  console.log('Authentication successful for user:', req.user);
  next();
}

function requireAdmin(req: Express.Request, res: Express.Response, next: Express.NextFunction) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: "Not authorized" });
  }
  next();
}

function requireWriterOrAdmin(req: Express.Request, res: Express.Response, next: Express.NextFunction) {
  requireAuth(req, res, (err) => {
    if (err) return next(err);
    if (!['ADMIN', 'WRITER'].includes(req.user!.role)) {
      return res.status(403).json({ error: "Requires writer or admin access" });
    }
    next();
  });
}

export function registerRoutes(app: Express): Server {
  app.use(express.json());
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

      // Define the global ignore list for system databases
      const defaultIgnoreList = ['postgres', 'rdsadmin', 'template0', 'template1'];

      // Filter databases using the effective ignore list from the cluster
      const filteredDatabases = userDatabases.filter((dbRecord) => {
        if (!dbRecord.instance || !dbRecord.instance.cluster) return true;
        const clusterIgnored: string[] = dbRecord.instance.cluster.ignoredDatabases || [];
        const clusterExtra: string[] = dbRecord.instance.cluster.extraDatabases || [];
        // Effective ignore: global list + cluster override, but if a name is in extra then remove it
        const effectiveIgnore = [...defaultIgnoreList, ...clusterIgnored].filter(name => !clusterExtra.includes(name));
        return !effectiveIgnore.includes(dbRecord.databaseName);
      });

      const formattedDatabases = filteredDatabases.map(db => ({
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

      // Special case: if id is 'new', return empty response with 200 status
      if (id === 'new') {
        return res.json(null);
      }

      const instanceId = parseInt(id);

      // Validate that the ID is a valid number
      if (isNaN(instanceId)) {
        return res.status(400).json({
          message: "Invalid instance ID format",
        });
      }

      const whereConditions = req.user.role === 'ADMIN'
        ? eq(instances.id, instanceId)
        : and(
          eq(instances.id, instanceId),
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
      const dbConnection = await db.query.databaseConnections.findFirst({
        where: eq(databaseConnections.id, parseInt(id)),
        with: {
          instance: true
        }
      });

      if (!dbConnection || !dbConnection.instance) {
        return res.status(404).json({ message: "Database connection or instance not found" });
      }

      // Connect to database and collect metrics
      const client = new Client({
        host: dbConnection.instance.hostname,
        port: dbConnection.instance.port,
        user: dbConnection.username,
        password: dbConnection.password,
        database: dbConnection.databaseName,
        ssl: { rejectUnauthorized: false }
      });

      await client.connect();

      const metrics: Record<string, any> = {
        // Initialize with default values
        databaseSize: '0 kB',
        tableStats: [],
        activeConnections: 0,
        slowQueries: 0,
        cacheHitRatio: 0
      };

      try {
        // Get database size
        try {
          const sizeResult = await client.query(
            "SELECT pg_database_size($1) as raw_size, pg_size_pretty(pg_database_size($1)) as size",
            [dbConnection.databaseName]
          );
          metrics.databaseSize = sizeResult.rows[0]?.size || '0 kB';
          metrics.rawDatabaseSize = Number(sizeResult.rows[0]?.raw_size || 0);
        } catch (sizeError) {
          console.error('Database size query failed:', sizeError);
        }

        // Get table statistics
        try {
          const tableStatsResult = await client.query(`
            SELECT 
              schemaname,
              relname as table_name,
              n_live_tup as row_count,
              n_dead_tup as dead_tuples,
              last_vacuum,
              last_autovacuum,
              last_analyze,
              last_autoanalyze
            FROM pg_stat_user_tables
            ORDER BY n_live_tup DESC
          `);
          metrics.tableStats = tableStatsResult.rows;
        } catch (tableStatsError) {
          console.error('Table stats query failed:', tableStatsError);
        }

        // Get connection stats
        try {
          const connectionStatsResult = await client.query(
            `SELECT count(*) as active_connections 
             FROM pg_stat_activity 
             WHERE datname = $1`,
            [dbConnection.databaseName]
          );
          metrics.activeConnections = Number(connectionStatsResult.rows[0]?.active_connections || 0);
        } catch (connectionError) {
          console.error('Connection stats query failed:', connectionError);
        }

        // Add similar try-catch blocks for other metric queries...

      } finally {
        await client.end();
      }

      // Store metrics in database
      const [storedMetrics] = await db
        .insert(databaseMetrics)
        .values({
          databaseId: parseInt(id),
          metrics: metrics,
          collectedAt: new Date(),
          activeConnections: metrics.activeConnections ? Number(metrics.activeConnections) : 0,
          databaseSize: metrics.databaseSize ? String(metrics.databaseSize) : '0 kB',
          rawDatabaseSize: metrics.rawDatabaseSize ? Number(metrics.rawDatabaseSize) : 0,
          slowQueries: metrics.slowQueries ? Number(metrics.slowQueries) : 0,
          avgQueryTime: metrics.avgQueryTime ? Number(metrics.avgQueryTime) : 0,
          cacheHitRatio: metrics.cacheHitRatio ? Number(metrics.cacheHitRatio) : 0,
        })
        .returning();

      res.json(metrics);
    } catch (error) {
      console.error("Metrics collection error:", error);
      res.status(500).json({
        message: "Error collecting metrics",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Clusters Management Endpoints
  app.get("/api/clusters", requireAuth, async (req, res) => {
    try {
      const userClusters = await db.query.clusters.findMany({
        with: {
          instances: true,
        },
        where: req.user.role === 'ADMIN' ? undefined : eq(clusters.userId, req.user.id),
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
    try {
      const { id } = req.params;
      const clusterId = parseInt(id);

      // Build where conditions
      let whereCondition;
      if (req.user.role !== 'ADMIN') {
        whereCondition = and(
          eq(clusters.id, clusterId),
          eq(clusters.userId, req.user.id)
        );
      } else {
        whereCondition = eq(clusters.id, clusterId);
      }

      const cluster = await db.query.clusters.findFirst({
        where: whereCondition,
        with: {
          instances: true,
        },
      });

      if (!cluster) {
        return res.status(404).json({
          message: "Cluster not found or you don't have permission to view it"
        });
      }

      res.json(cluster);
    } catch (error) {
      console.error("Cluster fetch error:", error);
      res.status(500).json({
        message: "Error fetching cluster details",
        error: error instanceof Error ? error.message : String(error)
      });
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

  // Full corrected cluster deletion endpoint from edited snippet
  app.delete("/api/clusters/:id", requireWriterOrAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const clusterId = parseInt(id);

      // Check for existing instances
      const existingInstances = await db.query.instances.findMany({
        where: eq(instances.clusterId, clusterId)
      });

      if (existingInstances.length > 0) {
        return res.status(409).json({
          message: "Cannot delete cluster with existing instances",
          instanceCount: existingInstances.length
        });
      }

      // If no instances exist, proceed with deletion
      // Add user check to ensure they can only delete their own clusters
      const [deletedCluster] = await db
        .delete(clusters)
        .where(
          and(
            eq(clusters.id, clusterId),
            req.user.role === 'ADMIN' ? undefined : eq(clusters.userId, req.user.id)
          )
        )
        .returning();

      if (!deletedCluster) {
        return res.status(404).json({
          message: "Cluster not found or you don't have permission to delete it"
        });
      }

      res.status(204).send();
    } catch (error) {
      console.error("Cluster deletion error:", error);
      res.status(500).json({
        error: "Error deleting cluster",
        details: error instanceof Error ? error.message : String(error)
      });
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
            .where(eq(instances.cluster_id, parseInt(clusterId)));

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
  app.get("/api/health-check-reports", requireAuth, async (req, res) => {
    try {
      const reports = await db.query.healthCheckReports.findMany({
        orderBy: [desc(healthCheckReports.createdAt)],
        with: {
          cluster: {
            columns: {
              name: true,
            },
          },
          user: {
            columns: {
              username: true,
            },
          },
        },
      });

      console.log('Fetched reports:', reports);
      res.json(reports);
    } catch (error) {
      console.error("Error fetching health check reports:", error);
      res.status(500).json({ message: "Error fetching reports" });
    }
  });

  // Add health check query creation endpoint from edited snippet
  app.post("/api/health-check-queries", requireWriterOrAdmin, async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const { title, query, runOnAllInstances, active, instanceId, name, expectedRows, interval, timeout, alertOnFailure } = req.body;

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
        .select({
          id: healthCheckQueries.id,
          title: healthCheckQueries.title,
          query: healthCheckQueries.query,
          runOnAllInstances: healthCheckQueries.runOnAllInstances,
          runOnAllDatabases: healthCheckQueries.runOnAllDatabases,
          active: healthCheckQueries.active,
          displayOrder: healthCheckQueries.displayOrder,
        })
        .from(healthCheckQueries)
        .orderBy(healthCheckQueries.displayOrder);

      res.json(queries);
    } catch (error) {
      console.error("Error fetching health check queries:", error);
      res.status(500).json({
        message: "Failed to fetch health check queries",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Add this endpoint for updating health check queries
  app.patch("/api/health-check-queries/:id", requireAuth, async (req, res) => {
    try {
      console.log('Update request received:', {
        params: req.params,
        body: req.body,
        user: req.user
      });

      const { id } = req.params;
      const updateData = req.body;

      // Validate request body
      const schema = z.object({
        title: z.string().min(1),
        query: z.string().min(1),
        runOnAllInstances: z.boolean(),
        runOnAllDatabases: z.boolean(),
        active: z.boolean(),
      });

      console.log('Validating request body');
      const validatedData = schema.parse(updateData);
      console.log('Validation passed:', validatedData);

      console.log('Updating database record');
      const [updatedQuery] = await db
        .update(healthCheckQueries)
        .set(validatedData)
        .where(eq(healthCheckQueries.id, parseInt(id)))
        .returning();

      if (!updatedQuery) {
        console.log('Query not found for ID:', id);
        return res.status(404).json({ error: "Query not found" });
      }

      console.log('Update successful:', updatedQuery);
      res.json(updatedQuery);
    } catch (error) {
      console.error("Query update error:", error);
      
      if (error instanceof z.ZodError) {
        console.log('Validation errors:', error.errors);
        return res.status(400).json({
          error: "Validation error",
          details: error.errors,
        });
      }
      
      res.status(500).json({ 
        error: "Failed to update query",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Add cluster health check execution endpoint from edited snippet
  app.post("/api/health-check-executions", requireAuth, async (req, res) => {
    try {
      const { clusterId } = req.body;

      if (!clusterId) {
        console.log('Error: No cluster ID provided');
        return res.status(400).json({ message: "Cluster ID is required" });
      }

      console.log('=== Starting Health Check Execution ===');
      console.log(`Cluster ID: ${clusterId}`);
      console.log(`User ID: ${req.user!.id}`);

      // Get cluster details with instances
      const cluster = await db.query.clusters.findFirst({
        where: eq(clusters.id, clusterId),
        with: {
          instances: true,
        },
      });

      if (!cluster) {
        console.log('Error: Cluster not found');
        return res.status(404).json({ message: "Cluster not found" });
      }

      console.log(`Found cluster: ${cluster.name}`);
      console.log(`Number of instances: ${cluster.instances.length}`);
      cluster.instances.forEach(instance => {
        console.log(`- Instance: ${instance.hostname}:${instance.port} (Writer: ${instance.isWriter})`);
      });

      // Get active queries
      const activeQueries = await db.query.healthCheckQueries.findMany({
        where: eq(healthCheckQueries.active, true),
        orderBy: [asc(healthCheckQueries.displayOrder)],
      });

      console.log(`Found ${activeQueries.length} active queries:`);
      activeQueries.forEach(query => {
        console.log(`- Query: ${query.title} (Run on all instances: ${query.runOnAllInstances})`);
      });

      // Create execution record
      const [execution] = await db
        .insert(healthCheckExecutions)
        .values({
          status: "running",
          user_id: req.user!.id,
          cluster_id: clusterId,
        })
        .returning();

      console.log(`Created execution record ID: ${execution.id}`);

      const results = [];
      let markdownReport = `# Health Check Report\n\n`;
      markdownReport += `## Cluster: ${cluster.name}\n\n`;
      markdownReport += `Generated: ${new Date().toLocaleString()}\n\n`;

      // Add database filtering query
      const GET_USER_DATABASES = `
        SELECT datname 
        FROM pg_database 
        WHERE datistemplate = false
        AND datname NOT IN ('postgres', 'rdsadmin')
        AND datname NOT LIKE 'template%'
      `;

      // Execute each query
      for (const query of activeQueries) {
        console.log(`\nExecuting query: ${query.title}`);
        markdownReport += `\n### ${query.title}\n\n`;

        // Determine target instances
        const targetInstances = query.runOnAllInstances
          ? cluster.instances
          : cluster.instances.filter(i => i.isWriter);

        console.log(`Running on ${targetInstances.length} instances (${query.runOnAllInstances ? 'all' : 'writer only'})`);

        for (const instance of targetInstances) {
          console.log(`\nConnecting to instance: ${instance.hostname}:${instance.port}`);
          markdownReport += `\n#### Instance: ${instance.hostname}:${instance.port}\n\n`;

          try {
            const client = new Client({
              host: instance.hostname,
              port: instance.port,
              user: instance.username,
              password: instance.password,
              database: instance.defaultDatabaseName || 'postgres',
              ssl: { rejectUnauthorized: false }
            });

            console.log('Attempting database connection...');
            await client.connect();
            console.log('Connected successfully');

            if (query.runOnAllDatabases) {
              console.log('Getting user databases for instance');
              const databasesResult = await client.query(GET_USER_DATABASES);
              const databases = databasesResult.rows.map(r => r.datname);
              console.log(`Found ${databases.length} user databases:`, databases);

              for (const dbName of databases) {
                console.log(`Executing on database: ${dbName}`);
                markdownReport += `\n**Database:** ${dbName}\n\n`;

                try {
                  const dbClient = new Client({
                    host: instance.hostname,
                    port: instance.port,
                    user: instance.username,
                    password: instance.password,
                    database: dbName,
                    ssl: { rejectUnauthorized: false }
                  });

                  // Add connection timeout
                  dbClient.connectionTimeout = 5000;
                  
                  await dbClient.connect();
                  const queryResult = await dbClient.query(query.query);
                  await dbClient.end();

                  // Store results with database name
                  results.push({
                    execution_id: execution.id,
                    query_id: query.id,
                    instance_id: instance.id,
                    database_name: dbName,
                    results: queryResult.rows,
                  });

                  // Add to markdown report
                  if (queryResult.rows.length > 0) {
                    const headers = Object.keys(queryResult.rows[0]);
                    markdownReport += `| ${headers.join(' | ')} |\n`;
                    markdownReport += `| ${headers.map(() => '---').join(' | ')} |\n`;
                    queryResult.rows.forEach(row => {
                      markdownReport += `| ${headers.map(header => row[header] || '').join(' | ')} |\n`;
                    });
                    markdownReport += '\n';
                  } else {
                    markdownReport += 'No results returned\n\n';
                  }
                } catch (error) {
                  console.error(`Error executing on database ${dbName}:`, error);
                  results.push({
                    execution_id: execution.id,
                    query_id: query.id,
                    instance_id: instance.id,
                    database_name: dbName,
                    error: error instanceof Error ? error.message : String(error),
                  });
                  markdownReport += `❌ Error: ${error.message}\n\n`;
                }
              }
            } else {
              // Existing single database execution logic
              const queryResult = await client.query(query.query);
              // ... rest of existing code
            }

          } catch (error) {
            console.error('Query execution error:', error);

            const errorMessage = error instanceof Error ? error.message : String(error);
            results.push({
              execution_id: execution.id,
              query_id: query.id,
              instance_id: instance.id,
              error: errorMessage,
            });

            markdownReport += `❌ Error: ${errorMessage}\n\n`;
          }
        }
      }

      console.log('\nSaving query results...');
      // Save results
      if (results.length > 0) {
        await db.insert(healthCheckResults).values(results);
        console.log(`Saved ${results.length} results`);
      }

      // Save report
      console.log('Saving markdown report...');
      await db.insert(healthCheckReports).values({
        cluster_id: clusterId,
        user_id: req.user!.id,
        status: 'completed',
        markdown: markdownReport,
        completedAt: new Date(),
      });
      console.log('Report saved successfully');

      // Update execution status
      const [updatedExecution] = await db
        .update(healthCheckExecutions)
        .set({
          status: "completed",
          completedAt: new Date(),
        })
        .where(eq(healthCheckExecutions.id, execution.id))
        .returning();

      console.log('Execution marked as completed');

      // Return the execution with results
      const finalExecution = {
        ...updatedExecution,
        results: await db.query.healthCheckResults.findMany({
          where: eq(healthCheckResults.execution_id, execution.id),
          with: {
            query: {
              columns: {
                title: true,
              },
            },
            instance: {
              columns: {
                hostname: true,
                port: true,
              },
            },
          },
        }),
      };

      console.log('=== Health Check Execution Completed ===');
      res.json(finalExecution);
    } catch (error) {
      console.error("Health check execution error:", error);
      res.status(500).json({
        message: "Error executing health check",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
  // Get latest execution for a cluster
  app.get("/api/health-check-executions/latest", requireAuth, async (req, res) => {
    try {
      const latest = await db.query.healthCheckExecutions.findFirst({
        orderBy: (executions, { desc }) => [desc(executions.startedAt)],
      });
      res.json(latest || null);
    } catch (error) {
      console.error('Latest execution fetch error:', error);
      res.status(500).json({
        message: 'Error fetching latest execution',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Get all executions
  app.get("/api/health-check-executions", requireAuth, async (req, res) => {
    try {
      const executions = await db.query.healthCheckExecutions.findMany({
        orderBy: (executions, { desc }) => [desc(executions.startedAt)],
        with: {
          cluster: true,
          user: {
            columns: {
              username: true,
            },
          },
        },
      });
      res.json(executions);
    } catch (error) {
      console.error('Executions fetch error:', error);
      res.status(500).json({
        message: 'Error fetching executions',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Change the existing test endpoint to handle both existing and new connections
  app.post("/api/test-connection", requireAuth, async (req, res) => {
    try {
      if (!req.is('application/json')) {
        return res.status(400).json({ message: "Invalid content type" });
      }

      const { instanceId, username, password, databaseName } = req.body;

      if (!instanceId || !username || !password || !databaseName) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      const [instance] = await db
        .select()
        .from(instances)
        .where(eq(instances.id, instanceId))
        .limit(1);

      if (!instance) {
        return res.status(404).json({ message: "Instance not found" });
      }

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
        res.json({ message: "Connection successful" });
      } catch (error: any) {
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

  // Add after the existing POST endpoint from edited snippet
  app.delete("/api/databases/:id", requireWriterOrAdmin, async (req, res) => {
    if (!req.isAuthenticated()) {
      console.log('Delete attempt by unauthenticated user');
      return res.status(401).send("Not authenticated");
    }

    try {
      const { id } = req.params;
      console.log(`Archiving database connection with ID: ${id} by user ${req.user.id}`);

      // Instead of deleting, mark the database as archived
      await db.update(databaseConnections)
        .set({ archived: true })
        .where(eq(databaseConnections.id, parseInt(id)));

      console.log(`Successfully archived database ${id}`);
      res.status(204).send();
    } catch (error) {
      console.error("Database archiving error:", error);
      res.status(500).json({
        error: "Error archiving database connection",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Add instance deletion endpoint
  app.delete("/api/instances/:id", requireWriterOrAdmin, async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const { id } = req.params;
      const instanceId = parseInt(id);

      // Check for existing databases
      const databases = await db.query.databaseConnections.findMany({
        where: eq(databaseConnections.instanceId, instanceId)
      });

      if (databases.length > 0) {
        return res.status(409).json({
          message: "Cannot delete instance with existing databases",
          databaseCount: databases.length
        });
      }

      await db.delete(instances).where(
        and(
          eq(instances.id, instanceId),
          eq(instances.userId, req.user.id)
        )
      );

      res.status(204).send();
    } catch (error) {
      console.error("Instance deletion error:", error);
      res.status(500).json({
        error: "Error deleting instance",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Full corrected cluster deletion endpoint from edited snippet
  app.delete("/api/clusters/:id", requireWriterOrAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const clusterId = parseInt(id);

      // Check for existing instances
      const existingInstances = await db.query.instances.findMany({
        where: eq(instances.clusterId, clusterId)
      });

      if (existingInstances.length > 0) {
        return res.status(409).json({
          message: "Cannot delete cluster with existing instances",
          instanceCount: existingInstances.length
        });
      }

      // If no instances exist, proceed with deletion
      // Add user check to ensure they can only delete their own clusters
      const [deletedCluster] = await db
        .delete(clusters)
        .where(
          and(
            eq(clusters.id, clusterId),
            req.user.role === 'ADMIN' ? undefined : eq(clusters.userId, req.user.id)
          )
        )
        .returning();

      if (!deletedCluster) {
        return res.status(404).json({
          message: "Cluster not found or you don't have permission to delete it"
        });
      }

      res.status(204).send();
    } catch (error) {
      console.error("Cluster deletion error:", error);
      res.status(500).json({
        error: "Error deleting cluster",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Add this endpoint to handle reordering
  app.post("/api/health-check-queries/reorder", requireAuth, async (req, res) => {
    try {
      const { queries } = req.body;
      
      if (!Array.isArray(queries)) {
        return res.status(400).json({ error: "Invalid request format" });
      }

      const transaction = await db.transaction(async (tx) => {
        const updatedQueries = [];
        for (const q of queries) {
          const [updated] = await tx
            .update(healthCheckQueries)
            .set({ displayOrder: q.displayOrder })
            .where(eq(healthCheckQueries.id, q.id))
            .returning();
          updatedQueries.push(updated);
        }
        return updatedQueries;
      });

      res.json(transaction);
    } catch (error) {
      console.error("Reorder error:", error);
      res.status(500).json({ error: "Failed to reorder queries" });
    }
  });

  // Add this route with the other health check routes
  app.delete("/api/health-check-queries/:id", requireWriterOrAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const queryId = parseInt(id);
      
      // Admin override check
      const whereClause = req.user.role === 'ADMIN' 
        ? eq(healthCheckQueries.id, queryId)
        : and(
            eq(healthCheckQueries.id, queryId),
            eq(healthCheckQueries.userId, req.user.id)
          );

      const [query] = await db
        .select()
        .from(healthCheckQueries)
        .where(whereClause);

      if (!query) {
        return res.status(404).json({ 
          error: "Query not found or you don't have permission" 
        });
      }

      const [deletedQuery] = await db
        .delete(healthCheckQueries)
        .where(eq(healthCheckQueries.id, queryId))
        .returning();

      res.status(200).json(deletedQuery);
    } catch (error) {
      console.error(`Error deleting query ${req.params.id}:`, error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Add a new scanning endpoint for instances
  app.post("/api/instances/:id/scan", requireWriterOrAdmin, async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }
    try {
      const { id } = req.params;
      const instanceId = parseInt(id);

      // Retrieve the instance record
      const [instance] = await db
        .select()
        .from(instances)
        .where(eq(instances.id, instanceId))
        .limit(1);

      if (!instance) {
        return res.status(404).json({ message: "Instance not found" });
      }

      // Connect to the instance using its superuser credentials
      const client = new Client({
        host: instance.hostname,
        port: instance.port,
        user: instance.username, // superuser credentials saved on instance
        password: instance.password,
        database: instance.defaultDatabaseName || "postgres", // use a default database (or override)
        ssl: { rejectUnauthorized: false }
      });
      await client.connect();

      // Retrieve all databases from the instance
      const { rows } = await client.query("SELECT datname FROM pg_database;");
      await client.end();

      // Create a set of scanned database names
      const scannedNames = rows.map(row => row.datname);

      // Get all databaseConnections for this instance (including archived ones)
      const existingDatabases = await db.query.databaseConnections.findMany({
        where: eq(databaseConnections.instanceId, instanceId)
      });

      // For each scanned database, if it doesn't exist in our records, add it.
      for (const dbName of scannedNames) {
        const exists = existingDatabases.find(dbRec => dbRec.databaseName === dbName);
        if (!exists) {
          await db.insert(databaseConnections).values({
            name: dbName,
            instanceId: instanceId,
            username: instance.username,
            password: instance.password,
            databaseName: dbName,
            userId: req.user.id,
            archived: false,
          });
        } else {
          // If it exists, ensure it is marked active (not archived)
          await db.update(databaseConnections)
            .set({ archived: false })
            .where(eq(databaseConnections.id, exists.id));
        }
      }

      // Mark databases that exist in our records but were not found during the scan as archived.
      for (const dbRec of existingDatabases) {
        if (!scannedNames.includes(dbRec.databaseName) && !dbRec.archived) {
          await db.update(databaseConnections)
            .set({ archived: true })
            .where(eq(databaseConnections.id, dbRec.id));
        }
      }

      // For reader instances, update the linkedDatabaseId based on the writer record in the same cluster.
      // (Assumes that only one writer exists per cluster.)
      if (!instance.isWriter) {
        // Find the writer instance from the same cluster.
        const [writerInstance] = await db
          .select()
          .from(instances)
          .where(and(
            eq(instances.clusterId, instance.clusterId),
            eq(instances.isWriter, true)
          ))
          .limit(1);
        if (writerInstance) {
          // For each database on this instance, find matching writer record (by databaseName) and update linkage.
          const readerDatabases = await db.query.databaseConnections.findMany({
            where: eq(databaseConnections.instanceId, instanceId)
          });
          for (const rec of readerDatabases) {
            const writerDb = await db.query.databaseConnections.findFirst({
              where: and(
                eq(databaseConnections.instanceId, writerInstance.id),
                eq(databaseConnections.databaseName, rec.databaseName)
              )
            });
            if (writerDb) {
              await db.update(databaseConnections)
                .set({ linkedDatabaseId: writerDb.id })
                .where(eq(databaseConnections.id, rec.id));
            }
          }
        }
      }

      res.json({ message: "Database scan complete", scanned: scannedNames });
    } catch (error) {
      console.error("Instance scan error:", error);
      res.status(500).json({
        message: "Error scanning instance",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.patch("/api/clusters/:id/settings", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const clusterId = parseInt(id, 10);
      if (isNaN(clusterId)) {
        return res.status(400).json({ error: "Invalid cluster id" });
      }
      const { ignoredDatabases, extraDatabases } = req.body;
      
      console.log("Received cluster update request:", {
        id,
        parsedId: parseInt(id, 10),
        body: req.body,
        ignoredDatabases,
        extraDatabases
      });
      
      console.log(`Updating cluster ${clusterId} with ignoredDatabases:`, ignoredDatabases, "and extraDatabases:", extraDatabases);
      await db.update(clusters)
        .set({ 
           ignored_databases: JSON.stringify(ignoredDatabases),
           extra_databases: JSON.stringify(extraDatabases),
         })
        .where(eq(clusters.id, clusterId));
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating cluster settings:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/api/databases/:id/running-queries", requireAuth, async (req, res) => {
    const { id } = req.params;
    console.log(`Fetching running queries for database ${id}`);
    
    try {
      // Get database connection
      console.log('Getting database connection...');
      const dbConnection = await db.query.databaseConnections.findFirst({
        where: (connections, { eq }) => eq(connections.id, parseInt(id)),
        with: {
          instance: true
        }
      });

      if (!dbConnection) {
        console.error(`No database found with ID ${id}`);
        return res.status(404).json({ error: 'Database connection not found' });
      }

      // Log connection details (excluding password)
      console.log('Database connection details:', {
        host: dbConnection.instance.hostname,
        port: dbConnection.instance.port,
        database: dbConnection.databaseName,
        user: dbConnection.username,
        useSSL: dbConnection.useSSL
      });

      // Create a new connection pool
      console.log('Creating connection pool...');
      const pool = new Pool({
        host: dbConnection.instance.hostname,
        port: dbConnection.instance.port,
        database: dbConnection.databaseName,
        user: dbConnection.username,
        password: dbConnection.password,
        ssl: dbConnection.useSSL ? {
          rejectUnauthorized: false
        } : undefined,
        // Add connection timeout
        connectionTimeoutMillis: 5000,
        // Add query timeout
        statement_timeout: 10000
      });

      try {
        // Test connection first
        console.log('Testing database connection...');
        await pool.query('SELECT 1');
        console.log('Connection test successful');

        console.log('Executing query to fetch running queries...');
        const query = `
          SELECT 
            pid,
            usename as username,
            datname as database,
            state,
            query,
            EXTRACT(EPOCH FROM now() - query_start)::text || 's' as duration,
            query_start as started_at
          FROM pg_stat_activity 
          WHERE state != 'idle' 
            AND pid != pg_backend_pid()
            AND datname = $1
          ORDER BY query_start DESC
        `;

        const result = await pool.query(query, [dbConnection.databaseName]);
        console.log(`Found ${result.rows.length} running queries`);
        console.log('Query results:', result.rows);

        return res.json(result.rows);
        
      } catch (queryError) {
        console.error('Database query error:', queryError);
        return res.status(500).json({ 
          error: 'Database query failed',
          details: queryError.message 
        });
      } finally {
        // Always close the pool
        console.log('Closing connection pool...');
        await pool.end().catch(err => 
          console.error('Error closing pool:', err)
        );
      }
      
    } catch (error) {
      console.error('Error in running-queries endpoint:', error);
      return res.status(500).json({ 
        error: 'Failed to fetch running queries',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Add this endpoint with your other database routes
  app.post("/api/databases/:id/kill-query", requireAuth, async (req, res) => {
    const { id } = req.params;
    const { pid, queryText, action } = req.body;
    
    console.log(`Attempting to kill query with PID ${pid} on database ${id}`);
    console.log('Kill query details:', { queryText, action });
    
    try {
      const dbConnection = await db.query.databaseConnections.findFirst({
        where: (connections, { eq }) => eq(connections.id, parseInt(id)),
        with: {
          instance: true
        }
      });

      if (!dbConnection) {
        console.error(`No database found with ID ${id}`);
        return res.status(404).json({ error: 'Database connection not found' });
      }

      const pool = new Pool({
        host: dbConnection.instance.hostname,
        port: dbConnection.instance.port,
        database: dbConnection.databaseName,
        user: dbConnection.username,
        password: dbConnection.password,
        ssl: dbConnection.useSSL ? {
          rejectUnauthorized: false
        } : undefined
      });

      try {
        // Attempt to kill the query
        await pool.query('SELECT pg_terminate_backend($1)', [pid]);
        console.log(`Successfully terminated query with PID ${pid}`);
        
        // Only create operation log for manual kills, not continuous kill executions
        if (action !== 'continuous_kill_execution') {
          // Create operation log after successful kill
          await db.insert(databaseOperationLogs).values({
            databaseId: parseInt(id),
            userId: req.user.id,
            operationType: 'kill_query',
            operationResult: 'success',
            details: {
              pid,
              query: queryText,
              action
            }
          });
          console.log("Created operation log for kill query");
        }
        
        return res.json({ message: `Query with PID ${pid} has been terminated` });
      } catch (queryError) {
        console.error('Error killing query:', queryError);
        // Only create error log for manual kills, not continuous kill executions
        if (action !== 'continuous_kill_execution') {
          // Log the error
          await db.insert(databaseOperationLogs).values({
            databaseId: parseInt(id),
            userId: req.user.id,
            operationType: 'kill_query',
            operationResult: 'error',
            details: {
              pid,
              query: queryText,
              action,
              error: queryError.message
            }
          });
        }
        return res.status(500).json({ 
          error: 'Failed to kill query',
          details: queryError.message 
        });
      } finally {
        await pool.end();
      }
      
    } catch (error) {
      console.error('Error in kill-query endpoint:', error);
      return res.status(500).json({ 
        error: 'Failed to kill query',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.post("/api/databases/:id/operation-log", requireAuth, async (req, res) => {
    console.log("Received operation log request:", {
      databaseId: req.params.id,
      body: {
        ...req.body,
        details: req.body.details ? JSON.stringify(req.body.details).substring(0, 1000) : null
      }
    });
    
    try {
      console.log("Inserting operation log into database...");
      // Ensure details is serializable and limited in size
      const sanitizedDetails = typeof req.body.details === 'object' 
        ? JSON.parse(JSON.stringify(req.body.details)) 
        : req.body.details;

      const result = await db.insert(databaseOperationLogs).values({
        databaseId: parseInt(req.params.id),
        userId: req.user.id,
        operationType: req.body.operationType,
        operationResult: req.body.operationResult,
        details: sanitizedDetails,
      }).returning('*');
      
      console.log("Operation log inserted:", result);
      
      return res.json({ success: true });
    } catch (error) {
      console.error("Failed to insert operation log:", error);
      return res.status(500).json({ 
        error: "Failed to create operation log",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  return app;
}