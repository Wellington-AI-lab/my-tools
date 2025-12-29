/**
 * Initialize Postgres database (works with Prisma Postgres)
 * Run with: npx tsx scripts/init-db.ts
 */

import pg from 'pg';

const { Client } = pg;

// Load environment from .env.local
import { config } from 'dotenv';
config({ path: '.env.local' });

async function initDatabase() {
  console.log('Initializing database...');

  const client = new Client({
    connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
  });

  await client.connect();

  try {
    // Create intelligence_sources table
    await client.query(`
      CREATE TABLE IF NOT EXISTS intelligence_sources (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        url TEXT NOT NULL,
        strategy VARCHAR(20) NOT NULL CHECK (strategy IN ('DIRECT', 'RSSHUB')),
        rsshub_path TEXT,
        category VARCHAR(100),
        weight REAL DEFAULT 1.0,
        logic_filter TEXT,
        is_active INTEGER DEFAULT 1,
        reliability_score REAL DEFAULT 1.0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        last_scraped_at TIMESTAMP WITH TIME ZONE
      );
    `);
    console.log('✓ Created intelligence_sources table');

    // Create indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_intelligence_sources_active ON intelligence_sources(is_active);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_intelligence_sources_strategy ON intelligence_sources(strategy);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_intelligence_sources_category ON intelligence_sources(category);`);
    console.log('✓ Created indexes');

    console.log('Database initialized successfully!');
  } catch (error) {
    console.error('Error initializing database:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

initDatabase();
