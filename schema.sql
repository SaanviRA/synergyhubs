-- Drop tables if they exist to start fresh
DROP TABLE IF EXISTS evaluation_logs CASCADE;
DROP TABLE IF EXISTS workspace_reads CASCADE;
DROP TABLE IF EXISTS workspace_messages CASCADE;
DROP TABLE IF EXISTS workspaces CASCADE;
DROP TABLE IF EXISTS resources CASCADE;
DROP TABLE IF EXISTS milestones CASCADE;
DROP TABLE IF EXISTS project_removals CASCADE;
DROP TABLE IF EXISTS project_members CASCADE;
DROP TABLE IF EXISTS projects CASCADE;
DROP TABLE IF EXISTS class_members CASCADE;
DROP TABLE IF EXISTS classes CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS app_settings CASCADE;
DROP TABLE IF EXISTS admin_webhooks CASCADE;

-- 1. USERS Table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    avatar VARCHAR(10) NOT NULL,
    password_hash VARCHAR(255) DEFAULT NULL,
    google_id VARCHAR(255) UNIQUE DEFAULT NULL,
    avatar_url TEXT DEFAULT NULL,
    is_me BOOLEAN DEFAULT FALSE,
    role VARCHAR(50) DEFAULT 'student' CHECK (role IN ('student', 'teacher')),
    -- New accounts cannot sign in until an admin approves them
    approved BOOLEAN NOT NULL DEFAULT FALSE,
    is_admin BOOLEAN NOT NULL DEFAULT FALSE,
    -- Shown on the account page; each user fills these in themselves
    school VARCHAR(150),
    academic_year VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 1b. APP_SETTINGS Table: site-wide switches that admins change from the app
CREATE TABLE app_settings (
    key VARCHAR(100) PRIMARY KEY,
    value BOOLEAN NOT NULL,
    updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 1c. ADMIN_WEBHOOKS Table: each admin's own Discord webhook and the events it receives
CREATE TABLE admin_webhooks (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    webhook_url TEXT NOT NULL,
    events TEXT[] NOT NULL DEFAULT ARRAY['user_added'],
    -- Set by a successful test message; from then on the app only shows the URL's host
    verified BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. CLASSES Table
CREATE TABLE classes (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    teacher VARCHAR(100) NOT NULL,
    join_code VARCHAR(20) UNIQUE,
    color VARCHAR(100) NOT NULL DEFAULT 'from-blue-500 to-indigo-600',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. CLASS_MEMBERS Table (Many-to-Many join table)
CREATE TABLE class_members (
    class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'student' CHECK (role IN ('student', 'teacher')),
    PRIMARY KEY (class_id, user_id)
);

-- 4. PROJECTS Table
CREATE TABLE projects (
    id SERIAL PRIMARY KEY,
    class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'present' CHECK (status IN ('past', 'present', 'future')),
    progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    color VARCHAR(100) NOT NULL,
    hue VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. PROJECT_MEMBERS Table (Many-to-Many join table with roles and updates)
CREATE TABLE project_members (
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    roles TEXT[] DEFAULT '{}',
    active_log TEXT,
    has_visited BOOLEAN DEFAULT FALSE,
    last_visited_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    visit_count INTEGER DEFAULT 0,
    -- Where a member who is not in the project's class files it ("Shared" when NULL)
    placed_class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
    PRIMARY KEY (project_id, user_id)
);

-- 5b. Members removed from a project's team. Visiting the project does not put them back;
--     inviting them again does.
CREATE TABLE project_removals (
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (project_id, user_id)
);

-- 6. MILESTONES Table
CREATE TABLE milestones (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
    title VARCHAR(255) NOT NULL,
    details TEXT,
    due_date VARCHAR(50) NOT NULL,
    -- The real due date the timeline is sorted by; due_date is its display label. NULL means TBD.
    due_on DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in-progress', 'completed', 'delayed')),
    assigned_to VARCHAR(100) DEFAULT 'Everyone',
    assigned_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    submission_file_name VARCHAR(255),
    submission_submitted_at VARCHAR(100),
    submission_file_url TEXT,
    -- When the milestone last moved to in-progress / completed
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- 7. RESOURCES Table
CREATE TABLE resources (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
    title VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('doc', 'document', 'link', 'website', 'image', 'video', 'article')),
    url TEXT,
    uploader VARCHAR(100) NOT NULL,
    uploader_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    date VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. WORKSPACES Table
CREATE TABLE workspaces (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
    title VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('figma', 'drive', 'miro', 'github', 'other')),
    url TEXT,
    creator VARCHAR(100) NOT NULL,
    creator_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    date VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8b. Chat about a workspace document. Each conversation belongs to one workspace.
CREATE TABLE workspace_messages (
    id SERIAL PRIMARY KEY,
    workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    author VARCHAR(100) NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX workspace_messages_workspace_id_idx ON workspace_messages (workspace_id, id);

-- 8c. How far each person has read each workspace's chat, for unread counts.
CREATE TABLE workspace_reads (
    workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    last_read_id INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (workspace_id, user_id)
);

-- 9. EVALUATION_LOGS Table
CREATE TABLE evaluation_logs (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    log_text TEXT NOT NULL,
    date VARCHAR(50) NOT NULL,
    log_type VARCHAR(50) DEFAULT 'work_log',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- -------------------------------------------------------------
-- MOCK DATA SEEDING
-- -------------------------------------------------------------

-- Seed users
INSERT INTO users (id, name, email, avatar, password_hash, is_me, role) VALUES
(1, 'Alex M.', 'alex@school.edu', 'AM', '$2b$10$qTMu4Y8CHtyrUeIn8I2TION5OUJ8ajaKilJKBsjVt6BD6lSvDTk8e', FALSE, 'student'),
(2, 'Sarah K.', 'sarah@school.edu', 'SK', '$2b$10$qTMu4Y8CHtyrUeIn8I2TION5OUJ8ajaKilJKBsjVt6BD6lSvDTk8e', FALSE, 'student'),
(3, 'You', 'saanvi@school.edu', 'JD', '$2b$10$qTMu4Y8CHtyrUeIn8I2TION5OUJ8ajaKilJKBsjVt6BD6lSvDTk8e', TRUE, 'student'),
(4, 'Mr. Davis', 'davis@school.edu', 'MD', '$2b$10$qTMu4Y8CHtyrUeIn8I2TION5OUJ8ajaKilJKBsjVt6BD6lSvDTk8e', FALSE, 'teacher'),
(5, 'Mrs. Smith', 'smith@school.edu', 'MS', '$2b$10$qTMu4Y8CHtyrUeIn8I2TION5OUJ8ajaKilJKBsjVt6BD6lSvDTk8e', FALSE, 'teacher');

UPDATE users SET approved = TRUE;

SELECT setval('users_id_seq', (SELECT MAX(id) FROM users));

-- Seed classes
INSERT INTO classes (id, name, teacher, join_code, color) VALUES
(1, 'AP US History', 'Mr. Davis', '8XYZ-2PLQ', 'from-blue-500 to-indigo-600'),
(2, 'Biology 101', 'Mrs. Smith', '4ABC-7XYZ', 'from-emerald-400 to-teal-500');

SELECT setval('classes_id_seq', (SELECT MAX(id) FROM classes));

-- Seed class membership
INSERT INTO class_members (class_id, user_id, role) VALUES
(1, 1, 'student'),
(1, 2, 'student'),
(1, 3, 'student'),
(1, 4, 'teacher'),
(2, 1, 'student'),
(2, 2, 'student'),
(2, 3, 'student'),
(2, 5, 'teacher');

-- Seed projects
INSERT INTO projects (id, class_id, name, status, progress, color, hue) VALUES
(101, 1, 'Cold War Perspectives', 'present', 65, 'from-blue-500 to-indigo-600', 'blue'),
(102, 1, 'Industrial Revolution', 'past', 100, 'from-gray-500 to-gray-600', 'gray'),
(103, 1, 'Civil Rights Movement', 'future', 0, 'from-amber-400 to-amber-600', 'amber'),
(201, 2, 'Ecosystem Simulation', 'present', 20, 'from-emerald-400 to-teal-500', 'emerald'),
(202, 2, 'Cellular Mitosis Lab', 'past', 100, 'from-gray-500 to-gray-600', 'gray');

SELECT setval('projects_id_seq', (SELECT MAX(id) FROM projects));

-- Seed project members for Project 101
INSERT INTO project_members (project_id, user_id, roles, active_log, has_visited, last_visited_at, visit_count) VALUES
(101, 1, ARRAY['Researcher'], 'Found 3 primary sources on JFK.', TRUE, CURRENT_TIMESTAMP - INTERVAL '25 minutes', 5),
(101, 2, ARRAY['Editor'], 'Reviewed Alex''s sources, drafted outline.', TRUE, CURRENT_TIMESTAMP - INTERVAL '2 hours', 3),
(101, 3, ARRAY['Presenter'], 'Created slide deck template.', TRUE, CURRENT_TIMESTAMP - INTERVAL '5 minutes', 8);

-- Seed milestones for Project 101
INSERT INTO milestones (id, project_id, title, details, due_date, status, assigned_to, assigned_user_id, submission_file_name, submission_submitted_at) VALUES
(1, 101, 'Topic Selection & Approval', 'Decide on the Cold War era and get Mr. Davis to approve it.', 'Mar 11', 'completed', 'Everyone', NULL, 'Topic_Proposal_SpaceRace.pdf', 'Mar 11, 4:30 PM'),
(2, 101, 'Gather Primary Sources', 'Find at least 5 primary sources from the 1960s regarding the Space Race.', 'Mar 18 (Today)', 'in-progress', 'Everyone', 1, NULL, NULL),
(3, 101, 'Draft Introduction', 'Write the first 2 pages of the introduction establishing context.', 'Mar 21', 'delayed', 'Everyone', 2, NULL, NULL),
(4, 101, 'Create Presentation Slides', 'Design the slide deck using the NextHub template.', 'Mar 25', 'pending', 'Everyone', 3, NULL, NULL);

SELECT setval('milestones_id_seq', (SELECT MAX(id) FROM milestones));

-- Seed resources for Project 101
INSERT INTO resources (id, project_id, title, type, url, uploader, uploader_id, date) VALUES
(1, 101, 'Project Rubric', 'doc', '#', 'Mr. Davis', 4, 'Mar 10'),
(2, 101, 'JFK Speech Transcript', 'link', 'https://www.jfklibrary.org/', 'Alex M.', 1, 'Mar 11'),
(3, 101, 'Cold War Political Cartoons', 'image', '#', 'Sarah K.', 2, 'Mar 14'),
(4, 101, 'Draft Outline v1', 'doc', '#', 'You', 3, 'Mar 18');

SELECT setval('resources_id_seq', (SELECT MAX(id) FROM resources));

-- Seed evaluation logs for Project 101
INSERT INTO evaluation_logs (id, project_id, user_id, log_text, date, log_type) VALUES
(1, 101, 3, 'Researched presentation tools and settled on NextHub flow.', 'Mar 14', 'work_log'),
(2, 101, 3, 'Attended group meeting, decided on the Cold War topic.', 'Mar 11', 'work_log'),
(3, 101, 1, 'Collected 5 archival speech transcripts from the JFK library.', 'Mar 15', 'work_log'),
(4, 101, 1, 'Organized primary sources folder with citation tags.', 'Mar 17', 'status_update'),
(5, 101, 2, 'Reviewed speech transcripts and drafted thesis paragraph.', 'Mar 16', 'work_log'),
(6, 101, 2, 'Outlined 4 main sections for the final research essay.', 'Mar 18', 'status_update');

SELECT setval('evaluation_logs_id_seq', (SELECT MAX(id) FROM evaluation_logs));
