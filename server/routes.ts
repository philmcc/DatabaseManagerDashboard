import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { db } from "@db";
import { users, databaseConnections, tags, databaseTags } from "@db/schema";
import { eq, and } from "drizzle-orm";
import pkg from 'pg';
const { Client } = pkg;

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

  app.post("/api/databases", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const { name, host, port, username, password, databaseName, tags: tagIds } = req.body;

      // First test the connection
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

      res.status(201).json(newDatabase);
    } catch (error) {
      console.error("Database creation error:", error);
      res.status(500).send("Error creating database connection");
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

  const httpServer = createServer(app);
  return httpServer;
}