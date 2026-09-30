import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env variables from root directory's .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'group_app_db',
  user: process.env.DB_USER || 'pguser',
  password: process.env.DB_PASSWORD || 'pgpassword',
});

// Test the connection
pool.connect((err, client, release) => {
  if (err) {
    return console.error('Error connecting to PostgreSQL:', err.stack);
  }
  console.log('Successfully connected to local PostgreSQL database.');

  // Run migration DDL queries to allow same email/google_id across different roles and add tracking fields
  const migrationQueries = `
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_google_id_key;
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_role_key;
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_google_id_role_key;
    ALTER TABLE users ADD CONSTRAINT users_email_role_key UNIQUE (email, role);
    ALTER TABLE users ADD CONSTRAINT users_google_id_role_key UNIQUE (google_id, role);

    ALTER TABLE project_members ADD COLUMN IF NOT EXISTS has_visited BOOLEAN DEFAULT FALSE;
    ALTER TABLE project_members ADD COLUMN IF NOT EXISTS last_visited_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE project_members ADD COLUMN IF NOT EXISTS visit_count INTEGER DEFAULT 0;

    ALTER TABLE evaluation_logs ADD COLUMN IF NOT EXISTS log_type VARCHAR(50) DEFAULT 'work_log';

    -- Ensure initial seed project members have visited status populated
    UPDATE project_members SET has_visited = TRUE, visit_count = GREATEST(visit_count, 1) WHERE has_visited IS NOT TRUE;
  `;
  client.query(migrationQueries, (migErr) => {
    release();
    if (migErr) {
      console.error('Error running DDL migration queries:', migErr);
    } else {
      console.log('Successfully completed DDL migration for composite constraints, visit tracking, and log types.');
    }
  });
});

export default pool;
