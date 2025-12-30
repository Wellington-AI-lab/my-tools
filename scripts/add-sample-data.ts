/**
 * Add sample data to intelligence_sources table
 */

import pg from 'pg';
const { Client } = pg;
import { config } from 'dotenv';
config({ path: '.env.local' });

async function addSampleData() {
  console.log('Adding sample data...');

  const client = new Client({
    connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
  });

  await client.connect();

  try {
    // Check current count
    const countResult = await client.query('SELECT COUNT(*) as count FROM intelligence_sources');
    console.log('Current count:', countResult.rows[0].count);

    if (parseInt(countResult.rows[0].count) === 0) {
      // Add sample data
      await client.query(`
        INSERT INTO intelligence_sources (name, url, strategy, rsshub_path, category, is_active)
        VALUES 
          ('TechCrunch', 'https://techcrunch.com/feed/', 'DIRECT', NULL, 'tech', 1),
          ('Hacker News', 'https://news.ycombinator.com/rss', 'DIRECT', NULL, 'tech', 1),
          ('OpenAI Blog', 'https://openai.com/blog/rss.xml', 'DIRECT', NULL, 'ai', 1),
          ('Anthropic Blog', 'https://www.anthropic.com/index/rss', 'DIRECT', NULL, 'ai', 1)
      `);
      console.log('✓ Added 4 sample sources');
    } else {
      console.log('Data already exists, skipping...');
    }

    // Show all sources
    const sources = await client.query('SELECT * FROM intelligence_sources ORDER BY id');
    console.log('\nAll sources:');
    console.table(sources.rows);

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

addSampleData();
