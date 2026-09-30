import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  const migrationPath = path.resolve(__dirname, '../migration.sql');
  console.log(`Reading migration script from: ${migrationPath}`);
  
  if (!fs.existsSync(migrationPath)) {
    console.error(`Migration file not found at ${migrationPath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(migrationPath, 'utf8');

  try {
    console.log('Connecting to database and executing migration...');
    await pool.query(sql);
    console.log('✓ Migration executed successfully without data loss!');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

runMigration();
