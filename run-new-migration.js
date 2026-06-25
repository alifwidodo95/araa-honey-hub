import pg from 'pg';
import fs from 'fs';

const client = new pg.Client({
  host: 'aws-1-ap-northeast-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.saefgyiloalpiqfrglqo',
  password: 'Handayani01',
  ssl: {
    rejectUnauthorized: false
  }
});

const sqlFilePath = 'C:/Users/USER/.gemini/antigravity/scratch/araa-honey-hub/supabase/migrations/20260626000000_backfill_crm_reminders.sql';

async function main() {
  try {
    const sql = fs.readFileSync(sqlFilePath, 'utf8');
    await client.connect();
    console.log('Connected to PostgreSQL.');
    await client.query(sql);
    console.log('New Migration SQL executed successfully!');
  } catch (err) {
    console.error('Error executing migration:', err);
  } finally {
    await client.end();
  }
}

main();
