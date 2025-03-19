import { pgTable, text, serial, timestamp, integer, boolean, primaryKey, jsonb, numeric, json, pgEnum } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { relations } from "drizzle-orm";

// Role enum for user types
export const userRoleEnum = pgEnum('user_role', ['ADMIN', 'WRITER', 'READER']);

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
  role: userRoleEnum("role").default('READER').notNull(),
  isApproved: boolean("is_approved").default(false).notNull(),
  approvedBy: integer("approved_by"),
  approvedAt: timestamp("approved_at"),
  updatedAt: timestamp("updatedAt").defaultNow(),
  isAdmin: boolean("is_admin").default(false),
  isWriter: boolean("is_writer").default(false),
});

export const userRelations = relations(users, ({ one }) => ({
  approvedByUser: one(users, {
    fields: [users.approvedBy],
    references: [users.id],
  }),
}));

// Create schemas and types
export const insertUserSchema = createInsertSchema(users);
export const selectUserSchema = createSelectSchema(users);
export type InsertUser = typeof users.$inferInsert;
export type SelectUser = typeof users.$inferSelect;

export const clusters = pgTable("clusters", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  userId: integer("userId").notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
  ignoredDatabases: jsonb("ignored_databases").default("[]").notNull(),
  extraDatabases: jsonb("extra_databases").default("[]").notNull(),
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
  useSSHTunnel: boolean("use_ssh_tunnel").default(false).notNull(),
  sshHost: text("ssh_host"),
  sshPort: integer("ssh_port").default(22),
  sshUsername: text("ssh_username"),
  sshPassword: text("ssh_password"),
  sshPrivateKey: text("ssh_private_key"),
  sshKeyPassphrase: text("ssh_key_passphrase"),
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
  archived: boolean("archived").default(false).notNull(),
  linkedDatabaseId: integer("linked_database_id").references(() => databaseConnections.id),
  useSSHTunnel: boolean("use_ssh_tunnel").default(false).notNull(),
  sshHost: text("ssh_host"),
  sshPort: integer("ssh_port").default(22),
  sshUsername: text("ssh_username"),
  sshPassword: text("ssh_password"),
  sshPrivateKey: text("ssh_private_key"),
  sshKeyPassphrase: text("ssh_key_passphrase"),
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
  activeConnections: integer("active_connections").notNull().default(0),
  databaseSize: text("database_size").notNull().default('0 kB'),
  rawDatabaseSize: numeric("raw_database_size").notNull().default('0'),
  slowQueries: integer("slow_queries").notNull().default(0),
  avgQueryTime: numeric("avg_query_time").notNull().default(0),
  cacheHitRatio: numeric("cache_hit_ratio").notNull().default(0),
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

// Health check related tables
export const healthCheckQueries = pgTable("health_check_queries", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  query: text("query").notNull(),
  runOnAllInstances: boolean("run_on_all_instances").default(false).notNull(),
  runOnAllDatabases: boolean("run_on_all_databases").default(false).notNull(),
  active: boolean("active").default(true).notNull(),
  displayOrder: integer("display_order").notNull(),
  user_id: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const healthCheckExecutions = pgTable("health_check_executions", {
  id: serial("id").primaryKey(),
  status: text("status").notNull(), // running, completed, failed
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  user_id: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  cluster_id: integer("cluster_id").notNull().references(() => clusters.id, { onDelete: 'cascade' }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const healthCheckResults = pgTable("health_check_results", {
  id: serial("id").primaryKey(),
  execution_id: integer("execution_id").notNull().references(() => healthCheckExecutions.id, { onDelete: 'cascade' }),
  query_id: integer("query_id").notNull().references(() => healthCheckQueries.id, { onDelete: 'cascade' }),
  instance_id: integer("instance_id").notNull().references(() => instances.id, { onDelete: 'cascade' }),
  database_name: text("database_name"),
  results: jsonb("results"),
  error: text("error"),
  executedAt: timestamp("executed_at").defaultNow(),
});

export const healthCheckReports = pgTable("health_check_reports", {
  id: serial("id").primaryKey(),
  cluster_id: integer("cluster_id").notNull().references(() => clusters.id, { onDelete: 'cascade' }),
  user_id: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: text("status").notNull(), // running, completed, failed
  markdown: text("markdown"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Health check system relations
export const healthCheckQueriesRelations = relations(healthCheckQueries, ({ one, many }) => ({
  user: one(users, {
    fields: [healthCheckQueries.user_id],
    references: [users.id],
  }),
  results: many(healthCheckResults),
}));

export const healthCheckExecutionsRelations = relations(healthCheckExecutions, ({ one, many }) => ({
  user: one(users, {
    fields: [healthCheckExecutions.user_id],
    references: [users.id],
  }),
  cluster: one(clusters, {
    fields: [healthCheckExecutions.cluster_id],
    references: [clusters.id],
  }),
  results: many(healthCheckResults),
}));

export const healthCheckResultsRelations = relations(healthCheckResults, ({ one }) => ({
  execution: one(healthCheckExecutions, {
    fields: [healthCheckResults.execution_id],
    references: [healthCheckExecutions.id],
  }),
  query: one(healthCheckQueries, {
    fields: [healthCheckResults.query_id],
    references: [healthCheckQueries.id],
  }),
  instance: one(instances, {
    fields: [healthCheckResults.instance_id],
    references: [instances.id],
  }),
}));

export const healthCheckReportsRelations = relations(healthCheckReports, ({ one }) => ({
  user: one(users, {
    fields: [healthCheckReports.user_id],
    references: [users.id],
  }),
  cluster: one(clusters, {
    fields: [healthCheckReports.cluster_id],
    references: [clusters.id],
  }),
}));

// Generate schemas for all health check tables
export const insertHealthCheckQuerySchema = createInsertSchema(healthCheckQueries);
export const selectHealthCheckQuerySchema = createSelectSchema(healthCheckQueries);
export const insertHealthCheckExecutionSchema = createInsertSchema(healthCheckExecutions);
export const selectHealthCheckExecutionSchema = createSelectSchema(healthCheckExecutions);
export const insertHealthCheckResultSchema = createInsertSchema(healthCheckResults);
export const selectHealthCheckResultSchema = createSelectSchema(healthCheckResults);
export const insertHealthCheckReportSchema = createInsertSchema(healthCheckReports);
export const selectHealthCheckReportSchema = createSelectSchema(healthCheckReports);

// Export types for all health check tables
export type InsertHealthCheckQuery = typeof healthCheckQueries.$inferInsert;
export type SelectHealthCheckQuery = typeof healthCheckQueries.$inferSelect;
export type InsertHealthCheckExecution = typeof healthCheckExecutions.$inferInsert;
export type SelectHealthCheckExecution = typeof healthCheckExecutions.$inferSelect;
export type InsertHealthCheckResult = typeof healthCheckResults.$inferInsert;
export type SelectHealthCheckResult = typeof healthCheckResults.$inferSelect;
export type InsertHealthCheckReport = typeof healthCheckReports.$inferInsert;
export type SelectHealthCheckReport = typeof healthCheckReports.$inferSelect;

// Schema validation
export const insertTagSchema = createInsertSchema(tags);
export const selectTagSchema = createSelectSchema(tags);

export const insertDatabaseConnectionSchema = createInsertSchema(databaseConnections);
export const selectDatabaseConnectionSchema = createSelectSchema(databaseConnections);

export const insertClusterSchema = createInsertSchema(clusters);
export const selectClusterSchema = createSelectSchema(clusters);

export const insertInstanceSchema = createInsertSchema(instances);
export const selectInstanceSchema = createSelectSchema(instances);

// Types
export type InsertTag = typeof tags.$inferInsert;
export type SelectTag = typeof tags.$inferSelect;

export type InsertDatabaseConnection = typeof databaseConnections.$inferInsert;
export type SelectDatabaseConnection = typeof databaseConnections.$inferSelect;

export type InsertCluster = typeof clusters.$inferInsert;
export type SelectCluster = typeof clusters.$inferSelect;

export type InsertInstance = typeof instances.$inferInsert;
export type SelectInstance = typeof instances.$inferSelect;
export type SelectDatabaseOperationLog = {
  id: number;
  databaseId?: number;
  userId: number;
  operationType: string;
  operationResult: string;
  details: any;
  timestamp: Date;
  user?: {
    username: string;
    fullName: string | null;
  };
  database?: {
    name: string;
    host: string;
    port: number;
  };
};

// Add these tables to your schema

export const queryMonitoringConfigs = pgTable("query_monitoring_configs", {
  id: serial("id").primaryKey(),
  databaseId: integer("database_id").notNull().references(() => databaseConnections.id, { onDelete: 'cascade' }),
  isActive: boolean("is_active").notNull().default(false),
  intervalMinutes: integer("interval_minutes").notNull().default(15),
  lastRunAt: timestamp("last_run_at"),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const queryGroups = pgTable("query_groups", {
  id: serial("id").primaryKey(),
  databaseId: integer("database_id").notNull().references(() => databaseConnections.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  description: text("description"),
  isKnown: boolean("is_known").notNull().default(false),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type SelectQueryMonitoringConfig = typeof queryMonitoringConfigs.$inferSelect;
export type SelectQueryGroup = typeof queryGroups.$inferSelect;

// Relations for query monitoring tables
export const queryMonitoringConfigRelations = relations(queryMonitoringConfigs, ({ one }) => ({
  database: one(databaseConnections, {
    fields: [queryMonitoringConfigs.databaseId],
    references: [databaseConnections.id],
  }),
  user: one(users, {
    fields: [queryMonitoringConfigs.userId],
    references: [users.id],
  }),
}));

export const queryGroupRelations = relations(queryGroups, ({ one }) => ({
  database: one(databaseConnections, {
    fields: [queryGroups.databaseId],
    references: [databaseConnections.id],
  }),
  user: one(users, {
    fields: [queryGroups.userId],
    references: [users.id],
  }),
}));

// Create schemas for query monitoring tables
export const insertQueryMonitoringConfigSchema = createInsertSchema(queryMonitoringConfigs);
export const selectQueryMonitoringConfigSchema = createSelectSchema(queryMonitoringConfigs);
export const insertQueryGroupSchema = createInsertSchema(queryGroups);
export const selectQueryGroupSchema = createSelectSchema(queryGroups);

// Define types for query monitoring tables
export type InsertQueryMonitoringConfig = typeof queryMonitoringConfigs.$inferInsert;
export type InsertQueryGroup = typeof queryGroups.$inferInsert;

// New improved query monitoring tables
export const normalizedQueries = pgTable("normalized_queries", {
  id: serial("id").primaryKey(),
  databaseId: integer("database_id").notNull().references(() => databaseConnections.id, { onDelete: 'cascade' }),
  normalizedText: text("normalized_text").notNull(),
  normalizedHash: text("normalized_hash").notNull(),
  firstSeenAt: timestamp("first_seen_at").notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
  isKnown: boolean("is_known").notNull().default(false),
  groupId: integer("group_id").references(() => queryGroups.id),
  distinctQueryCount: integer("distinct_query_count").notNull().default(0),
  instanceCount: integer("instance_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const querySamples = pgTable("query_samples", {
  id: serial("id").primaryKey(),
  normalizedQueryId: integer("normalized_query_id").notNull().references(() => normalizedQueries.id, { onDelete: 'cascade' }),
  databaseId: integer("database_id").notNull().references(() => databaseConnections.id, { onDelete: 'cascade' }),
  queryText: text("query_text").notNull(),
  queryHash: text("query_hash").notNull(),
  username: text("username"),
  applicationName: text("application_name"),
  clientAddr: text("client_addr"),
  queryStart: timestamp("query_start"),
  duration: text("duration"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const collectedQueries = pgTable("collected_queries", {
  id: serial("id").primaryKey(),
  normalizedQueryId: integer("normalized_query_id").notNull().references(() => normalizedQueries.id, { onDelete: 'cascade' }),
  databaseId: integer("database_id").notNull().references(() => databaseConnections.id, { onDelete: 'cascade' }),
  queryText: text("query_text").notNull(),
  queryHash: text("query_hash").notNull(),
  calls: integer("calls").notNull(),
  totalTime: numeric("total_time").notNull(),
  minTime: numeric("min_time"),
  maxTime: numeric("max_time"),
  meanTime: numeric("mean_time"),
  collectedAt: timestamp("collected_at").notNull().defaultNow(),
  lastUpdatedAt: timestamp("last_updated_at").notNull().defaultNow(),
});

// Create schemas for the new table
export const insertQuerySampleSchema = createInsertSchema(querySamples);
export const selectQuerySampleSchema = createSelectSchema(querySamples);

// Define relations
export const querySampleRelations = relations(querySamples, ({ one }) => ({
  normalizedQuery: one(normalizedQueries, {
    fields: [querySamples.normalizedQueryId],
    references: [normalizedQueries.id],
  }),
  database: one(databaseConnections, {
    fields: [querySamples.databaseId],
    references: [databaseConnections.id],
  }),
}));

// SQL to create trigger function for maintaining distinctQueryCount and instanceCount
export const updateDistinctQueryCountFunction = sql`
CREATE OR REPLACE FUNCTION update_distinct_query_count()
RETURNS TRIGGER AS $$
BEGIN
  -- Update both counts in normalized_queries
  UPDATE normalized_queries
  SET 
    distinct_query_count = (
      SELECT COUNT(DISTINCT query_hash)
      FROM collected_queries
      WHERE normalized_query_id = COALESCE(NEW.normalized_query_id, OLD.normalized_query_id)
    ),
    instance_count = (
      SELECT COUNT(*)
      FROM collected_queries
      WHERE normalized_query_id = COALESCE(NEW.normalized_query_id, OLD.normalized_query_id)
    )
  WHERE id = COALESCE(NEW.normalized_query_id, OLD.normalized_query_id);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
`;

// SQL to create the trigger
export const createDistinctQueryCountTrigger = sql`
CREATE TRIGGER maintain_distinct_query_count
AFTER INSERT OR UPDATE OR DELETE ON collected_queries
FOR EACH ROW
EXECUTE FUNCTION update_distinct_query_count();
`;