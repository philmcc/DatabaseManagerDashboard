import { db } from '../../db/index.js';
import { queryMonitoringSessions, queryExamples, normalizedQueries, type InsertQueryExample } from '../../db/schema.js';
import { eq, and, lt, desc } from 'drizzle-orm';
import { createHash } from 'crypto';
import { getDatabaseConnection } from '../lib/database.js';
import type { Pool, Client } from 'pg';

type DatabaseConnection = {
    connection: Pool | Client;
    cleanup: () => Promise<void>;
};

// Function to normalize a query
function normalizeQuery(query: string): string {
    // Remove comments
    query = query.replace(/--.*$/gm, '');
    query = query.replace(/\/\*[\s\S]*?\*\//g, '');
    
    // Remove whitespace
    query = query.replace(/\s+/g, ' ');
    query = query.trim();
    
    // Convert to lowercase
    query = query.toLowerCase();
    
    // Replace literals with placeholders
    query = query.replace(/'[^']*'/g, "'?'");
    query = query.replace(/"([^"]*)"/g, '"?"');
    query = query.replace(/\b\d+\b/g, '?');
    
    return query;
}

// Function to create a hash of a query
function hashQuery(query: string): string {
    return createHash('sha256').update(query).digest('hex');
}

// Function to find or create a normalized query
async function findOrCreateNormalizedQuery(databaseId: number, query: string) {
    const normalizedText = normalizeQuery(query);
    const normalizedHash = hashQuery(normalizedText);
    
    // Try to find existing normalized query
    const existing = await db.query.normalizedQueries.findFirst({
        where: and(
            eq(normalizedQueries.databaseId, databaseId),
            eq(normalizedQueries.normalizedHash, normalizedHash)
        )
    });
    
    if (existing) {
        return existing;
    }
    
    // Create new normalized query
    const [newQuery] = await db.insert(normalizedQueries).values({
        databaseId,
        normalizedText,
        normalizedHash,
        isKnown: false
    }).returning();
    
    return newQuery;
}

// Function to collect running queries from a database
async function collectRunningQueries(dbConnection: DatabaseConnection) {
    const query = `
        SELECT 
            pid,
            query,
            state,
            EXTRACT(EPOCH FROM (now() - query_start)) as duration
        FROM pg_stat_activity
        WHERE state = 'active'
        AND query NOT ILIKE '%pg_stat_activity%'
        AND query NOT ILIKE '%pg_stat_statements%'
    `;
    
    const result = await dbConnection.connection.query(query);
    return result.rows;
}

// Function to process and store query examples
async function processQueryExamples(
    sessionId: number,
    databaseId: number,
    queries: Array<{ query: string; duration: number }>
) {
    for (const { query, duration } of queries) {
        const normalizedQuery = await findOrCreateNormalizedQuery(databaseId, query);
        
        const example: InsertQueryExample = {
            normalizedQueryId: normalizedQuery.id,
            databaseId,
            sessionId,
            queryText: query,
            queryHash: hashQuery(query),
            executionTime: duration.toString()
        };
        
        await db.insert(queryExamples).values(example);
    }
}

// Function to check if a monitoring session should stop
async function shouldStopMonitoring(sessionId: number): Promise<boolean> {
    const session = await db.query.queryMonitoringSessions.findFirst({
        where: eq(queryMonitoringSessions.id, sessionId)
    });
    
    if (!session) return true;
    
    if (session.status !== 'running') return true;
    
    if (session.scheduledEndTime && new Date() > session.scheduledEndTime) return true;
    
    return false;
}

// Main monitoring function
export async function startQueryMonitoring(
    databaseId: number,
    userId: number,
    pollingIntervalSeconds: number = 60,
    scheduledEndTime?: Date
) {
    // Create monitoring session
    const [session] = await db.insert(queryMonitoringSessions).values({
        databaseId,
        userId,
        status: 'running',
        pollingIntervalSeconds,
        scheduledEndTime
    }).returning();
    
    // Start monitoring in background
    monitorQueries(session.id, databaseId, pollingIntervalSeconds).catch(console.error);
    
    return session;
}

// Function to stop monitoring
export async function stopQueryMonitoring(sessionId: number) {
    await db.update(queryMonitoringSessions)
        .set({
            status: 'stopped',
            stoppedAt: new Date()
        })
        .where(eq(queryMonitoringSessions.id, sessionId));
}

// Background monitoring function
async function monitorQueries(sessionId: number, databaseId: number, pollingIntervalSeconds: number) {
    const dbConnection = await getDatabaseConnection(databaseId);
    
    while (!(await shouldStopMonitoring(sessionId))) {
        try {
            const runningQueries = await collectRunningQueries(dbConnection);
            await processQueryExamples(sessionId, databaseId, runningQueries);
        } catch (error) {
            console.error('Error monitoring queries:', error);
        }
        
        // Wait for next polling interval
        await new Promise(resolve => setTimeout(resolve, pollingIntervalSeconds * 1000));
    }
    
    // Update session status to completed
    await db.update(queryMonitoringSessions)
        .set({
            status: 'completed',
            stoppedAt: new Date()
        })
        .where(eq(queryMonitoringSessions.id, sessionId));
}

// Function to get monitoring session status
export async function getMonitoringSessionStatus(sessionId: number) {
    return db.query.queryMonitoringSessions.findFirst({
        where: eq(queryMonitoringSessions.id, sessionId)
    });
}

// Function to get query examples for a normalized query
export async function getQueryExamples(normalizedQueryId: number) {
    return db.query.queryExamples.findMany({
        where: eq(queryExamples.normalizedQueryId, normalizedQueryId),
        orderBy: [desc(queryExamples.collectedAt)]
    });
} 