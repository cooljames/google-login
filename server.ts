import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import path from 'path';
import { fileURLToPath } from 'url';

import fs from 'fs';
import multer from 'multer';
import { put } from '@vercel/blob';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Replace local diskStorage with memoryStorage for Vercel Blob
const upload = multer({ storage: multer.memoryStorage() });

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(cookieParser());

const JWT_SECRET = process.env.JWT_SECRET || 'DEV_SECRET_KEY_CHANGE_IN_PROD';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';

import pg from 'pg';

let pool: pg.Pool;

if (process.env.DATABASE_URL) {
  pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
} else {
  console.warn('DATABASE_URL is not set. Please provide Neon connection string.');
}

const initDb = async () => {
  if (!pool) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE,
        name TEXT,
        picture TEXT,
        role TEXT DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS posts (
        id SERIAL PRIMARY KEY,
        type TEXT DEFAULT '일반',
        title TEXT NOT NULL,
        content TEXT,
        author_id TEXT,
        views INTEGER DEFAULT 0,
        attachment_name TEXT,
        attachment_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(author_id) REFERENCES users(id)
      );
    `);
    
    try { await pool.query("ALTER TABLE posts ADD COLUMN attachment_name TEXT;"); } catch(e) {}
    try { await pool.query("ALTER TABLE posts ADD COLUMN attachment_url TEXT;"); } catch(e) {}
    
    try {
      await pool.query("UPDATE users SET role = 'admin' WHERE email = 'dsayhong@gmail.com'");
    } catch(e) {}
  } catch (error) {
    console.error('Failed to initialize database schema:', error);
  }
};
initDb();

/** -----------------------------------------
 * Authentication API
 * ----------------------------------------- */
app.get('/api/auth/url', (req, res) => {
  const origin = req.query.origin || (req.headers.referer ? new URL(req.headers.referer).origin : (process.env.APP_URL || `http://localhost:${PORT}`));
  const redirectUri = `${origin}/auth/callback`;

  if (!GOOGLE_CLIENT_ID) {
    return res.status(500).json({ error: 'OAuth is not configured. Please supply GOOGLE_CLIENT_ID.' });
  }

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
    
    const userInfoData = JSON.parse(Buffer.from(tokenData.id_token.split('.')[1], 'base64').toString());
    
    const user = {
      id: userInfoData.sub,
      email: userInfoData.email,
      name: userInfoData.name,
      picture: userInfoData.picture
    };

    if (pool) {
      await pool.query(`
        INSERT INTO users (id, email, name, picture) 
        VALUES ($1, $2, $3, $4)
        ON CONFLICT(id) DO UPDATE SET
          email = EXCLUDED.email,
          name = EXCLUDED.name,
          picture = EXCLUDED.picture
      `, [user.id, user.email, user.name, user.picture]);
    }

    const sessionToken = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

    res.cookie('auth_token', sessionToken, {
      secure: true,
      sameSite: 'none',
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000
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

async function requireAuth(req: any, res: any, next: any) {
  const token = req.cookies.auth_token;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    if (!pool) return res.status(500).json({ error: 'Database not initialized' });
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [decoded.userId]);
    const user = rows[0];
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

app.get('/api/me', requireAuth, (req: any, res: any) => {
  res.json(req.user);
});

app.put('/api/me', requireAuth, async (req: any, res: any) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  
  if (!pool) return res.status(500).json({ error: 'Database not initialized' });
  await pool.query('UPDATE users SET name = $1 WHERE id = $2', [name, req.user.id]);
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
  res.json(rows[0]);
});

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
app.get('/api/posts', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'Database not initialized' });
  const { rows } = await pool.query(`
    SELECT p.*, u.name as author 
    FROM posts p 
    LEFT JOIN users u ON p.author_id = u.id 
    ORDER BY p.id DESC
  `);
  res.json(rows);
});

app.get('/api/posts/:id', async (req, res) => {
  const { id } = req.params;
  if (!pool) return res.status(500).json({ error: 'Database not initialized' });
  
  try {
    await pool.query('UPDATE posts SET views = views + 1 WHERE id = $1', [id]);
    const { rows } = await pool.query(`
      SELECT p.*, u.name as author 
      FROM posts p 
      LEFT JOIN users u ON p.author_id = u.id 
      WHERE p.id = $1
    `, [id]);
    
    if (rows.length === 0) return res.status(404).json({ error: 'Post not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to find post' });
  }
});

app.post('/api/posts', requireAuth, upload.single('attachment'), async (req: any, res: any) => {
  const { title, content, type = '일반' } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });

  if (!pool) return res.status(500).json({ error: 'Database not initialized' });

  let attachment_name = null;
  let attachment_url = null;
  if (req.file) {
    try {
      const blob = await put(req.file.originalname, req.file.buffer, {
        access: 'public',
        token: process.env.BLOB_READ_WRITE_TOKEN
      });
      attachment_name = req.file.originalname;
      attachment_url = blob.url;
    } catch (e) {
      console.error('Failed to upload file to Blob:', e);
      return res.status(500).json({ error: 'Failed to upload attachment' });
    }
  }

  const result = await pool.query(
    'INSERT INTO posts (title, content, type, author_id, attachment_name, attachment_url) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
    [title, content || '', type, req.user.id, attachment_name, attachment_url]
  );
  const newPostId = result.rows[0].id;
  
  const { rows } = await pool.query(`
    SELECT p.*, u.name as author 
    FROM posts p 
    LEFT JOIN users u ON p.author_id = u.id 
    WHERE p.id = $1
  `, [newPostId]);
  
  res.json(rows[0]);
});

app.put('/api/posts/:id', requireAuth, upload.single('attachment'), async (req: any, res: any) => {
  const { id } = req.params;
  const { title, content, type } = req.body;
  const remove_attachment = req.body.remove_attachment === 'true';
  
  if (!pool) return res.status(500).json({ error: 'Database not initialized' });

  const { rows: postRows } = await pool.query('SELECT * FROM posts WHERE id = $1', [id]);
  const post = postRows[0];
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
    try {
      const blob = await put(req.file.originalname, req.file.buffer, {
        access: 'public',
        token: process.env.BLOB_READ_WRITE_TOKEN
      });
      attachment_name = req.file.originalname;
      attachment_url = blob.url;
    } catch (e) {
      return res.status(500).json({ error: 'Failed to upload attachment' });
    }
  }
  
  await pool.query(
    'UPDATE posts SET title = $1, content = $2, type = $3, attachment_name = $4, attachment_url = $5, updated_at = CURRENT_TIMESTAMP WHERE id = $6',
    [title || post.title, content || post.content, type || post.type, attachment_name, attachment_url, id]
  );
  
  const { rows: updatedRows } = await pool.query(`
    SELECT p.*, u.name as author 
    FROM posts p 
    LEFT JOIN users u ON p.author_id = u.id 
    WHERE p.id = $1
  `, [id]);
  
  res.json(updatedRows[0]);
});

app.delete('/api/posts/:id', requireAuth, async (req: any, res: any) => {
  const { id } = req.params;
  
  const { rows } = await pool.query('SELECT * FROM posts WHERE id = $1', [id]);
  const post = rows[0];
  if (!post) return res.status(404).json({ error: 'Post not found' });
  
  if (post.author_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  await pool.query('DELETE FROM posts WHERE id = $1', [id]);
  res.json({ success: true });
});

/** -----------------------------------------
 * Admin API
 * ----------------------------------------- */
app.get('/api/admin/stats', requireAuth, requireAdmin, async (req, res) => {
  const usersRes = await pool.query('SELECT COUNT(*) as count FROM users');
  const postsRes = await pool.query('SELECT COUNT(*) as count FROM posts');
  const adminRes = await pool.query("SELECT COUNT(*) as count FROM users WHERE role = 'admin'");
  
  res.json({ 
    usersCount: parseInt(usersRes.rows[0].count), 
    postsCount: parseInt(postsRes.rows[0].count), 
    adminCount: parseInt(adminRes.rows[0].count) 
  });
});

app.get('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM users ORDER BY created_at DESC');
  res.json(rows);
});

app.put('/api/admin/users/:id/role', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;
  if (!['user', 'admin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  
  await pool.query('UPDATE users SET role = $1 WHERE id = $2', [role, id]);
  res.json({ success: true });
});

/** -----------------------------------------
 * Boot Setup
 * ----------------------------------------- */
async function startServer() {
  if (!process.env.VERCEL) {
    if (process.env.NODE_ENV !== 'production') {
      const { createServer: createViteServer } = await import('vite');
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
}

startServer();

// Export the express app for Vercel Serverless
export default app;
