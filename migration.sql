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

-- 1e. Chat about a workspace document. Each conversation belongs to one workspace.
CREATE TABLE IF NOT EXISTS workspace_messages (
    id SERIAL PRIMARY KEY,
    workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    author VARCHAR(100) NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS workspace_messages_workspace_id_idx ON workspace_messages (workspace_id, id);

-- 1f. How far each person has read each workspace's chat, for unread counts.
CREATE TABLE IF NOT EXISTS workspace_reads (
    workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    last_read_id INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (workspace_id, user_id)
);

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

-- 2b. Let a user file any project under one of their own classes. Only changes where that user
--     sees it. This used to be project_members.placed_class_id, for shared projects only; any
--     placements made there are carried over once and the column is dropped.
CREATE TABLE IF NOT EXISTS project_placements (
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE NOT NULL,
    PRIMARY KEY (project_id, user_id)
);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'project_members' AND column_name = 'placed_class_id'
    ) THEN
        EXECUTE 'INSERT INTO project_placements (project_id, user_id, class_id)
                 SELECT project_id, user_id, placed_class_id FROM project_members
                 WHERE placed_class_id IS NOT NULL
                 ON CONFLICT DO NOTHING';
        ALTER TABLE project_members DROP COLUMN placed_class_id;
    END IF;
END $$;

-- 2c. Members removed from a project's team. Visiting the project does not put them back;
--     inviting them again does.
CREATE TABLE IF NOT EXISTS project_removals (
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (project_id, user_id)
);

-- 2d. Give milestones a real due date so the timeline can be sorted. Older milestones only have a
--     label like 'Mar 11' or 'Mar 18 (Today)', so their date is read from it: in the year the project
--     was created, or the next year when that would land more than a month before the project
--     existed. Labels that can't be read (such as 'TBD') stay undated and sort last.
ALTER TABLE milestones ADD COLUMN IF NOT EXISTS due_on DATE;

DO $$
DECLARE
    m RECORD;
    guess DATE;
BEGIN
    FOR m IN
        SELECT ms.id, substring(ms.due_date FROM '^([A-Z][a-z]{2} [0-9]{1,2})') AS label, p.created_at
        FROM milestones ms JOIN projects p ON p.id = ms.project_id
        WHERE ms.due_on IS NULL AND ms.due_date ~ '^[A-Z][a-z]{2} [0-9]{1,2}'
    LOOP
        BEGIN
            guess := to_date(m.label || ' ' || EXTRACT(YEAR FROM m.created_at), 'Mon DD YYYY');
            IF guess < m.created_at::date - 30 THEN
                guess := guess + INTERVAL '1 year';
            END IF;
            UPDATE milestones SET due_on = guess WHERE id = m.id;
        EXCEPTION WHEN OTHERS THEN
            -- Not a real date (such as 'Feb 30'): leave it undated
            NULL;
        END;
    END LOOP;
END $$;

-- 2e. Remember when a milestone moved to in-progress and to completed, so the timeline can show it.
--     Milestones changed before this have no record of when, so they stay NULL.
ALTER TABLE milestones ADD COLUMN IF NOT EXISTS started_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE milestones ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE;

-- 2f. Let each user set their own school and academic year on the account page
ALTER TABLE users ADD COLUMN IF NOT EXISTS school VARCHAR(150);
ALTER TABLE users ADD COLUMN IF NOT EXISTS academic_year VARCHAR(20);

-- 2g. Projects a student deleted. Deleting only hides the project from that student; it is
--     erased once nobody has it any more. Rejoining its class or being invited again brings it back.
CREATE TABLE IF NOT EXISTS project_deletions (
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (project_id, user_id)
);

-- 2h. Workspaces can be Canva or Microsoft links. Figma, Miro and GitHub are no longer offered
--     but stay valid for workspaces that already use them.
ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS workspaces_type_check;
ALTER TABLE workspaces ADD CONSTRAINT workspaces_type_check
    CHECK (type IN ('drive', 'canva', 'microsoft', 'other', 'figma', 'miro', 'github'));

-- 2i. Safety check for chat. Messages the check holds are seen only by their writer until the class
--     teacher reviews them. Reviewed flags are deleted after 180 days, with messages that were removed.
ALTER TABLE workspace_messages ADD COLUMN IF NOT EXISTS status VARCHAR(10) NOT NULL DEFAULT 'visible'
    CHECK (status IN ('visible', 'held', 'removed'));
CREATE TABLE IF NOT EXISTS moderation_flags (
    id SERIAL PRIMARY KEY,
    message_id INTEGER REFERENCES workspace_messages(id) ON DELETE CASCADE NOT NULL,
    action VARCHAR(10) NOT NULL CHECK (action IN ('review', 'block', 'escalate')),
    categories TEXT[] NOT NULL,
    scores JSONB NOT NULL DEFAULT '{}',
    model_version VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    decision VARCHAR(20) CHECK (decision IN ('approved', 'removed', 'false_positive'))
);
CREATE INDEX IF NOT EXISTS moderation_flags_open_idx ON moderation_flags (created_at) WHERE reviewed_at IS NULL;

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
