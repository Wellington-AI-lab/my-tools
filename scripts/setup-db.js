const { Client } = require('pg');

async function setupDatabase() {
  const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;

  if (!connectionString) {
    console.error('POSTGRES_URL not set');
    process.exit(1);
  }

  const client = new Client({ connectionString });

  try {
    await client.connect();
    console.log('✓ Connected to database');

    // Check if table exists
    const checkResult = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'intelligence_sources'
      )
    `);

    const tableExists = checkResult.rows[0].exists;
    console.log(`Table 'intelligence_sources' exists: ${tableExists}`);

    if (!tableExists) {
      console.log('Creating table...');
      await client.query(`
        CREATE TABLE intelligence_sources (
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
        )
      `);
      console.log('✓ Table created');

      await client.query('CREATE INDEX idx_intelligence_sources_active ON intelligence_sources(is_active)');
      await client.query('CREATE INDEX idx_intelligence_sources_strategy ON intelligence_sources(strategy)');
      await client.query('CREATE INDEX idx_intelligence_sources_category ON intelligence_sources(category)');
      console.log('✓ Indexes created');
    }

    // Query table
    const result = await client.query('SELECT COUNT(*) FROM intelligence_sources');
    console.log(`\n✓ Row count: ${result.rows[0].count}`);

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

setupDatabase();
