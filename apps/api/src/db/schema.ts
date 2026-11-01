import type { NodeOutput } from "@krypton/engine";
import type { JsonObject, JsonValue, Workflow } from "@krypton/schema";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export type UserRole = "admin" | "member";

export type ExecutionStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export type JournalStatus = "succeeded" | "failed" | "skipped";

export type TriggerType = "manual" | "schedule" | "webhook";

const createdAt = () =>
  timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow();

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    displayName: text("display_name"),
    role: text("role").$type<UserRole>().notNull().default("member"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("users_email_unique").on(sql`lower(${table.email})`),
    check("users_role_check", sql`${table.role} in ('admin', 'member')`),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    createdAt: createdAt(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    uniqueIndex("sessions_token_hash_unique").on(table.tokenHash),
    index("sessions_user_id_idx").on(table.userId),
    index("sessions_expires_at_idx").on(table.expiresAt),
  ],
);

export const workflows = pgTable(
  "workflows",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    // No FK: a simple FK prevents dangling IDs but not a version owned by another
    // workflow; the publish path validates existence, ownership, and immutability.
    currentVersionId: text("current_version_id"),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    index("workflows_created_by_idx").on(table.createdBy),
    index("workflows_archived_at_idx").on(table.archivedAt),
  ],
);

export const workflowVersions = pgTable(
  "workflow_versions",
  {
    id: text("id").primaryKey(),
    workflowId: text("workflow_id")
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    graph: jsonb("graph").$type<Workflow>().notNull(),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    publishedAt: timestamp("published_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    unique("workflow_versions_id_workflow_unique").on(table.id, table.workflowId),
    uniqueIndex("workflow_versions_workflow_version_unique").on(table.workflowId, table.version),
    index("workflow_versions_workflow_created_idx").on(table.workflowId, table.createdAt),
    check("workflow_versions_version_positive", sql`${table.version} > 0`),
  ],
);

export const executions = pgTable(
  "executions",
  {
    id: text("id").primaryKey(),
    workflowId: text("workflow_id")
      .notNull()
      .references(() => workflows.id, { onDelete: "restrict" }),
    workflowVersionId: text("workflow_version_id").notNull(),
    status: text("status").$type<ExecutionStatus>().notNull().default("queued"),
    trigger: jsonb("trigger")
      .$type<JsonObject>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    input: jsonb("input")
      .$type<JsonObject>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    outputs: jsonb("outputs").$type<readonly JsonObject[]>(),
    error: jsonb("error").$type<JsonObject>(),
    queuedAt: timestamp("queued_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
    finishedAt: timestamp("finished_at", { withTimezone: true, mode: "date" }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true, mode: "date" }),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true, mode: "date" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({
      columns: [table.workflowVersionId, table.workflowId],
      foreignColumns: [workflowVersions.id, workflowVersions.workflowId],
      name: "executions_workflow_version_workflow_fk",
    }).onDelete("restrict"),
    index("executions_status_queued_idx").on(table.status, table.queuedAt),
    index("executions_workflow_created_idx").on(table.workflowId, table.createdAt),
    index("executions_workflow_version_idx").on(table.workflowVersionId),
    index("executions_lease_expires_idx").on(table.leaseExpiresAt),
    check(
      "executions_status_check",
      sql`${table.status} in ('queued', 'running', 'succeeded', 'failed', 'cancelled')`,
    ),
  ],
);

export const executionJournal = pgTable(
  "execution_journal",
  {
    id: text("id").primaryKey(),
    executionId: text("execution_id")
      .notNull()
      .references(() => executions.id, { onDelete: "cascade" }),
    // Retries reuse sequence, so SSE cursors must order by (sequence, attempt).
    sequence: integer("sequence").notNull(),
    attempt: integer("attempt").notNull().default(1),
    nodeId: text("node_id").notNull(),
    nodeType: text("node_type").notNull(),
    status: text("status").$type<JournalStatus>().notNull(),
    detail: text("detail"),
    input: jsonb("input").$type<JsonObject>(),
    outputs: jsonb("outputs").$type<readonly NodeOutput[]>(),
    error: jsonb("error").$type<JsonObject>(),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
    finishedAt: timestamp("finished_at", { withTimezone: true, mode: "date" }),
    durationMs: integer("duration_ms"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("execution_journal_step_attempt_unique").on(
      table.executionId,
      table.sequence,
      table.attempt,
    ),
    index("execution_journal_node_idx").on(table.nodeId),
    check("execution_journal_sequence_positive", sql`${table.sequence} > 0`),
    check("execution_journal_attempt_positive", sql`${table.attempt} > 0`),
    check(
      "execution_journal_duration_non_negative",
      sql`${table.durationMs} is null or ${table.durationMs} >= 0`,
    ),
    check(
      "execution_journal_status_check",
      sql`${table.status} in ('succeeded', 'failed', 'skipped')`,
    ),
  ],
);

export const credentials = pgTable(
  "credentials",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    type: text("type").notNull(),
    ciphertext: text("ciphertext").notNull(),
    iv: text("iv").notNull(),
    authTag: text("auth_tag").notNull(),
    keyVersion: integer("key_version").notNull(),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("credentials_name_unique").on(table.name),
    index("credentials_created_by_idx").on(table.createdBy),
    check("credentials_key_version_positive", sql`${table.keyVersion} > 0`),
  ],
);

export const triggers = pgTable(
  "triggers",
  {
    id: text("id").primaryKey(),
    workflowId: text("workflow_id")
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),
    type: text("type").$type<TriggerType>().notNull(),
    config: jsonb("config")
      .$type<JsonObject>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    secretHash: text("secret_hash"),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("triggers_workflow_type_idx").on(table.workflowId, table.type),
    check("triggers_type_check", sql`${table.type} in ('manual', 'schedule', 'webhook')`),
  ],
);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<JsonValue>().notNull(),
  updatedAt: updatedAt(),
});
