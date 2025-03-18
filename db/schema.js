"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.insertQueryMonitoringConfigSchema = exports.discoveredQueryRelations = exports.queryGroupRelations = exports.queryMonitoringConfigRelations = exports.discoveredQueries = exports.queryGroups = exports.queryMonitoringConfigs = exports.selectInstanceSchema = exports.insertInstanceSchema = exports.selectClusterSchema = exports.insertClusterSchema = exports.selectDatabaseConnectionSchema = exports.insertDatabaseConnectionSchema = exports.selectTagSchema = exports.insertTagSchema = exports.selectHealthCheckReportSchema = exports.insertHealthCheckReportSchema = exports.selectHealthCheckResultSchema = exports.insertHealthCheckResultSchema = exports.selectHealthCheckExecutionSchema = exports.insertHealthCheckExecutionSchema = exports.selectHealthCheckQuerySchema = exports.insertHealthCheckQuerySchema = exports.healthCheckReportsRelations = exports.healthCheckResultsRelations = exports.healthCheckExecutionsRelations = exports.healthCheckQueriesRelations = exports.healthCheckReports = exports.healthCheckResults = exports.healthCheckExecutions = exports.healthCheckQueries = exports.databaseMetricsRelations = exports.databaseOperationLogsRelations = exports.databaseMetrics = exports.databaseOperationLogs = exports.tagsRelations = exports.databaseConnectionRelations = exports.instanceRelations = exports.clusterRelations = exports.databaseTagsRelations = exports.databaseTags = exports.tags = exports.databaseConnections = exports.instances = exports.clusters = exports.selectUserSchema = exports.insertUserSchema = exports.userRelations = exports.users = exports.userRoleEnum = void 0;
exports.selectDiscoveredQuerySchema = exports.insertDiscoveredQuerySchema = exports.selectQueryGroupSchema = exports.insertQueryGroupSchema = exports.selectQueryMonitoringConfigSchema = void 0;
var pg_core_1 = require("drizzle-orm/pg-core");
var drizzle_zod_1 = require("drizzle-zod");
var drizzle_orm_1 = require("drizzle-orm");
// Role enum for user types
exports.userRoleEnum = (0, pg_core_1.pgEnum)('user_role', ['ADMIN', 'WRITER', 'READER']);
// Base tables
exports.users = (0, pg_core_1.pgTable)("users", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    username: (0, pg_core_1.text)("username").unique().notNull(),
    password: (0, pg_core_1.text)("password").notNull(),
    resetToken: (0, pg_core_1.text)("resetToken"),
    resetTokenExpiry: (0, pg_core_1.timestamp)("resetTokenExpiry"),
    fullName: (0, pg_core_1.text)("fullName"),
    bio: (0, pg_core_1.text)("bio"),
    avatar: (0, pg_core_1.text)("avatar"),
    theme: (0, pg_core_1.text)("theme").default("light"),
    role: (0, exports.userRoleEnum)("role").default('READER').notNull(),
    isApproved: (0, pg_core_1.boolean)("is_approved").default(false).notNull(),
    approvedBy: (0, pg_core_1.integer)("approved_by"),
    approvedAt: (0, pg_core_1.timestamp)("approved_at"),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt").defaultNow(),
    isAdmin: (0, pg_core_1.boolean)("is_admin").default(false),
    isWriter: (0, pg_core_1.boolean)("is_writer").default(false),
});
exports.userRelations = (0, drizzle_orm_1.relations)(exports.users, function (_a) {
    var one = _a.one;
    return ({
        approvedByUser: one(exports.users, {
            fields: [exports.users.approvedBy],
            references: [exports.users.id],
        }),
    });
});
// Create schemas and types
exports.insertUserSchema = (0, drizzle_zod_1.createInsertSchema)(exports.users);
exports.selectUserSchema = (0, drizzle_zod_1.createSelectSchema)(exports.users);
exports.clusters = (0, pg_core_1.pgTable)("clusters", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    name: (0, pg_core_1.text)("name").notNull(),
    description: (0, pg_core_1.text)("description"),
    userId: (0, pg_core_1.integer)("userId").notNull().references(function () { return exports.users.id; }, { onDelete: 'cascade' }),
    createdAt: (0, pg_core_1.timestamp)("createdAt").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt").defaultNow(),
    ignoredDatabases: (0, pg_core_1.jsonb)("ignored_databases").default("[]").notNull(),
    extraDatabases: (0, pg_core_1.jsonb)("extra_databases").default("[]").notNull(),
});
exports.instances = (0, pg_core_1.pgTable)("instances", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    hostname: (0, pg_core_1.text)("hostname").notNull(),
    port: (0, pg_core_1.integer)("port").notNull(),
    username: (0, pg_core_1.text)("username").notNull(),
    password: (0, pg_core_1.text)("password").notNull(),
    description: (0, pg_core_1.text)("description"),
    isWriter: (0, pg_core_1.boolean)("is_writer").default(false),
    defaultDatabaseName: (0, pg_core_1.text)("default_database_name"),
    clusterId: (0, pg_core_1.integer)("cluster_id").notNull().references(function () { return exports.clusters.id; }, { onDelete: 'cascade' }),
    userId: (0, pg_core_1.integer)("userId").notNull().references(function () { return exports.users.id; }, { onDelete: 'cascade' }),
    createdAt: (0, pg_core_1.timestamp)("createdAt").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt").defaultNow(),
    useSSHTunnel: (0, pg_core_1.boolean)("use_ssh_tunnel").default(false).notNull(),
    sshHost: (0, pg_core_1.text)("ssh_host"),
    sshPort: (0, pg_core_1.integer)("ssh_port").default(22),
    sshUsername: (0, pg_core_1.text)("ssh_username"),
    sshPassword: (0, pg_core_1.text)("ssh_password"),
    sshPrivateKey: (0, pg_core_1.text)("ssh_private_key"),
    sshKeyPassphrase: (0, pg_core_1.text)("ssh_key_passphrase"),
});
exports.databaseConnections = (0, pg_core_1.pgTable)("database_connections", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    name: (0, pg_core_1.text)("name").notNull(),
    instanceId: (0, pg_core_1.integer)("instance_id").notNull().references(function () { return exports.instances.id; }, { onDelete: 'cascade' }),
    username: (0, pg_core_1.text)("username").notNull(),
    password: (0, pg_core_1.text)("password").notNull(),
    databaseName: (0, pg_core_1.text)("database_name").notNull(),
    userId: (0, pg_core_1.integer)("userId").notNull().references(function () { return exports.users.id; }, { onDelete: 'cascade' }),
    createdAt: (0, pg_core_1.timestamp)("createdAt").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt").defaultNow(),
    archived: (0, pg_core_1.boolean)("archived").default(false).notNull(),
    linkedDatabaseId: (0, pg_core_1.integer)("linked_database_id").references(function () { return exports.databaseConnections.id; }),
    useSSHTunnel: (0, pg_core_1.boolean)("use_ssh_tunnel").default(false).notNull(),
    sshHost: (0, pg_core_1.text)("ssh_host"),
    sshPort: (0, pg_core_1.integer)("ssh_port").default(22),
    sshUsername: (0, pg_core_1.text)("ssh_username"),
    sshPassword: (0, pg_core_1.text)("ssh_password"),
    sshPrivateKey: (0, pg_core_1.text)("ssh_private_key"),
    sshKeyPassphrase: (0, pg_core_1.text)("ssh_key_passphrase"),
});
exports.tags = (0, pg_core_1.pgTable)("tags", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    name: (0, pg_core_1.text)("name").notNull().unique(),
    createdAt: (0, pg_core_1.timestamp)("createdAt").defaultNow(),
    userId: (0, pg_core_1.integer)("userId").notNull().references(function () { return exports.users.id; }, { onDelete: 'cascade' }),
});
// Junction tables
exports.databaseTags = (0, pg_core_1.pgTable)("database_tags", {
    databaseId: (0, pg_core_1.integer)("database_id").notNull().references(function () { return exports.databaseConnections.id; }, { onDelete: 'cascade' }),
    tagId: (0, pg_core_1.integer)("tag_id").notNull().references(function () { return exports.tags.id; }, { onDelete: 'cascade' }),
}, function (table) { return ({
    pk: (0, pg_core_1.primaryKey)({ columns: [table.databaseId, table.tagId] }),
}); });
// Add relations for tags
exports.databaseTagsRelations = (0, drizzle_orm_1.relations)(exports.databaseTags, function (_a) {
    var one = _a.one;
    return ({
        database: one(exports.databaseConnections, {
            fields: [exports.databaseTags.databaseId],
            references: [exports.databaseConnections.id],
        }),
        tag: one(exports.tags, {
            fields: [exports.databaseTags.tagId],
            references: [exports.tags.id],
        }),
    });
});
// Relations
exports.clusterRelations = (0, drizzle_orm_1.relations)(exports.clusters, function (_a) {
    var one = _a.one, many = _a.many;
    return ({
        user: one(exports.users, {
            fields: [exports.clusters.userId],
            references: [exports.users.id],
        }),
        instances: many(exports.instances),
    });
});
exports.instanceRelations = (0, drizzle_orm_1.relations)(exports.instances, function (_a) {
    var one = _a.one, many = _a.many;
    return ({
        cluster: one(exports.clusters, {
            fields: [exports.instances.clusterId],
            references: [exports.clusters.id],
        }),
        user: one(exports.users, {
            fields: [exports.instances.userId],
            references: [exports.users.id],
        }),
        databases: many(exports.databaseConnections),
    });
});
exports.databaseConnectionRelations = (0, drizzle_orm_1.relations)(exports.databaseConnections, function (_a) {
    var one = _a.one, many = _a.many;
    return ({
        user: one(exports.users, {
            fields: [exports.databaseConnections.userId],
            references: [exports.users.id],
        }),
        instance: one(exports.instances, {
            fields: [exports.databaseConnections.instanceId],
            references: [exports.instances.id],
        }),
        tags: many(exports.databaseTags),
    });
});
exports.tagsRelations = (0, drizzle_orm_1.relations)(exports.tags, function (_a) {
    var one = _a.one, many = _a.many;
    return ({
        user: one(exports.users, {
            fields: [exports.tags.userId],
            references: [exports.users.id],
        }),
        databases: many(exports.databaseTags),
    });
});
exports.databaseOperationLogs = (0, pg_core_1.pgTable)("database_operation_logs", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    databaseId: (0, pg_core_1.integer)("database_id").references(function () { return exports.databaseConnections.id; }, { onDelete: 'cascade' }),
    userId: (0, pg_core_1.integer)("userId").notNull().references(function () { return exports.users.id; }, { onDelete: 'cascade' }),
    operationType: (0, pg_core_1.text)("operation_type").notNull(),
    operationResult: (0, pg_core_1.text)("operation_result").notNull(),
    details: (0, pg_core_1.jsonb)("details").notNull(),
    timestamp: (0, pg_core_1.timestamp)("timestamp").defaultNow(),
});
exports.databaseMetrics = (0, pg_core_1.pgTable)("database_metrics", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    databaseId: (0, pg_core_1.integer)("database_id").notNull().references(function () { return exports.databaseConnections.id; }, { onDelete: 'cascade' }),
    timestamp: (0, pg_core_1.timestamp)("timestamp").defaultNow(),
    activeConnections: (0, pg_core_1.integer)("active_connections").notNull().default(0),
    databaseSize: (0, pg_core_1.text)("database_size").notNull().default('0 kB'),
    rawDatabaseSize: (0, pg_core_1.numeric)("raw_database_size").notNull().default('0'),
    slowQueries: (0, pg_core_1.integer)("slow_queries").notNull().default(0),
    avgQueryTime: (0, pg_core_1.numeric)("avg_query_time").notNull().default(0),
    cacheHitRatio: (0, pg_core_1.numeric)("cache_hit_ratio").notNull().default(0),
    metrics: (0, pg_core_1.json)("metrics").notNull(),
});
// Add relations for the new tables
exports.databaseOperationLogsRelations = (0, drizzle_orm_1.relations)(exports.databaseOperationLogs, function (_a) {
    var one = _a.one;
    return ({
        database: one(exports.databaseConnections, {
            fields: [exports.databaseOperationLogs.databaseId],
            references: [exports.databaseConnections.id],
        }),
        user: one(exports.users, {
            fields: [exports.databaseOperationLogs.userId],
            references: [exports.users.id],
        }),
    });
});
exports.databaseMetricsRelations = (0, drizzle_orm_1.relations)(exports.databaseMetrics, function (_a) {
    var one = _a.one;
    return ({
        database: one(exports.databaseConnections, {
            fields: [exports.databaseMetrics.databaseId],
            references: [exports.databaseConnections.id],
        }),
    });
});
// Health check related tables
exports.healthCheckQueries = (0, pg_core_1.pgTable)("health_check_queries", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    title: (0, pg_core_1.text)("title").notNull(),
    query: (0, pg_core_1.text)("query").notNull(),
    runOnAllInstances: (0, pg_core_1.boolean)("run_on_all_instances").default(false).notNull(),
    runOnAllDatabases: (0, pg_core_1.boolean)("run_on_all_databases").default(false).notNull(),
    active: (0, pg_core_1.boolean)("active").default(true).notNull(),
    displayOrder: (0, pg_core_1.integer)("display_order").notNull(),
    user_id: (0, pg_core_1.integer)("user_id").notNull().references(function () { return exports.users.id; }, { onDelete: 'cascade' }),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
exports.healthCheckExecutions = (0, pg_core_1.pgTable)("health_check_executions", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    status: (0, pg_core_1.text)("status").notNull(), // running, completed, failed
    startedAt: (0, pg_core_1.timestamp)("started_at").defaultNow(),
    completedAt: (0, pg_core_1.timestamp)("completed_at"),
    user_id: (0, pg_core_1.integer)("user_id").notNull().references(function () { return exports.users.id; }, { onDelete: 'cascade' }),
    cluster_id: (0, pg_core_1.integer)("cluster_id").notNull().references(function () { return exports.clusters.id; }, { onDelete: 'cascade' }),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
exports.healthCheckResults = (0, pg_core_1.pgTable)("health_check_results", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    execution_id: (0, pg_core_1.integer)("execution_id").notNull().references(function () { return exports.healthCheckExecutions.id; }, { onDelete: 'cascade' }),
    query_id: (0, pg_core_1.integer)("query_id").notNull().references(function () { return exports.healthCheckQueries.id; }, { onDelete: 'cascade' }),
    instance_id: (0, pg_core_1.integer)("instance_id").notNull().references(function () { return exports.instances.id; }, { onDelete: 'cascade' }),
    database_name: (0, pg_core_1.text)("database_name"),
    results: (0, pg_core_1.jsonb)("results"),
    error: (0, pg_core_1.text)("error"),
    executedAt: (0, pg_core_1.timestamp)("executed_at").defaultNow(),
});
exports.healthCheckReports = (0, pg_core_1.pgTable)("health_check_reports", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    cluster_id: (0, pg_core_1.integer)("cluster_id").notNull().references(function () { return exports.clusters.id; }, { onDelete: 'cascade' }),
    user_id: (0, pg_core_1.integer)("user_id").notNull().references(function () { return exports.users.id; }, { onDelete: 'cascade' }),
    status: (0, pg_core_1.text)("status").notNull(), // running, completed, failed
    markdown: (0, pg_core_1.text)("markdown"),
    completedAt: (0, pg_core_1.timestamp)("completed_at"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
// Health check system relations
exports.healthCheckQueriesRelations = (0, drizzle_orm_1.relations)(exports.healthCheckQueries, function (_a) {
    var one = _a.one, many = _a.many;
    return ({
        user: one(exports.users, {
            fields: [exports.healthCheckQueries.user_id],
            references: [exports.users.id],
        }),
        results: many(exports.healthCheckResults),
    });
});
exports.healthCheckExecutionsRelations = (0, drizzle_orm_1.relations)(exports.healthCheckExecutions, function (_a) {
    var one = _a.one, many = _a.many;
    return ({
        user: one(exports.users, {
            fields: [exports.healthCheckExecutions.user_id],
            references: [exports.users.id],
        }),
        cluster: one(exports.clusters, {
            fields: [exports.healthCheckExecutions.cluster_id],
            references: [exports.clusters.id],
        }),
        results: many(exports.healthCheckResults),
    });
});
exports.healthCheckResultsRelations = (0, drizzle_orm_1.relations)(exports.healthCheckResults, function (_a) {
    var one = _a.one;
    return ({
        execution: one(exports.healthCheckExecutions, {
            fields: [exports.healthCheckResults.execution_id],
            references: [exports.healthCheckExecutions.id],
        }),
        query: one(exports.healthCheckQueries, {
            fields: [exports.healthCheckResults.query_id],
            references: [exports.healthCheckQueries.id],
        }),
        instance: one(exports.instances, {
            fields: [exports.healthCheckResults.instance_id],
            references: [exports.instances.id],
        }),
    });
});
exports.healthCheckReportsRelations = (0, drizzle_orm_1.relations)(exports.healthCheckReports, function (_a) {
    var one = _a.one;
    return ({
        user: one(exports.users, {
            fields: [exports.healthCheckReports.user_id],
            references: [exports.users.id],
        }),
        cluster: one(exports.clusters, {
            fields: [exports.healthCheckReports.cluster_id],
            references: [exports.clusters.id],
        }),
    });
});
// Generate schemas for all health check tables
exports.insertHealthCheckQuerySchema = (0, drizzle_zod_1.createInsertSchema)(exports.healthCheckQueries);
exports.selectHealthCheckQuerySchema = (0, drizzle_zod_1.createSelectSchema)(exports.healthCheckQueries);
exports.insertHealthCheckExecutionSchema = (0, drizzle_zod_1.createInsertSchema)(exports.healthCheckExecutions);
exports.selectHealthCheckExecutionSchema = (0, drizzle_zod_1.createSelectSchema)(exports.healthCheckExecutions);
exports.insertHealthCheckResultSchema = (0, drizzle_zod_1.createInsertSchema)(exports.healthCheckResults);
exports.selectHealthCheckResultSchema = (0, drizzle_zod_1.createSelectSchema)(exports.healthCheckResults);
exports.insertHealthCheckReportSchema = (0, drizzle_zod_1.createInsertSchema)(exports.healthCheckReports);
exports.selectHealthCheckReportSchema = (0, drizzle_zod_1.createSelectSchema)(exports.healthCheckReports);
// Schema validation
exports.insertTagSchema = (0, drizzle_zod_1.createInsertSchema)(exports.tags);
exports.selectTagSchema = (0, drizzle_zod_1.createSelectSchema)(exports.tags);
exports.insertDatabaseConnectionSchema = (0, drizzle_zod_1.createInsertSchema)(exports.databaseConnections);
exports.selectDatabaseConnectionSchema = (0, drizzle_zod_1.createSelectSchema)(exports.databaseConnections);
exports.insertClusterSchema = (0, drizzle_zod_1.createInsertSchema)(exports.clusters);
exports.selectClusterSchema = (0, drizzle_zod_1.createSelectSchema)(exports.clusters);
exports.insertInstanceSchema = (0, drizzle_zod_1.createInsertSchema)(exports.instances);
exports.selectInstanceSchema = (0, drizzle_zod_1.createSelectSchema)(exports.instances);
// Add these tables to your schema
exports.queryMonitoringConfigs = (0, pg_core_1.pgTable)("query_monitoring_configs", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    databaseId: (0, pg_core_1.integer)("database_id").notNull().references(function () { return exports.databaseConnections.id; }, { onDelete: 'cascade' }),
    isActive: (0, pg_core_1.boolean)("is_active").notNull().default(false),
    intervalMinutes: (0, pg_core_1.integer)("interval_minutes").notNull().default(15),
    lastRunAt: (0, pg_core_1.timestamp)("last_run_at"),
    userId: (0, pg_core_1.integer)("user_id").notNull().references(function () { return exports.users.id; }, { onDelete: 'cascade' }),
    createdAt: (0, pg_core_1.timestamp)("created_at").notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").notNull().defaultNow(),
});
exports.queryGroups = (0, pg_core_1.pgTable)("query_groups", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    databaseId: (0, pg_core_1.integer)("database_id").notNull().references(function () { return exports.databaseConnections.id; }, { onDelete: 'cascade' }),
    name: (0, pg_core_1.text)("name").notNull(),
    description: (0, pg_core_1.text)("description"),
    isKnown: (0, pg_core_1.boolean)("is_known").notNull().default(false),
    userId: (0, pg_core_1.integer)("user_id").notNull().references(function () { return exports.users.id; }, { onDelete: 'cascade' }),
    createdAt: (0, pg_core_1.timestamp)("created_at").notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").notNull().defaultNow(),
});

// Add query monitoring relations after line 408 (at the end of the file)
// Relations for query monitoring tables
exports.queryMonitoringConfigRelations = (0, drizzle_orm_1.relations)(exports.queryMonitoringConfigs, function (_a) {
    var one = _a.one, many = _a.many;
    return ({
        database: one(exports.databaseConnections, {
            fields: [exports.queryMonitoringConfigs.databaseId],
            references: [exports.databaseConnections.id],
        }),
        user: one(exports.users, {
            fields: [exports.queryMonitoringConfigs.userId],
            references: [exports.users.id],
        }),
    });
});
exports.queryGroupRelations = (0, drizzle_orm_1.relations)(exports.queryGroups, function (_a) {
    var one = _a.one, many = _a.many;
    return ({
        database: one(exports.databaseConnections, {
            fields: [exports.queryGroups.databaseId],
            references: [exports.databaseConnections.id],
        }),
        user: one(exports.users, {
            fields: [exports.queryGroups.userId],
            references: [exports.users.id],
        }),
        queries: many(exports.discoveredQueries),
    });
});
exports.discoveredQueryRelations = (0, drizzle_orm_1.relations)(exports.discoveredQueries, function (_a) {
    var one = _a.one;
    return ({
        database: one(exports.databaseConnections, {
            fields: [exports.discoveredQueries.databaseId],
            references: [exports.databaseConnections.id],
        }),
        group: one(exports.queryGroups, {
            fields: [exports.discoveredQueries.groupId],
            references: [exports.queryGroups.id],
        }),
    });
});
// Create schemas for query monitoring tables
exports.insertQueryMonitoringConfigSchema = (0, drizzle_zod_1.createInsertSchema)(exports.queryMonitoringConfigs);
exports.selectQueryMonitoringConfigSchema = (0, drizzle_zod_1.createSelectSchema)(exports.queryMonitoringConfigs);
exports.insertQueryGroupSchema = (0, drizzle_zod_1.createInsertSchema)(exports.queryGroups);
exports.selectQueryGroupSchema = (0, drizzle_zod_1.createSelectSchema)(exports.queryGroups);
exports.insertDiscoveredQuerySchema = (0, drizzle_zod_1.createInsertSchema)(exports.discoveredQueries);
exports.selectDiscoveredQuerySchema = (0, drizzle_zod_1.createSelectSchema)(exports.discoveredQueries);
