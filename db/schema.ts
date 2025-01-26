import { pgTable, text, serial, timestamp, integer, json, decimal } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { relations } from "drizzle-orm";

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

export const tags = pgTable("tags", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  createdAt: timestamp("createdAt").defaultNow(),
  userId: integer("userId").notNull().references(() => users.id, { onDelete: 'cascade' }),
});

export const databaseConnections = pgTable("database_connections", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  host: text("host").notNull(),
  port: integer("port").notNull(),
  username: text("username").notNull(),
  password: text("password").notNull(),
  databaseName: text("database_name").notNull(),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
  userId: integer("userId").notNull().references(() => users.id, { onDelete: 'cascade' }),
});

export const databaseTags = pgTable("database_tags", {
  databaseId: integer("database_id").notNull().references(() => databaseConnections.id, { onDelete: 'cascade' }),
  tagId: integer("tag_id").notNull().references(() => tags.id, { onDelete: 'cascade' }),
});

export const userRelations = relations(users, ({ many }) => ({
  databaseConnections: many(databaseConnections),
  tags: many(tags),
}));

export const databaseConnectionsRelations = relations(databaseConnections, ({ one, many }) => ({
  user: one(users, {
    fields: [databaseConnections.userId],
    references: [users.id],
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

export const databaseOperationLogs = pgTable("database_operation_logs", {
  id: serial("id").primaryKey(),
  databaseId: integer("database_id").references(() => databaseConnections.id, { onDelete: 'cascade' }),
  userId: integer("userId").notNull().references(() => users.id, { onDelete: 'cascade' }),
  operationType: text("operation_type").notNull(),
  operationResult: text("operation_result").notNull(),
  details: json("details"),
  timestamp: timestamp("timestamp").defaultNow(),
});

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

export const databaseMetrics = pgTable("database_metrics", {
  id: serial("id").primaryKey(),
  databaseId: integer("database_id").notNull().references(() => databaseConnections.id, { onDelete: 'cascade' }),
  timestamp: timestamp("timestamp").defaultNow(),
  activeConnections: integer("active_connections"),
  databaseSize: decimal("database_size"),
  slowQueries: integer("slow_queries"),
  avgQueryTime: decimal("avg_query_time"),
  cacheHitRatio: decimal("cache_hit_ratio"),
  metrics: json("metrics").notNull(),
});

export const databaseMetricsRelations = relations(databaseMetrics, ({ one }) => ({
  database: one(databaseConnections, {
    fields: [databaseMetrics.databaseId],
    references: [databaseConnections.id],
  }),
}));

export const insertUserSchema = createInsertSchema(users);
export const selectUserSchema = createSelectSchema(users);

export const insertTagSchema = createInsertSchema(tags);
export const selectTagSchema = createSelectSchema(tags);

export const insertDatabaseConnectionSchema = createInsertSchema(databaseConnections);
export const selectDatabaseConnectionSchema = createSelectSchema(databaseConnections);

export const insertDatabaseOperationLogSchema = createInsertSchema(databaseOperationLogs);
export const selectDatabaseOperationLogSchema = createSelectSchema(databaseOperationLogs);

export const insertDatabaseMetricsSchema = createInsertSchema(databaseMetrics);
export const selectDatabaseMetricsSchema = createSelectSchema(databaseMetrics);

export type InsertUser = typeof users.$inferInsert;
export type SelectUser = typeof users.$inferSelect;

export type InsertTag = typeof tags.$inferInsert;
export type SelectTag = typeof tags.$inferSelect;

export type InsertDatabaseConnection = typeof databaseConnections.$inferInsert;
export type SelectDatabaseConnection = typeof databaseConnections.$inferSelect;

export type InsertDatabaseOperationLog = typeof databaseOperationLogs.$inferInsert;
export type SelectDatabaseOperationLog = typeof databaseOperationLogs.$inferSelect;

export type InsertDatabaseMetrics = typeof databaseMetrics.$inferInsert;
export type SelectDatabaseMetrics = typeof databaseMetrics.$inferSelect;