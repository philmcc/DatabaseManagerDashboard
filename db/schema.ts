import { pgTable, text, serial, timestamp, integer, boolean, primaryKey, jsonb, numeric, json } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { relations } from "drizzle-orm";

// Base tables
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").unique().notNull(),
  password: text("password").notNull(),
  resetToken: text("resetToken"),
  resetTokenExpiry: timestamp("resetTokenExpiry"),
  fullName: text("fullName"),
  bio: text("bio"),
  avatar: text("avatar"),
  theme: text("theme").default("light"),
  updatedAt: timestamp("updatedAt").defaultNow(),
});

export const clusters = pgTable("clusters", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  userId: integer("userId").notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
});

export const instances = pgTable("instances", {
  id: serial("id").primaryKey(),
  hostname: text("hostname").notNull(),
  port: integer("port").notNull(),
  username: text("username").notNull(),
  password: text("password").notNull(),
  description: text("description"),
  isWriter: boolean("is_writer").default(false),
  defaultDatabaseName: text("default_database_name"),
  clusterId: integer("cluster_id").notNull().references(() => clusters.id, { onDelete: 'cascade' }),
  userId: integer("userId").notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
});

export const databaseConnections = pgTable("database_connections", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  instanceId: integer("instance_id").notNull().references(() => instances.id, { onDelete: 'cascade' }),
  username: text("username").notNull(),
  password: text("password").notNull(),
  databaseName: text("database_name").notNull(),
  userId: integer("userId").notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
});

export const tags = pgTable("tags", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  createdAt: timestamp("createdAt").defaultNow(),
  userId: integer("userId").notNull().references(() => users.id, { onDelete: 'cascade' }),
});

// Junction tables
export const databaseTags = pgTable("database_tags", {
  databaseId: integer("database_id").notNull().references(() => databaseConnections.id, { onDelete: 'cascade' }),
  tagId: integer("tag_id").notNull().references(() => tags.id, { onDelete: 'cascade' }),
}, (table) => ({
  pk: primaryKey({ columns: [table.databaseId, table.tagId] }),
}));

// Add relations for tags
export const databaseTagsRelations = relations(databaseTags, ({ one }) => ({
  database: one(databaseConnections, {
    fields: [databaseTags.databaseId],
    references: [databaseConnections.id],
  }),
  tag: one(tags, {
    fields: [databaseTags.tagId],
    references: [tags.id],
  }),
}));

// Relations
export const userRelations = relations(users, ({ many }) => ({
  databaseConnections: many(databaseConnections),
  tags: many(tags),
  clusters: many(clusters),
  instances: many(instances),
}));

export const clusterRelations = relations(clusters, ({ one, many }) => ({
  user: one(users, {
    fields: [clusters.userId],
    references: [users.id],
  }),
  instances: many(instances),
}));

export const instanceRelations = relations(instances, ({ one, many }) => ({
  cluster: one(clusters, {
    fields: [instances.clusterId],
    references: [clusters.id],
  }),
  user: one(users, {
    fields: [instances.userId],
    references: [users.id],
  }),
  databases: many(databaseConnections),
}));

export const databaseConnectionRelations = relations(databaseConnections, ({ one, many }) => ({
  user: one(users, {
    fields: [databaseConnections.userId],
    references: [users.id],
  }),
  instance: one(instances, {
    fields: [databaseConnections.instanceId],
    references: [instances.id],
  }),
  tags: many(databaseTags),
}));

export const tagsRelations = relations(tags, ({ one, many }) => ({
  user: one(users, {
    fields: [tags.userId],
    references: [users.id],
  }),
  databases: many(databaseTags),
}));


export const databaseOperationLogs = pgTable("database_operation_logs", {
  id: serial("id").primaryKey(),
  databaseId: integer("database_id").references(() => databaseConnections.id, { onDelete: 'cascade' }),
  userId: integer("userId").notNull().references(() => users.id, { onDelete: 'cascade' }),
  operationType: text("operation_type").notNull(),
  operationResult: text("operation_result").notNull(),
  details: jsonb("details").notNull(),
  timestamp: timestamp("timestamp").defaultNow(),
});

export const databaseMetrics = pgTable("database_metrics", {
  id: serial("id").primaryKey(),
  databaseId: integer("database_id").notNull().references(() => databaseConnections.id, { onDelete: 'cascade' }),
  timestamp: timestamp("timestamp").defaultNow(),
  activeConnections: integer("active_connections").notNull(),
  databaseSize: numeric("database_size").notNull(),
  slowQueries: integer("slow_queries").notNull(),
  avgQueryTime: numeric("avg_query_time").notNull(),
  cacheHitRatio: numeric("cache_hit_ratio").notNull(),
  metrics: json("metrics").notNull(),
});

// Add relations for the new tables
export const databaseOperationLogsRelations = relations(databaseOperationLogs, ({ one }) => ({
  database: one(databaseConnections, {
    fields: [databaseOperationLogs.databaseId],
    references: [databaseConnections.id],
  }),
  user: one(users, {
    fields: [databaseOperationLogs.userId],
    references: [users.id],
  }),
}));

export const databaseMetricsRelations = relations(databaseMetrics, ({ one }) => ({
  database: one(databaseConnections, {
    fields: [databaseMetrics.databaseId],
    references: [databaseConnections.id],
  }),
}));

// Schema validation
export const insertUserSchema = createInsertSchema(users);
export const selectUserSchema = createSelectSchema(users);

export const insertTagSchema = createInsertSchema(tags);
export const selectTagSchema = createSelectSchema(tags);

export const insertDatabaseConnectionSchema = createInsertSchema(databaseConnections);
export const selectDatabaseConnectionSchema = createSelectSchema(databaseConnections);

export const insertClusterSchema = createInsertSchema(clusters);
export const selectClusterSchema = createSelectSchema(clusters);

export const insertInstanceSchema = createInsertSchema(instances);
export const selectInstanceSchema = createSelectSchema(instances);

// Types
export type InsertUser = typeof users.$inferInsert;
export type SelectUser = typeof users.$inferSelect;

export type InsertTag = typeof tags.$inferInsert;
export type SelectTag = typeof tags.$inferSelect;

export type InsertDatabaseConnection = typeof databaseConnections.$inferInsert;
export type SelectDatabaseConnection = typeof databaseConnections.$inferSelect;

export type InsertCluster = typeof clusters.$inferInsert;
export type SelectCluster = typeof clusters.$inferSelect;

export type InsertInstance = typeof instances.$inferInsert;
export type SelectInstance = typeof instances.$inferSelect;