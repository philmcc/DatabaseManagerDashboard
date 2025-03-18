CREATE TYPE "public"."user_role" AS ENUM('ADMIN', 'WRITER', 'READER');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "clusters" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"userId" integer NOT NULL,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now(),
	"ignored_databases" jsonb DEFAULT '[]' NOT NULL,
	"extra_databases" jsonb DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "collected_queries" (
	"id" serial PRIMARY KEY NOT NULL,
	"normalized_query_id" integer NOT NULL,
	"database_id" integer NOT NULL,
	"query_text" text NOT NULL,
	"query_hash" text NOT NULL,
	"calls" integer NOT NULL,
	"total_time" numeric NOT NULL,
	"min_time" numeric,
	"max_time" numeric,
	"mean_time" numeric,
	"collected_at" timestamp DEFAULT now() NOT NULL,
	"last_updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "database_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"instance_id" integer NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"database_name" text NOT NULL,
	"userId" integer NOT NULL,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now(),
	"archived" boolean DEFAULT false NOT NULL,
	"linked_database_id" integer,
	"use_ssh_tunnel" boolean DEFAULT false NOT NULL,
	"ssh_host" text,
	"ssh_port" integer DEFAULT 22,
	"ssh_username" text,
	"ssh_password" text,
	"ssh_private_key" text,
	"ssh_key_passphrase" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "database_metrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"database_id" integer NOT NULL,
	"timestamp" timestamp DEFAULT now(),
	"active_connections" integer DEFAULT 0 NOT NULL,
	"database_size" text DEFAULT '0 kB' NOT NULL,
	"raw_database_size" numeric DEFAULT '0' NOT NULL,
	"slow_queries" integer DEFAULT 0 NOT NULL,
	"avg_query_time" numeric DEFAULT 0 NOT NULL,
	"cache_hit_ratio" numeric DEFAULT 0 NOT NULL,
	"metrics" json NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "database_operation_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"database_id" integer,
	"userId" integer NOT NULL,
	"operation_type" text NOT NULL,
	"operation_result" text NOT NULL,
	"details" jsonb NOT NULL,
	"timestamp" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "database_tags" (
	"database_id" integer NOT NULL,
	"tag_id" integer NOT NULL,
	CONSTRAINT "database_tags_database_id_tag_id_pk" PRIMARY KEY("database_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "discovered_queries" (
	"id" serial PRIMARY KEY NOT NULL,
	"database_id" integer NOT NULL,
	"query_text" text NOT NULL,
	"query_hash" text NOT NULL,
	"normalized_query" text,
	"first_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"call_count" integer DEFAULT 1 NOT NULL,
	"total_time" numeric DEFAULT '0' NOT NULL,
	"min_time" numeric,
	"max_time" numeric,
	"mean_time" numeric,
	"is_known" boolean DEFAULT false NOT NULL,
	"group_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "health_check_executions" (
	"id" serial PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp DEFAULT now(),
	"completed_at" timestamp,
	"user_id" integer NOT NULL,
	"cluster_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "health_check_queries" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"query" text NOT NULL,
	"run_on_all_instances" boolean DEFAULT false NOT NULL,
	"run_on_all_databases" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"display_order" integer NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "health_check_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"cluster_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"status" text NOT NULL,
	"markdown" text,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "health_check_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"execution_id" integer NOT NULL,
	"query_id" integer NOT NULL,
	"instance_id" integer NOT NULL,
	"database_name" text,
	"results" jsonb,
	"error" text,
	"executed_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "instances" (
	"id" serial PRIMARY KEY NOT NULL,
	"hostname" text NOT NULL,
	"port" integer NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"description" text,
	"is_writer" boolean DEFAULT false,
	"default_database_name" text,
	"cluster_id" integer NOT NULL,
	"userId" integer NOT NULL,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now(),
	"use_ssh_tunnel" boolean DEFAULT false NOT NULL,
	"ssh_host" text,
	"ssh_port" integer DEFAULT 22,
	"ssh_username" text,
	"ssh_password" text,
	"ssh_private_key" text,
	"ssh_key_passphrase" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "normalized_queries" (
	"id" serial PRIMARY KEY NOT NULL,
	"database_id" integer NOT NULL,
	"normalized_text" text NOT NULL,
	"normalized_hash" text NOT NULL,
	"first_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"is_known" boolean DEFAULT false NOT NULL,
	"group_id" integer,
	"distinct_query_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "query_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"database_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_known" boolean DEFAULT false NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "query_monitoring_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"database_id" integer NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"interval_minutes" integer DEFAULT 15 NOT NULL,
	"last_run_at" timestamp,
	"user_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"createdAt" timestamp DEFAULT now(),
	"userId" integer NOT NULL,
	CONSTRAINT "tags_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"resetToken" text,
	"resetTokenExpiry" timestamp,
	"fullName" text,
	"bio" text,
	"avatar" text,
	"theme" text DEFAULT 'light',
	"role" "user_role" DEFAULT 'READER' NOT NULL,
	"is_approved" boolean DEFAULT false NOT NULL,
	"approved_by" integer,
	"approved_at" timestamp,
	"updatedAt" timestamp DEFAULT now(),
	"is_admin" boolean DEFAULT false,
	"is_writer" boolean DEFAULT false,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "clusters" ADD CONSTRAINT "clusters_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "collected_queries" ADD CONSTRAINT "collected_queries_normalized_query_id_normalized_queries_id_fk" FOREIGN KEY ("normalized_query_id") REFERENCES "public"."normalized_queries"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "collected_queries" ADD CONSTRAINT "collected_queries_database_id_database_connections_id_fk" FOREIGN KEY ("database_id") REFERENCES "public"."database_connections"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "database_connections" ADD CONSTRAINT "database_connections_instance_id_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."instances"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "database_connections" ADD CONSTRAINT "database_connections_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "database_connections" ADD CONSTRAINT "database_connections_linked_database_id_database_connections_id_fk" FOREIGN KEY ("linked_database_id") REFERENCES "public"."database_connections"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "database_metrics" ADD CONSTRAINT "database_metrics_database_id_database_connections_id_fk" FOREIGN KEY ("database_id") REFERENCES "public"."database_connections"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "database_operation_logs" ADD CONSTRAINT "database_operation_logs_database_id_database_connections_id_fk" FOREIGN KEY ("database_id") REFERENCES "public"."database_connections"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "database_operation_logs" ADD CONSTRAINT "database_operation_logs_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "database_tags" ADD CONSTRAINT "database_tags_database_id_database_connections_id_fk" FOREIGN KEY ("database_id") REFERENCES "public"."database_connections"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "database_tags" ADD CONSTRAINT "database_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "discovered_queries" ADD CONSTRAINT "discovered_queries_database_id_database_connections_id_fk" FOREIGN KEY ("database_id") REFERENCES "public"."database_connections"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "discovered_queries" ADD CONSTRAINT "discovered_queries_group_id_query_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."query_groups"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "health_check_executions" ADD CONSTRAINT "health_check_executions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "health_check_executions" ADD CONSTRAINT "health_check_executions_cluster_id_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."clusters"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "health_check_queries" ADD CONSTRAINT "health_check_queries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "health_check_reports" ADD CONSTRAINT "health_check_reports_cluster_id_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."clusters"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "health_check_reports" ADD CONSTRAINT "health_check_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "health_check_results" ADD CONSTRAINT "health_check_results_execution_id_health_check_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."health_check_executions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "health_check_results" ADD CONSTRAINT "health_check_results_query_id_health_check_queries_id_fk" FOREIGN KEY ("query_id") REFERENCES "public"."health_check_queries"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "health_check_results" ADD CONSTRAINT "health_check_results_instance_id_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."instances"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "instances" ADD CONSTRAINT "instances_cluster_id_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."clusters"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "instances" ADD CONSTRAINT "instances_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "normalized_queries" ADD CONSTRAINT "normalized_queries_database_id_database_connections_id_fk" FOREIGN KEY ("database_id") REFERENCES "public"."database_connections"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "normalized_queries" ADD CONSTRAINT "normalized_queries_group_id_query_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."query_groups"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "query_groups" ADD CONSTRAINT "query_groups_database_id_database_connections_id_fk" FOREIGN KEY ("database_id") REFERENCES "public"."database_connections"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "query_groups" ADD CONSTRAINT "query_groups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "query_monitoring_configs" ADD CONSTRAINT "query_monitoring_configs_database_id_database_connections_id_fk" FOREIGN KEY ("database_id") REFERENCES "public"."database_connections"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "query_monitoring_configs" ADD CONSTRAINT "query_monitoring_configs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tags" ADD CONSTRAINT "tags_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
