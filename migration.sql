-- ============================================================================
-- Migration: Add student visit tracking & update history support
-- Safe to run on existing, running database without dropping tables or losing data
-- ============================================================================

BEGIN;

-- 1. Ensure composite unique constraints exist on users table
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_google_id_key;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_role_key;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_google_id_role_key;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'users_email_role_key'
    ) THEN
        ALTER TABLE users ADD CONSTRAINT users_email_role_key UNIQUE (email, role);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'users_google_id_role_key'
    ) THEN
        ALTER TABLE users ADD CONSTRAINT users_google_id_role_key UNIQUE (google_id, role);
    END IF;
END $$;

-- 1b. Account approval and admins. Accounts that exist when approval is introduced are
--     approved once, when the column is first created; every later account starts unapproved.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'approved'
    ) THEN
        ALTER TABLE users ADD COLUMN approved BOOLEAN NOT NULL DEFAULT FALSE;
        UPDATE users SET approved = TRUE;
    END IF;
END $$;

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- 1c. Site-wide settings admins change from the app (such as auto_approve_signups).
--     A missing row means the setting is off.
CREATE TABLE IF NOT EXISTS app_settings (
    key VARCHAR(100) PRIMARY KEY,
    value BOOLEAN NOT NULL,
    updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 1d. Each admin's own Discord webhook and the events it receives.
CREATE TABLE IF NOT EXISTS admin_webhooks (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    webhook_url TEXT NOT NULL,
    events TEXT[] NOT NULL DEFAULT ARRAY['user_added'],
    -- Set by a successful test message; from then on the app only shows the URL's host
    verified BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
-- Tables created before webhooks could be verified; their URLs stay visible until tested
ALTER TABLE admin_webhooks ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Add visit tracking columns to project_members table.
--    Members that predate visit tracking are backfilled as visited, once, when the
--    column is first created. Re-running this script never resets visit status.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'project_members' AND column_name = 'has_visited'
    ) THEN
        ALTER TABLE project_members ADD COLUMN has_visited BOOLEAN DEFAULT FALSE;
        UPDATE project_members SET has_visited = TRUE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'project_members' AND column_name = 'visit_count'
    ) THEN
        ALTER TABLE project_members ADD COLUMN visit_count INTEGER DEFAULT 0;
        UPDATE project_members SET visit_count = 1 WHERE has_visited;
    END IF;
END $$;

ALTER TABLE project_members
    ADD COLUMN IF NOT EXISTS last_visited_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- 2b. Let a member who was invited to a single project (and is not in its class) file it
--     under one of their own classes. NULL keeps it in their "Shared" class.
ALTER TABLE project_members
    ADD COLUMN IF NOT EXISTS placed_class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL;

-- 3. Add log_type column to evaluation_logs table
ALTER TABLE evaluation_logs 
    ADD COLUMN IF NOT EXISTS log_type VARCHAR(50) DEFAULT 'work_log';

-- 5. Backfill existing evaluation_logs with default log_type
UPDATE evaluation_logs
SET log_type = 'work_log'
WHERE log_type IS NULL;

-- 6. Recalculate and synchronize overall progress for existing projects based on milestones
UPDATE projects p
SET progress = COALESCE(
    (
        SELECT ROUND((COUNT(*) FILTER (WHERE m.status = 'completed')::NUMERIC / NULLIF(COUNT(*), 0)::NUMERIC) * 100)
        FROM milestones m
        WHERE m.project_id = p.id
    ),
    p.progress
)
WHERE EXISTS (
    SELECT 1 FROM milestones m WHERE m.project_id = p.id
);

-- 7. Seed initial update history for existing students if they don't have logs yet
INSERT INTO evaluation_logs (project_id, user_id, log_text, date, log_type)
SELECT 101, 1, 'Collected 5 archival speech transcripts from the JFK library.', 'Mar 15', 'work_log'
WHERE EXISTS (SELECT 1 FROM projects WHERE id = 101)
  AND EXISTS (SELECT 1 FROM users WHERE id = 1)
  AND NOT EXISTS (
    SELECT 1 FROM evaluation_logs 
    WHERE project_id = 101 AND user_id = 1 AND log_text = 'Collected 5 archival speech transcripts from the JFK library.'
  );

INSERT INTO evaluation_logs (project_id, user_id, log_text, date, log_type)
SELECT 101, 1, 'Organized primary sources folder with citation tags.', 'Mar 17', 'status_update'
WHERE EXISTS (SELECT 1 FROM projects WHERE id = 101)
  AND EXISTS (SELECT 1 FROM users WHERE id = 1)
  AND NOT EXISTS (
    SELECT 1 FROM evaluation_logs 
    WHERE project_id = 101 AND user_id = 1 AND log_text = 'Organized primary sources folder with citation tags.'
  );

INSERT INTO evaluation_logs (project_id, user_id, log_text, date, log_type)
SELECT 101, 2, 'Reviewed speech transcripts and drafted thesis paragraph.', 'Mar 16', 'work_log'
WHERE EXISTS (SELECT 1 FROM projects WHERE id = 101)
  AND EXISTS (SELECT 1 FROM users WHERE id = 2)
  AND NOT EXISTS (
    SELECT 1 FROM evaluation_logs 
    WHERE project_id = 101 AND user_id = 2 AND log_text = 'Reviewed speech transcripts and drafted thesis paragraph.'
  );

INSERT INTO evaluation_logs (project_id, user_id, log_text, date, log_type)
SELECT 101, 2, 'Outlined 4 main sections for the final research essay.', 'Mar 18', 'status_update'
WHERE EXISTS (SELECT 1 FROM projects WHERE id = 101)
  AND EXISTS (SELECT 1 FROM users WHERE id = 2)
  AND NOT EXISTS (
    SELECT 1 FROM evaluation_logs 
    WHERE project_id = 101 AND user_id = 2 AND log_text = 'Outlined 4 main sections for the final research essay.'
  );

-- 8. Synchronize evaluation_logs sequence
SELECT setval('evaluation_logs_id_seq', (SELECT GREATEST(MAX(id), 1) FROM evaluation_logs));

COMMIT;
