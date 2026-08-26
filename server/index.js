import express from 'express';
import cors from 'cors';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import pool from './db.js';

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

// Helper for Mock Current User fallback (saanvi/You, ID = 3)
const CURRENT_USER_ID = 3;
const CURRENT_USER_NAME = 'You';

const googleClient = new OAuth2Client(process.env.VITE_GOOGLE_CLIENT_ID);
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_for_dev';
const SALT_ROUNDS = 10;

// Middleware for JWT Authentication
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    // Fallback to mock user for backward compatibility
    req.userId = CURRENT_USER_ID;
    req.userName = CURRENT_USER_NAME;
    return next();
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired authentication token' });
    }
    req.userId = decoded.id;
    req.userName = decoded.name;
    next();
  });
};

// Apply auth middleware globally
app.use(authenticateToken);

// Helper: Generate JWT Token
const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
};

// Helper: Extract Initials for Avatar fallback
const getInitials = (name) => {
  return name ? name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : 'US';
};

// -------------------------------------------------------------
// AUTHENTICATION ENDPOINTS
// -------------------------------------------------------------

app.post('/api/auth/signup', async (req, res) => {
  const { name, email, password, role } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  try {
    const normalizedEmail = email.trim().toLowerCase();
    const targetRole = role || 'student';

    // Check if email already exists for this specific role
    const userCheck = await pool.query('SELECT id FROM users WHERE email = $1 AND role = $2', [normalizedEmail, targetRole]);
    if (userCheck.rows.length > 0) {
      return res.status(409).json({ error: `An account with this email already exists as a ${targetRole}` });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const avatar = getInitials(name);

    // Insert user
    const newUser = await pool.query(
      `INSERT INTO users (name, email, avatar, password_hash, role, is_me) 
       VALUES ($1, $2, $3, $4, $5, FALSE) 
       RETURNING id, name, email, avatar, role`,
      [name.trim(), normalizedEmail, avatar, hashedPassword, targetRole]
    );

    const user = newUser.rows[0];
    const token = generateToken(user);

    res.status(201).json({ token, user });
  } catch (err) {
    console.error('Sign Up Error:', err);
    res.status(500).json({ error: 'Internal server error during registration' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password, role } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const normalizedEmail = email.trim().toLowerCase();
    const targetRole = role || 'student';

    // Get user from database matching email and role
    const userQuery = await pool.query('SELECT * FROM users WHERE email = $1 AND role = $2', [normalizedEmail, targetRole]);
    if (userQuery.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = userQuery.rows[0];

    // Check if user registered via Google only (no password)
    if (!user.password_hash) {
      return res.status(400).json({ 
        error: 'This account was created with Google Sign-In. Please click the Google button to access.' 
      });
    }

    // Validate password
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken(user);

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, avatar: user.avatar, role: user.role }
    });
  } catch (err) {
    console.error('Login Error:', err);
    res.status(500).json({ error: 'Internal server error during login' });
  }
});

app.post('/api/auth/google', async (req, res) => {
  const { idToken, role } = req.body;

  if (!idToken) {
    return res.status(400).json({ error: 'Google ID Token is required' });
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.VITE_GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;
    const normalizedEmail = email.toLowerCase();

    const targetRole = role || 'student';

    let userQuery = await pool.query(
      'SELECT id, name, email, avatar, google_id, role FROM users WHERE (google_id = $1 OR email = $2) AND role = $3',
      [googleId, normalizedEmail, targetRole]
    );

    let user;

    if (userQuery.rows.length > 0) {
      user = userQuery.rows[0];

      if (!user.google_id) {
        const updateQuery = await pool.query(
          'UPDATE users SET google_id = $1, avatar_url = $2 WHERE id = $3 RETURNING id, name, email, avatar, role',
          [googleId, picture, user.id]
        );
        user = updateQuery.rows[0];
      }
    } else {
      const avatar = getInitials(name);
      const insertQuery = await pool.query(
        `INSERT INTO users (name, email, avatar, google_id, avatar_url, role) 
         VALUES ($1, $2, $3, $4, $5, $6) 
         RETURNING id, name, email, avatar, role`,
        [name, normalizedEmail, avatar, googleId, picture, targetRole]
      );
      user = insertQuery.rows[0];
    }

    const token = generateToken(user);

    res.json({ token, user });
  } catch (err) {
    console.error('Google Auth Error:', err);
    res.status(400).json({ error: 'Invalid Google signature or token' });
  }
});

// -------------------------------------------------------------
// USER PROFILE ENDPOINTS
// -------------------------------------------------------------

// Fetch details for the current user
app.get('/api/users/me', async (req, res) => {
  try {
    const userQuery = await pool.query('SELECT id, name, email, avatar, role, is_me FROM users WHERE id = $1', [req.userId]);
    if (userQuery.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(userQuery.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error fetching profile' });
  }
});

// Update the current user details
app.put('/api/users/me', async (req, res) => {
  const { name, email } = req.body;
  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required' });
  }
  try {
    const updateQuery = await pool.query(
      'UPDATE users SET name = $1, email = $2 WHERE id = $3 RETURNING id, name, email, avatar, role, is_me',
      [name.trim(), email.trim().toLowerCase(), req.userId]
    );
    if (updateQuery.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(updateQuery.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error updating profile' });
  }
});

// -------------------------------------------------------------
// CLASSES & PROJECTS ENDPOINTS
// -------------------------------------------------------------

app.get('/api/classes', async (req, res) => {
  try {
    const classesQuery = await pool.query(
      `SELECT c.* FROM classes c 
       JOIN class_members cm ON c.id = cm.class_id 
       WHERE cm.user_id = $1 
       ORDER BY c.id ASC`,
      [req.userId]
    );
    const projectsQuery = await pool.query('SELECT * FROM projects ORDER BY id ASC');
    const membersQuery = await pool.query(
      'SELECT class_id, COUNT(*) as member_count FROM class_members GROUP BY class_id'
    );

    const memberCounts = {};
    membersQuery.rows.forEach(row => {
      memberCounts[row.class_id] = parseInt(row.member_count);
    });

    const classes = classesQuery.rows.map(cls => {
      const classProjects = projectsQuery.rows
        .filter(p => p.class_id === cls.id)
        .map(p => ({
          id: p.id,
          name: p.name,
          status: p.status,
          progress: p.progress,
          color: p.color,
          hue: p.hue
        }));

      return {
        id: cls.id,
        name: cls.name,
        teacher: cls.teacher,
        color: cls.color,
        members: memberCounts[cls.id] || 0,
        projects: classProjects
      };
    });

    res.json(classes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error fetching classes' });
  }
});

// Join a class using an invite code
app.post('/api/classes/join', async (req, res) => {
  const { joinCode } = req.body;
  if (!joinCode) return res.status(400).json({ error: 'Join code is required' });

  try {
    const classResult = await pool.query('SELECT * FROM classes WHERE UPPER(join_code) = UPPER($1)', [joinCode.trim()]);
    if (classResult.rows.length === 0) {
      return res.status(404).json({ error: 'Class not found with that invite code' });
    }
    const cls = classResult.rows[0];

    // Check if user is already a member
    const memberCheck = await pool.query(
      'SELECT * FROM class_members WHERE class_id = $1 AND user_id = $2',
      [cls.id, req.userId]
    );

    if (memberCheck.rows.length === 0) {
      // Add user to class
      await pool.query(
        'INSERT INTO class_members (class_id, user_id, role) VALUES ($1, $2, \'student\')',
        [cls.id, req.userId]
      );
      
      // Also automatically assign them to a default project if one exists in this class
      const projectResult = await pool.query(
        'SELECT id FROM projects WHERE class_id = $1 LIMIT 1',
        [cls.id]
      );
      if (projectResult.rows.length > 0) {
        const projectId = projectResult.rows[0].id;
        await pool.query(
          'INSERT INTO project_members (project_id, user_id, roles, active_log) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
          [projectId, req.userId, ['Collaborator'], 'Just joined the project!']
        );
      }
    }

    res.json({ success: true, classId: cls.id, name: cls.name });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error joining class' });
  }
});

// Create a new class (Teacher only)
app.post('/api/classes', async (req, res) => {
  const { className } = req.body;
  if (!className || !className.trim()) {
    return res.status(400).json({ error: 'Class name is required' });
  }

  try {
    // 1. Get teacher's name and verify role
    const userQuery = await pool.query('SELECT name, role FROM users WHERE id = $1', [req.userId]);
    if (userQuery.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const user = userQuery.rows[0];
    if (user.role !== 'teacher') {
      return res.status(403).json({ error: 'Only teachers can create classes' });
    }

    // 2. Generate a unique join code: [0-9][A-Z]{3}-[0-9][A-Z]{3}
    let joinCode = '';
    let codeUnique = false;
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const nums = '0123456789';
    const randNum = () => nums[Math.floor(Math.random() * nums.length)];
    const randChar = () => chars[Math.floor(Math.random() * chars.length)];

    while (!codeUnique) {
      joinCode = `${randNum()}${randChar()}${randChar()}${randChar()}-${randNum()}${randChar()}${randChar()}${randChar()}`;
      const codeCheck = await pool.query('SELECT id FROM classes WHERE UPPER(join_code) = UPPER($1)', [joinCode]);
      if (codeCheck.rows.length === 0) {
        codeUnique = true;
      }
    }

    // 3. Choose a random color gradient
    const colors = [
      'from-blue-500 to-indigo-600',
      'from-emerald-400 to-teal-500',
      'from-rose-500 to-pink-600',
      'from-amber-400 to-orange-500',
      'from-violet-500 to-purple-600',
      'from-cyan-400 to-blue-500'
    ];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];

    // 4. Insert the class
    const insertClassResult = await pool.query(
      'INSERT INTO classes (name, teacher, join_code, color) VALUES ($1, $2, $3, $4) RETURNING *',
      [className.trim(), user.name, joinCode, randomColor]
    );
    const newClass = insertClassResult.rows[0];

    // 5. Add teacher to class members
    await pool.query(
      'INSERT INTO class_members (class_id, user_id, role) VALUES ($1, $2, \'teacher\')',
      [newClass.id, req.userId]
    );

    res.json({ success: true, class: { id: newClass.id, name: newClass.name, joinCode: newClass.join_code } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error creating class' });
  }
});

// -------------------------------------------------------------
// TEAM HUB ENDPOINTS
// -------------------------------------------------------------

// Fetch project team members
app.get('/api/projects/:projectId/team', async (req, res) => {
  const { projectId } = req.params;
  try {
    const teamResult = await pool.query(
      `SELECT u.id, u.name, u.email, u.avatar, u.is_me, pm.roles, pm.active_log as "activeLog"
       FROM project_members pm
       JOIN users u ON pm.user_id = u.id
       WHERE pm.project_id = $1
       ORDER BY u.id ASC`,
      [projectId]
    );
    res.json(teamResult.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error fetching team members' });
  }
});

// Invite a teammate by email
app.post('/api/projects/:projectId/team/invite', async (req, res) => {
  const { projectId } = req.params;
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  try {
    const namePart = email.split('@')[0];
    const avatar = namePart.substring(0, 2).toUpperCase();

    // Check if user exists
    let userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email.trim().toLowerCase()]);
    let user;
    if (userResult.rows.length === 0) {
      // Create new user
      const newUser = await pool.query(
        'INSERT INTO users (name, email, avatar, is_me) VALUES ($1, $2, $3, FALSE) RETURNING *',
        [namePart, email.trim().toLowerCase(), avatar]
      );
      user = newUser.rows[0];
    } else {
      user = userResult.rows[0];
    }

    // Add to class if not member
    const projectInfo = await pool.query('SELECT class_id FROM projects WHERE id = $1', [projectId]);
    if (projectInfo.rows.length > 0) {
      const classId = projectInfo.rows[0].class_id;
      await pool.query(
        'INSERT INTO class_members (class_id, user_id, role) VALUES ($1, $2, \'student\') ON CONFLICT DO NOTHING',
        [classId, user.id]
      );
    }

    // Add to project
    await pool.query(
      'INSERT INTO project_members (project_id, user_id, roles, active_log) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
      [projectId, user.id, [], 'Just joined the project!']
    );

    res.json({ success: true, member: { id: user.id, name: user.name, avatar: user.avatar, roles: [], activeLog: 'Just joined the project!' } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error inviting teammate' });
  }
});

// Add a role to a member
app.post('/api/projects/:projectId/team/role', async (req, res) => {
  const { projectId } = req.params;
  const { userId, role } = req.body;

  try {
    await pool.query(
      'UPDATE project_members SET roles = array_append(roles, $1) WHERE project_id = $2 AND user_id = $3 AND NOT ($1 = ANY(roles))',
      [role, projectId, userId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error adding role' });
  }
});

// Remove a role from a member
app.delete('/api/projects/:projectId/team/role', async (req, res) => {
  const { projectId } = req.params;
  const { userId, role } = req.body;

  try {
    await pool.query(
      'UPDATE project_members SET roles = array_remove(roles, $1) WHERE project_id = $2 AND user_id = $3',
      [role, projectId, userId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error removing role' });
  }
});

// Post a status update (visible to everyone)
app.post('/api/projects/:projectId/team/update', async (req, res) => {
  const { projectId } = req.params;
  const { text } = req.body;

  try {
    await pool.query(
      'UPDATE project_members SET active_log = $1 WHERE project_id = $2 AND user_id = $3',
      [text, projectId, req.userId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error posting status update' });
  }
});

// Fetch private logs for current user
app.get('/api/projects/:projectId/logs', async (req, res) => {
  const { projectId } = req.params;
  try {
    const logsResult = await pool.query(
      'SELECT id, log_text as text, date FROM evaluation_logs WHERE project_id = $1 AND user_id = $2 ORDER BY id DESC',
      [projectId, req.userId]
    );
    res.json(logsResult.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error fetching logs' });
  }
});

// Add a private work log
app.post('/api/projects/:projectId/logs', async (req, res) => {
  const { projectId } = req.params;
  const { text } = req.body;

  const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  try {
    // Save to private logs
    const newLogResult = await pool.query(
      'INSERT INTO evaluation_logs (project_id, user_id, log_text, date) VALUES ($1, $2, $3, $4) RETURNING id, log_text as text, date',
      [projectId, req.userId, text, dateStr]
    );

    // Also update public active log
    await pool.query(
      'UPDATE project_members SET active_log = $1 WHERE project_id = $2 AND user_id = $3',
      [text, projectId, req.userId]
    );

    res.json(newLogResult.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error saving log' });
  }
});

// Delete private work log
app.delete('/api/projects/:projectId/logs/:logId', async (req, res) => {
  const { logId } = req.params;
  try {
    await pool.query('DELETE FROM evaluation_logs WHERE id = $1 AND user_id = $2', [logId, req.userId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error deleting log' });
  }
});

// -------------------------------------------------------------
// MILESTONES ENDPOINTS
// -------------------------------------------------------------

// Fetch milestones for a project
app.get('/api/projects/:projectId/milestones', async (req, res) => {
  const { projectId } = req.params;
  try {
    const milestonesResult = await pool.query(
      `SELECT id, title, details, due_date as date, status, assigned_to as assignee,
              submission_file_name as "submissionFileName", submission_submitted_at as "submissionSubmittedAt",
              submission_file_url as "submissionFileUrl"
       FROM milestones
       WHERE project_id = $1
       ORDER BY id ASC`,
      [projectId]
    );

    const milestones = milestonesResult.rows.map(row => ({
      id: row.id,
      title: row.title,
      details: row.details,
      date: row.date,
      status: row.status,
      assignee: row.assignee,
      submission: row.submissionFileName ? {
        fileName: row.submissionFileName,
        submittedAt: row.submissionSubmittedAt,
        fileUrl: row.submissionFileUrl
      } : null
    }));

    res.json(milestones);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error fetching milestones' });
  }
});

// Submit work for a milestone
app.post('/api/projects/:projectId/milestones/:milestoneId/submit', async (req, res) => {
  const { milestoneId } = req.params;
  const { fileName, fileUrl } = req.body;

  const dateStr = new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });

  try {
    await pool.query(
      `UPDATE milestones
       SET status = 'completed',
           submission_file_name = $1,
           submission_submitted_at = $2,
           submission_file_url = $3
       WHERE id = $4`,
      [fileName || 'Submission.pdf', dateStr, fileUrl || null, milestoneId]
    );
    res.json({ success: true, fileName, fileUrl, submittedAt: dateStr });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error submitting milestone work' });
  }
});

// -------------------------------------------------------------
// RESOURCES ENDPOINTS
// -------------------------------------------------------------

// Fetch resources
app.get('/api/projects/:projectId/resources', async (req, res) => {
  const { projectId } = req.params;
  try {
    const resourcesResult = await pool.query(
      'SELECT id, title, type, url, uploader, date FROM resources WHERE project_id = $1 ORDER BY id DESC',
      [projectId]
    );
    res.json(resourcesResult.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error fetching resources' });
  }
});

// Save resource
app.post('/api/projects/:projectId/resources', async (req, res) => {
  const { projectId } = req.params;
  const { title, type, url } = req.body;

  const today = new Date();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const formattedDate = `${months[today.getMonth()]} ${today.getDate()} (Today)`;

  try {
    const newResource = await pool.query(
      `INSERT INTO resources (project_id, title, type, url, uploader, uploader_id, date)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, title, type, url, uploader, date`,
      [projectId, title, type, url, req.userName, req.userId, formattedDate]
    );
    res.json(newResource.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error saving resource' });
  }
});

// Delete resource
app.delete('/api/resources/:resourceId', async (req, res) => {
  const { resourceId } = req.params;
  try {
    await pool.query('DELETE FROM resources WHERE id = $1', [resourceId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error deleting resource' });
  }
});

// -------------------------------------------------------------
// WORKSPACES ENDPOINTS
// -------------------------------------------------------------

// Fetch workspaces
app.get('/api/projects/:projectId/workspaces', async (req, res) => {
  const { projectId } = req.params;
  try {
    const workspacesResult = await pool.query(
      'SELECT id, title, type, url, creator, date FROM workspaces WHERE project_id = $1 ORDER BY id DESC',
      [projectId]
    );
    res.json(workspacesResult.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error fetching workspaces' });
  }
});

// Save workspace
app.post('/api/projects/:projectId/workspaces', async (req, res) => {
  const { projectId } = req.params;
  const { title, type, url } = req.body;

  const today = new Date();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const formattedDate = `${months[today.getMonth()]} ${today.getDate()} (Today)`;

  try {
    const newWorkspace = await pool.query(
      `INSERT INTO workspaces (project_id, title, type, url, creator, creator_id, date)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, title, type, url, creator, date`,
      [projectId, title, type, url, req.userName, req.userId, formattedDate]
    );
    res.json(newWorkspace.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error saving workspace' });
  }
});

// Delete workspace
app.delete('/api/workspaces/:workspaceId', async (req, res) => {
  const { workspaceId } = req.params;
  try {
    await pool.query('DELETE FROM workspaces WHERE id = $1', [workspaceId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error deleting workspace' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
