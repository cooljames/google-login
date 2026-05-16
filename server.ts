import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import multer from 'multer';

// ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir)
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    // Avoid non-ascii chars in file name for simplicity
    cb(null, uniqueSuffix + '-' + encodeURIComponent(file.originalname))
  }
});

const upload = multer({ storage: storage });

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(cookieParser());
app.use('/uploads', express.static(uploadsDir));

const JWT_SECRET = process.env.JWT_SECRET || 'DEV_SECRET_KEY_CHANGE_IN_PROD';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';

import Database from 'better-sqlite3';

const db = new Database('database.db');
db.pragma('journal_mode = WAL');

const initDb = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      name TEXT,
      picture TEXT,
      role TEXT DEFAULT 'user',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT DEFAULT '일반',
      title TEXT NOT NULL,
      content TEXT,
      author_id TEXT,
      views INTEGER DEFAULT 0,
      attachment_name TEXT,
      attachment_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(author_id) REFERENCES users(id)
    );
  `);
  
  // Alter to add columns if they don't exist (for existing dev dbs)
  try { db.exec("ALTER TABLE posts ADD COLUMN attachment_name TEXT;"); } catch(e) {}
  try { db.exec("ALTER TABLE posts ADD COLUMN attachment_url TEXT;"); } catch(e) {}
  
  // Bootstrap admin
  try {
    db.prepare("UPDATE users SET role = 'admin' WHERE email = 'dsayhong@gmail.com'").run();
  } catch(e) {}
};
initDb();

/** -----------------------------------------
 * Authentication API
 * ----------------------------------------- */

// 1. Return the Google OAuth URL so client can open a popup
app.get('/api/auth/url', (req, res) => {
  const origin = req.query.origin || (req.headers.referer ? new URL(req.headers.referer).origin : (process.env.APP_URL || `http://localhost:${PORT}`));
  const redirectUri = `${origin}/auth/callback`;

  if (!GOOGLE_CLIENT_ID) {
    return res.status(500).json({ error: 'OAuth is not configured. Please supply GOOGLE_CLIENT_ID.' });
  }

  // Pass redirectUri in state so we can use the exact same one in the callback
  const state = Buffer.from(JSON.stringify({ redirectUri })).toString('base64');

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri as string,
    response_type: 'code',
    scope: 'openid email profile',
    prompt: 'select_account',
    state
  });

  res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
});

// 2. The callback endpoint that receives the exact code and trades it for a token
app.get('/auth/callback', async (req, res) => {
  const { code, state } = req.query;
  
  if (!code) {
    return res.send(`<html><body><p>No code provided.</p></body></html>`);
  }

  let redirectUri = '';
  try {
    if (state) {
      const decodedState = JSON.parse(Buffer.from(state as string, 'base64').toString());
      redirectUri = decodedState.redirectUri;
    }
  } catch (e) {
    console.error('Failed to parse state:', e);
  }

  // Fallback if state fails
  if (!redirectUri) {
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const proto = req.headers['x-forwarded-proto'] || 'http';
    const origin = host?.includes('localhost') ? `http://${host}` : `${proto}://${host}`;
    redirectUri = `${origin}/auth/callback`;
  }

  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        code: code as string,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri
      })
    });

    const tokenData = await tokenResponse.json();
    if (tokenData.error) throw new Error(tokenData.error_description || tokenData.error);
    
    // Parse the ID token to get user info (assuming it's a JWT)
    const userInfoData = JSON.parse(Buffer.from(tokenData.id_token.split('.')[1], 'base64').toString());
    
    const user = {
      id: userInfoData.sub,
      email: userInfoData.email,
      name: userInfoData.name,
      picture: userInfoData.picture
    };

    const insertUser = db.prepare(`
      INSERT INTO users (id, email, name, picture) 
      VALUES (@id, @email, @name, @picture)
      ON CONFLICT(id) DO UPDATE SET
        email = excluded.email,
        name = excluded.name,
        picture = excluded.picture
    `);
    insertUser.run(user);

    // Create session JWT
    const sessionToken = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

    // Set cookie
    res.cookie('auth_token', sessionToken, {
      secure: true,
      sameSite: 'none',
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>로그인 성공했습니다. 창이 자동으로 닫힙니다.</p>
        </body>
      </html>
    `);

  } catch (error) {
    console.error('OAuth Callback Error:', error);
    res.send(`<html><body><p>Authentication failed. ${String(error)}</p></body></html>`);
  }
});

// Middleware to check authentication
function requireAuth(req: any, res: any, next: any) {
  const token = req.cookies.auth_token;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function requireAdmin(req: any, res: any, next: any) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

// 3. User profile info
app.get('/api/me', requireAuth, (req: any, res: any) => {
  res.json(req.user);
});

// Update profile details
app.put('/api/me', requireAuth, (req: any, res: any) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  
  db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, req.user.id);
  const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json(updatedUser);
});

// 4. Logout
app.post('/api/logout', (req, res) => {
  res.clearCookie('auth_token', {
    secure: true,
    sameSite: 'none',
    httpOnly: true,
  });
  res.json({ success: true });
});

/** -----------------------------------------
 * Board API
 * ----------------------------------------- */
app.get('/api/posts', (req, res) => {
  const posts = db.prepare(`
    SELECT p.*, u.name as author 
    FROM posts p 
    LEFT JOIN users u ON p.author_id = u.id 
    ORDER BY p.id DESC
  `).all();
  res.json(posts);
});

app.get('/api/posts/:id', (req, res) => {
  const { id } = req.params;
  
  try {
    db.prepare('UPDATE posts SET views = views + 1 WHERE id = ?').run(id);
    const post = db.prepare(`
      SELECT p.*, u.name as author 
      FROM posts p 
      LEFT JOIN users u ON p.author_id = u.id 
      WHERE p.id = ?
    `).get(id);
    
    if (!post) return res.status(404).json({ error: 'Post not found' });
    res.json(post);
  } catch (err) {
    res.status(500).json({ error: 'Failed to find post' });
  }
});

app.post('/api/posts', requireAuth, upload.single('attachment'), (req: any, res: any) => {
  const { title, content, type = '일반' } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });

  let attachment_name = null;
  let attachment_url = null;
  if (req.file) {
    attachment_name = req.file.originalname;
    attachment_url = '/uploads/' + req.file.filename;
  }

  const insert = db.prepare('INSERT INTO posts (title, content, type, author_id, attachment_name, attachment_url) VALUES (?, ?, ?, ?, ?, ?)');
  const info = insert.run(title, content || '', type, req.user.id, attachment_name, attachment_url);
  
  const newPost = db.prepare(`
    SELECT p.*, u.name as author 
    FROM posts p 
    LEFT JOIN users u ON p.author_id = u.id 
    WHERE p.id = ?
  `).get(info.lastInsertRowid);
  
  res.json(newPost);
});

app.put('/api/posts/:id', requireAuth, upload.single('attachment'), (req: any, res: any) => {
  const { id } = req.params;
  const { title, content, type } = req.body;
  const remove_attachment = req.body.remove_attachment === 'true';
  
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id) as any;
  if (!post) return res.status(404).json({ error: 'Post not found' });
  
  if (post.author_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  let attachment_name = post.attachment_name;
  let attachment_url = post.attachment_url;
  
  if (remove_attachment) {
    attachment_name = null;
    attachment_url = null;
  } else if (req.file) {
    attachment_name = req.file.originalname;
    attachment_url = '/uploads/' + req.file.filename;
  }
  
  db.prepare('UPDATE posts SET title = ?, content = ?, type = ?, attachment_name = ?, attachment_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(title || post.title, content || post.content, type || post.type, attachment_name, attachment_url, id);
  
  const updatedPost = db.prepare(`
    SELECT p.*, u.name as author 
    FROM posts p 
    LEFT JOIN users u ON p.author_id = u.id 
    WHERE p.id = ?
  `).get(id);
  
  res.json(updatedPost);
});

app.delete('/api/posts/:id', requireAuth, (req: any, res: any) => {
  const { id } = req.params;
  
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id) as any;
  if (!post) return res.status(404).json({ error: 'Post not found' });
  
  if (post.author_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  db.prepare('DELETE FROM posts WHERE id = ?').run(id);
  res.json({ success: true });
});

/** -----------------------------------------
 * Admin API
 * ----------------------------------------- */
app.get('/api/admin/stats', requireAuth, requireAdmin, (req, res) => {
  const usersCount = (db.prepare('SELECT COUNT(*) as count FROM users').get() as any).count;
  const postsCount = (db.prepare('SELECT COUNT(*) as count FROM posts').get() as any).count;
  const adminCount = (db.prepare('SELECT COUNT(*) as count FROM users WHERE role = ?').get('admin') as any).count;
  
  res.json({ usersCount, postsCount, adminCount });
});

app.get('/api/admin/users', requireAuth, requireAdmin, (req, res) => {
  const users = db.prepare('SELECT * FROM users ORDER BY created_at DESC').all();
  res.json(users);
});

app.put('/api/admin/users/:id/role', requireAuth, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { role } = req.body;
  if (!['user', 'admin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
  res.json({ success: true });
});

/** -----------------------------------------
 * Boot Setup
 * ----------------------------------------- */
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
