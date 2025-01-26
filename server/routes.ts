import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { db } from "@db";
import { users, databaseConnections, tags, databaseTags, databaseOperationLogs } from "@db/schema";
import { eq, and } from "drizzle-orm";
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
      const [database] = await db
        .select()
        .from(databaseConnections)
        .where(
          and(
            eq(databaseConnections.id, parseInt(id)),
            eq(databaseConnections.userId, req.user.id)
          )
        )
        .limit(1);

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
      const { name, host, port, username, password, databaseName, tags: tagIds } = req.body;

      // Test connection first
      const client = new Client({
        host,
        port,
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
            connectionDetails: { name, host, port, username, databaseName }
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
          host,
          port,
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
          host: newDatabase.host,
          port: newDatabase.port,
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
      const { name, host, port, username, password, databaseName, tags: tagIds } = req.body;

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

      // Get existing tags
      const existingTags = await db
        .select()
        .from(databaseTags)
        .where(eq(databaseTags.databaseId, parseInt(id)));

      const existingTagIds = existingTags.map(t => t.tagId);
      const newTagIds = tagIds || [];

      // Test connection first
      const client = new Client({
        host,
        port,
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
              host: existingDatabase.host,
              port: existingDatabase.port,
              username: existingDatabase.username,
              databaseName: existingDatabase.databaseName,
              tags: existingTagIds
            },
            attempted: {
              name,
              host,
              port,
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
          host,
          port,
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
            host: existingDatabase.host,
            port: existingDatabase.port,
            username: existingDatabase.username,
            databaseName: existingDatabase.databaseName,
            tags: getTagNames(existingTagIds)
          },
          after: {
            name: updatedDatabase.name,
            host: updatedDatabase.host,
            port: updatedDatabase.port,
            username: updatedDatabase.username,
            databaseName: updatedDatabase.databaseName,
            tags: getTagNames(newTagIds)
          }
        },
      });

      // Return updated database with tags
      const databaseWithTags = {
        ...updatedDatabase,
        tags: tagIds.map((tagId: number) => ({ tagId }))
      };

      res.json(databaseWithTags);
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
      let whereConditions = [];
      if (databaseId) {
        whereConditions.push(eq(databaseOperationLogs.databaseId, databaseId));
      }
      if (tagId) {
        // Join with database_tags to filter by tag
        // This requires a more complex query since we need to join through databaseConnections
        const databasesWithTag = db
          .select({ id: databaseConnections.id })
          .from(databaseConnections)
          .innerJoin(databaseTags, eq(databaseConnections.id, databaseTags.databaseId))
          .where(eq(databaseTags.tagId, tagId));

        whereConditions.push(sql`database_operation_logs.database_id IN (${databasesWithTag})`);
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

  const httpServer = createServer(app);
  return httpServer;
}