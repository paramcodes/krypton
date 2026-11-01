import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { asNodeId, asWorkflowId, type Workflow } from "@krypton/schema";
import { asc, eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabase, type Database } from "./client.ts";
import * as schema from "./schema.ts";
import { readTestDatabaseUrl } from "./test-database.ts";

const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));
const NOW = new Date("2026-10-30T00:00:00.000Z");
const LATER = new Date("2026-10-30T00:00:01.000Z");

let database: Database | undefined;
let pool: Pool | undefined;

const getDatabase = (): Database => {
  if (database === undefined) {
    throw new Error("The integration database was not initialized.");
  }
  return database;
};

beforeAll(async () => {
  const connectionString = readTestDatabaseUrl();
  const admin = new Pool({ connectionString });
  try {
    await admin.query("drop schema if exists drizzle cascade");
    await admin.query("drop schema if exists public cascade");
    await admin.query("create schema public");
  } finally {
    await admin.end();
  }

  const client = createDatabase(connectionString);
  try {
    await migrate(client.db, { migrationsFolder });
    database = client.db;
    pool = client.pool;
  } catch (error) {
    await client.pool.end();
    throw error;
  }
}, 30_000);

afterAll(async () => {
  await pool?.end();
});

describe("Postgres persistence schema", () => {
  it("stores the workflow, execution, and journal graph with its constraints", async () => {
    const db = getDatabase();
    const userId = randomUUID();
    const workflowId = randomUUID();
    const otherWorkflowId = randomUUID();
    const versionId = randomUUID();
    const executionId = randomUUID();
    const journalId = randomUUID();
    const triggerId = randomUUID();
    const credentialId = randomUUID();
    const sessionId = randomUUID();

    const workflowGraph: Workflow = {
      id: asWorkflowId(workflowId),
      name: "Persistence test",
      expressionVersion: 1,
      nodes: [
        {
          id: asNodeId("start"),
          type: "manual-trigger",
          parameters: {},
        },
      ],
      connections: [],
    };

    await db.insert(schema.users).values({
      id: userId,
      email: "admin@example.test",
      passwordHash: "hashed-password",
      displayName: "Admin",
      role: "admin",
      createdAt: NOW,
      updatedAt: NOW,
    });

    await expect(
      db.insert(schema.users).values({
        id: randomUUID(),
        email: "Admin@Example.Test",
        passwordHash: "hashed-password",
        role: "member",
        createdAt: NOW,
        updatedAt: NOW,
      }),
    ).rejects.toMatchObject({
      cause: { constraint: "users_email_unique" },
    });

    await db.insert(schema.workflows).values({
      id: workflowId,
      name: "Persistence test",
      description: "Stage 2 schema coverage",
      createdBy: userId,
      createdAt: NOW,
      updatedAt: NOW,
    });

    await db.insert(schema.workflows).values({
      id: otherWorkflowId,
      name: "Other workflow",
      createdAt: NOW,
      updatedAt: NOW,
    });

    await db.insert(schema.workflowVersions).values({
      id: versionId,
      workflowId,
      version: 1,
      graph: workflowGraph,
      createdBy: userId,
      createdAt: NOW,
      publishedAt: NOW,
    });

    await db
      .update(schema.workflows)
      .set({ currentVersionId: versionId, updatedAt: LATER })
      .where(eq(schema.workflows.id, workflowId));

    await db.insert(schema.executions).values({
      id: executionId,
      workflowId,
      workflowVersionId: versionId,
      status: "running",
      trigger: { type: "manual" },
      input: { customer: "Ada" },
      startedAt: LATER,
      createdAt: NOW,
      updatedAt: LATER,
    });

    await db.insert(schema.executionJournal).values({
      id: journalId,
      executionId,
      sequence: 1,
      attempt: 1,
      nodeId: "start",
      nodeType: "manual-trigger",
      status: "succeeded",
      detail: "1 item",
      input: { customer: "Ada" },
      outputs: [{ port: "main", items: [{ customer: "Ada", status: "ready" }] }],
      startedAt: NOW,
      finishedAt: LATER,
      durationMs: 1_000,
      createdAt: NOW,
    });

    await db.insert(schema.executionJournal).values({
      id: randomUUID(),
      executionId,
      sequence: 1,
      attempt: 2,
      nodeId: "start",
      nodeType: "manual-trigger",
      status: "failed",
      error: { message: "transient failure" },
      startedAt: LATER,
      finishedAt: LATER,
      durationMs: 0,
      createdAt: LATER,
    });

    await db.insert(schema.triggers).values({
      id: triggerId,
      workflowId,
      type: "manual",
      config: {},
      createdAt: NOW,
      updatedAt: NOW,
    });

    await db.insert(schema.credentials).values({
      id: credentialId,
      name: "test-api-key",
      type: "api-key",
      ciphertext: "ciphertext",
      iv: "iv",
      authTag: "auth-tag",
      keyVersion: 1,
      createdBy: userId,
      createdAt: NOW,
      updatedAt: NOW,
    });

    await db.insert(schema.sessions).values({
      id: sessionId,
      userId,
      tokenHash: "hashed-token",
      createdAt: NOW,
      lastSeenAt: NOW,
      expiresAt: new Date("2026-11-30T00:00:00.000Z"),
    });

    await db.insert(schema.settings).values({
      key: "instance",
      value: { name: "Krypton" },
      updatedAt: NOW,
    });

    const [storedWorkflow] = await db
      .select()
      .from(schema.workflows)
      .where(eq(schema.workflows.id, workflowId));
    expect(storedWorkflow?.currentVersionId).toBe(versionId);

    const [storedVersion] = await db
      .select()
      .from(schema.workflowVersions)
      .where(eq(schema.workflowVersions.id, versionId));
    expect(storedVersion?.graph.id).toBe(workflowId);

    const [storedExecution] = await db
      .select()
      .from(schema.executions)
      .where(eq(schema.executions.id, executionId));
    expect(storedExecution?.status).toBe("running");
    expect(storedExecution?.input).toEqual({ customer: "Ada" });

    const journalRows = await db
      .select()
      .from(schema.executionJournal)
      .where(eq(schema.executionJournal.executionId, executionId))
      .orderBy(asc(schema.executionJournal.sequence), asc(schema.executionJournal.attempt));
    expect(journalRows).toHaveLength(2);
    expect(journalRows[0]?.status).toBe("succeeded");
    expect(journalRows[0]?.outputs).toEqual([
      { port: "main", items: [{ customer: "Ada", status: "ready" }] },
    ]);
    expect(journalRows[1]?.status).toBe("failed");
    expect(journalRows[1]?.error).toEqual({ message: "transient failure" });

    await expect(
      db.insert(schema.executionJournal).values({
        id: randomUUID(),
        executionId,
        sequence: 1,
        attempt: 1,
        nodeId: "start",
        nodeType: "manual-trigger",
        status: "succeeded",
        createdAt: LATER,
      }),
    ).rejects.toMatchObject({
      cause: { constraint: "execution_journal_step_attempt_unique" },
    });

    await expect(
      db.insert(schema.executions).values({
        id: randomUUID(),
        workflowId: otherWorkflowId,
        workflowVersionId: versionId,
        status: "queued",
        createdAt: NOW,
        updatedAt: NOW,
      }),
    ).rejects.toMatchObject({
      cause: { constraint: "executions_workflow_version_workflow_fk" },
    });

    await db.delete(schema.workflows).where(eq(schema.workflows.id, otherWorkflowId));

    const [storedCredential] = await db
      .select()
      .from(schema.credentials)
      .where(eq(schema.credentials.id, credentialId));
    expect(storedCredential?.ciphertext).toBe("ciphertext");

    const [storedSession] = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, sessionId));
    expect(storedSession?.tokenHash).toBe("hashed-token");

    const [storedSetting] = await db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, "instance"));
    expect(storedSetting?.value).toEqual({ name: "Krypton" });

    await expect(
      db.insert(schema.workflowVersions).values({
        id: randomUUID(),
        workflowId,
        version: 1,
        graph: workflowGraph,
        createdAt: LATER,
      }),
    ).rejects.toMatchObject({
      cause: { constraint: "workflow_versions_workflow_version_unique" },
    });

    await expect(
      db.delete(schema.workflowVersions).where(eq(schema.workflowVersions.id, versionId)),
    ).rejects.toMatchObject({
      cause: { constraint: "executions_workflow_version_workflow_fk" },
    });

    await expect(
      db.delete(schema.workflows).where(eq(schema.workflows.id, workflowId)),
    ).rejects.toMatchObject({
      cause: { constraint: "executions_workflow_id_workflows_id_fk" },
    });

    await db.delete(schema.executions).where(eq(schema.executions.id, executionId));
    const remainingJournal = await db
      .select()
      .from(schema.executionJournal)
      .where(eq(schema.executionJournal.executionId, executionId));
    expect(remainingJournal).toHaveLength(0);

    await db.delete(schema.workflows).where(eq(schema.workflows.id, workflowId));
    const remainingVersions = await db
      .select()
      .from(schema.workflowVersions)
      .where(eq(schema.workflowVersions.workflowId, workflowId));
    expect(remainingVersions).toHaveLength(0);

    const remainingTriggers = await db
      .select()
      .from(schema.triggers)
      .where(eq(schema.triggers.workflowId, workflowId));
    expect(remainingTriggers).toHaveLength(0);

    await db.delete(schema.users).where(eq(schema.users.id, userId));
    const remainingSessions = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.userId, userId));
    expect(remainingSessions).toHaveLength(0);

    const [credentialAfterUserDelete] = await db
      .select()
      .from(schema.credentials)
      .where(eq(schema.credentials.id, credentialId));
    expect(credentialAfterUserDelete?.createdBy).toBeNull();
  });

  it("enforces database check constraints", async () => {
    const db = getDatabase();
    await expect(
      db.execute(
        sql`insert into ${schema.users} (id, email, password_hash, role) values (${randomUUID()}, ${"invalid-role@example.test"}, ${"hashed-password"}, ${"owner"})`,
      ),
    ).rejects.toMatchObject({
      cause: { constraint: "users_role_check" },
    });
  });
});
