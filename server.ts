import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import path from 'path';

import fs from 'fs';
import multer from 'multer';
import { put } from '@vercel/blob';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import pg from 'pg';
const { Pool } = pg;

// File setup
// __filename and __dirname removed for Vercel compat

// Replace local diskStorage with memoryStorage for Vercel Blob
const upload = multer({ storage: multer.memoryStorage() });

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(cookieParser());

const JWT_SECRET = process.env.JWT_SECRET || 'DEV_SECRET_KEY_CHANGE_IN_PROD';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';

// Global pool instance
let pool: pg.Pool;

if (process.env.DATABASE_URL) {
  console.log('Database URL detected, initializing pool...');
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 500, // aggressive idle timeout for serverless
    max: 10
  });
  
  pool.on('error', (err) => {
    console.error('Unexpected error on idle database client', err);
  });
} else {
  console.error('DATABASE_URL is not set. Database operations will fail.');
}

const getTransporter = async () => {
  // If no real SMTP config is provided, we can use Ethereal Email for testing
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }

  // Fallback to test account
  let testAccount = await nodemailer.createTestAccount();
  console.log('Using Ethereal Mail for testing. Check Ethereal for emails.');

  return nodemailer.createTransport({
    host: "smtp.ethereal.email",
    port: 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: testAccount.user, // generated ethereal user
      pass: testAccount.pass, // generated ethereal password
    },
  });
};

const initDb = async () => {
  if (!pool) return;
  
  const queries = [
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      name TEXT,
      picture TEXT,
      password TEXT,
      role TEXT DEFAULT 'user',
      is_email_verified BOOLEAN DEFAULT false,
      verification_token TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_email_verified BOOLEAN DEFAULT false;",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token TEXT;",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS password TEXT;",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT;",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS picture TEXT;",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;",
    "ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_author_id_fkey;",
    "ALTER TABLE users ALTER COLUMN id TYPE TEXT;",
    `CREATE TABLE IF NOT EXISTS posts (
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
    );`,
    "ALTER TABLE posts ALTER COLUMN author_id TYPE TEXT;",
    "ALTER TABLE posts ADD COLUMN IF NOT EXISTS attachment_name TEXT;",
    "ALTER TABLE posts ADD COLUMN IF NOT EXISTS attachment_url TEXT;"
  ];

  for (const query of queries) {
    try {
      await pool.query(query);
    } catch (e: any) {
      if (!e.message.includes('already exists')) {
        console.warn(`Query failed: ${query}`, e.message);
      }
    }
  }

  try {
    const adminEmail = 'dsayhong@gmail.com';
    const { rows: adminRows } = await pool.query('SELECT * FROM users WHERE email = $1', [adminEmail]);
    if (adminRows.length > 0) {
      const user = adminRows[0];
      // If password is not hashed (bcrypt hashes start with $2), hash it.
      if (user.password && !user.password.startsWith('$2')) {
        const hash = await bcrypt.hash(user.password, 10);
        await pool.query('UPDATE users SET password = $1, role = $2 WHERE email = $3', [hash, 'admin', adminEmail]);
      } else {
        await pool.query("UPDATE users SET role = 'admin' WHERE email = $1", [adminEmail]);
      }
    }
  } catch(e) {}
};

function normalizeUser(user: any) {
  if (!user) return null;
  return {
    id: user.id || user.uid,
    email: user.email,
    name: user.name || user.displayName || user.email.split('@')[0],
    picture: user.picture || user.photoURL,
    role: user.role || 'user',
    isEmailVerified: user.is_email_verified || user.isEmailVerified,
    createdAt: user.created_at || user.createdAt
  };
}

function normalizePost(post: any) {
  if (!post) return null;
  return {
    id: post.id,
    title: post.title,
    content: post.content,
    type: post.type,
    author: post.author || post.author_name || '알 수 없음',
    authorId: post.author_id,
    views: post.views,
    attachmentName: post.attachment_name,
    attachmentUrl: post.attachment_url,
    createdAt: post.created_at || post.createdAt,
    updatedAt: post.updated_at || post.updatedAt
  };
}
const initDbPromise = initDb().catch(err => {
  console.error('Critical Database initialization failed:', err);
});

// Basic health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    db: !!pool, 
    googleConfig: !!GOOGLE_CLIENT_ID,
    env: process.env.NODE_ENV,
    vercel: !!process.env.VERCEL
  });
});

/** -----------------------------------------
 * Authentication API
 * ----------------------------------------- */
app.post('/api/auth/register', async (req, res) => {
  await initDbPromise;
  const { email, password, name } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const id = Date.now().toString() + Math.random().toString(36).substring(7);
    const verificationToken = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
    
    await pool.query(
      'INSERT INTO users (id, email, name, password, is_email_verified) VALUES ($1, $2, $3, $4, true)',
      [id, email, name, hashedPassword]
    );

    const token = jwt.sign({ userId: id, email }, JWT_SECRET, { expiresIn: '7d' });

    // Send email async without waiting or blocking
    getTransporter().then(transporter => {
      const origin = req.headers.referer ? new URL(req.headers.referer).origin : (process.env.APP_URL || `http://localhost:${PORT}`);
      const verifyLink = `${origin}/api/auth/verify?token=${verificationToken}`;
      
      transporter.sendMail({
        from: '"MyApp" <noreply@myapp.com>',
        to: email,
        subject: "Welcome to MyApp!",
        text: `Hello ${name}! Welcome to MyApp!`,
        html: `<p>Hello ${name}! Welcome to MyApp!</p>`,
      }).then(info => {
        console.log("Welcome email sent: %s", info.messageId);
      }).catch(console.error);
    }).catch(console.error);

    res.json({ success: true, message: 'Registration successful!', token });
  } catch (error: any) {
    if (error.code === '23505') { // unique violation in Postgres
      return res.status(400).json({ error: 'Email already in use' });
    }
    console.error('Register error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/auth/verify', async (req, res) => {
  await initDbPromise;
  const { token } = req.query;
  if (!token) return res.status(400).send('Invalid token');

  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE verification_token = $1', [token]);
    if (rows.length === 0) {
      return res.status(400).send('Invalid or expired verification token.');
    }

    await pool.query('UPDATE users SET is_email_verified = true, verification_token = NULL WHERE verification_token = $1', [token]);
    res.send(`
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background: #f0f4f8; margin: 0; }
            .card { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); text-align: center; }
            h1 { color: #2d3748; }
            p { color: #4a5568; margin-bottom: 1.5rem; }
            a { display: inline-block; background: #4299e1; color: white; padding: 0.5rem 1rem; border-radius: 4px; text-decoration: none; font-weight: bold; }
            a:hover { background: #3182ce; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>이메일 인증 완료</h1>
            <p>이메일 인증이 성공적으로 완료되었습니다. 이제 로그인할 수 있습니다.</p>
            <p>자동으로 이동 중...</p>
            <script>
              setTimeout(function() {
                window.location.href = '/auth';
              }, 2000);
            </script>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Verify error:', error);
    res.status(500).send('Error verifying email.');
  }
});

app.post('/api/auth/login', async (req, res) => {
  await initDbPromise;
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Missing email or password' });
  }

  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = rows[0];
    if (!user || !user.password) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (!user.is_email_verified) {
      return res.status(403).json({ error: 'Please verify your email before logging in.' });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const sessionToken = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

    res.cookie('auth_token', sessionToken, {
      secure: true,
      sameSite: 'none',
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({ success: true, token: sessionToken, user: { id: user.id, email: user.email, name: user.name, picture: user.picture } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/auth/google/redirect', async (req, res) => {
  let origin = req.query.origin as string;
  if (!origin) {
    if (req.headers.referer) {
      try {
        origin = new URL(req.headers.referer).origin;
      } catch (e) {
        origin = process.env.APP_URL || `http://localhost:${PORT}`;
      }
    } else {
      origin = process.env.APP_URL || `http://localhost:${PORT}`;
    }
  }
  const redirectUri = `${origin}/auth/callback`;

  if (!GOOGLE_CLIENT_ID) {
    return res.status(500).send('OAuth is not configured. Please supply GOOGLE_CLIENT_ID.');
  }

  const state = Buffer.from(JSON.stringify({ redirectUri })).toString('base64');

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    prompt: 'select_account',
    state
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

app.get('/api/auth/url', async (req, res) => {
  await initDbPromise;
  let origin = req.query.origin as string;
  if (!origin) {
    if (req.headers.referer) {
      try {
        origin = new URL(req.headers.referer).origin;
      } catch (e) {
        origin = process.env.APP_URL || `http://localhost:${PORT}`;
      }
    } else {
      origin = process.env.APP_URL || `http://localhost:${PORT}`;
    }
  }
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
  await initDbPromise;
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
      const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [user.email]);
      if (rows.length > 0) {
        // User with this email already exists, link the account by updating it
        user.id = rows[0].id;
        await pool.query(`
          UPDATE users SET 
            name = COALESCE($1, name), 
            picture = COALESCE($2, picture), 
            is_email_verified = true 
          WHERE id = $3
        `, [user.name, user.picture, user.id]);
      } else {
        await pool.query(`
          INSERT INTO users (id, email, name, picture, is_email_verified) 
          VALUES ($1, $2, $3, $4, true)
        `, [user.id, user.email, user.name, user.picture]);
      }
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
        <head>
          <meta charset="utf-8" />
        </head>
        <body>
          <script>
            try {
              localStorage.setItem('auth_token', '${sessionToken}');
            } catch (e) {
              console.warn('localStorage block in callback:', e);
            }
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', token: '${sessionToken}' }, '*');
              setTimeout(() => { if (window.close) window.close(); }, 100);
            } else {
              window.location.href = '/board?token=${sessionToken}';
            }
          </script>
          <p>로그인 성공했습니다. 이동 중...</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('OAuth Callback Error:', error);
    res.send(`<html><body><p>Authentication failed. ${String(error)}</p></body></html>`);
  }
});

async function requireAuth(req: any, res: any, next: any) {
  const customHeaderToken = req.headers.authorization?.split(' ')[1];
  const token = customHeaderToken || req.cookies.auth_token;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    if (!pool) {
      console.error('requireAuth: Database pool not initialized');
      return res.status(500).json({ error: 'Database not initialized' });
    }
    await initDbPromise;
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [decoded.userId]);
    const user = rows[0];
    if (!user) {
      console.warn(`requireAuth: User not found for ID ${decoded.userId}`);
      return res.status(401).json({ error: 'User not found' });
    }
    req.user = user;
    next();
  } catch (err) {
    console.error('requireAuth: Token verification failed', err);
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
  res.json(normalizeUser(req.user));
});

app.put('/api/me', requireAuth, async (req: any, res: any) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  
  if (!pool) return res.status(500).json({ error: 'Database not initialized' });
  await pool.query('UPDATE users SET name = $1 WHERE id = $2', [name, req.user.id]);
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
  res.json(normalizeUser(rows[0]));
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
  await initDbPromise;
  if (!pool) return res.status(500).json({ error: 'Database not initialized' });
  const { rows } = await pool.query(`
    SELECT p.*, u.name as author_name, u.picture as author_picture
    FROM posts p 
    LEFT JOIN users u ON p.author_id = u.id 
    ORDER BY p.id DESC
  `);
  res.json(rows.map(normalizePost));
});

app.get('/api/posts/:id', async (req, res) => {
  const { id } = req.params;
  if (!pool) return res.status(500).json({ error: 'Database not initialized' });
  
  try {
    await pool.query('UPDATE posts SET views = views + 1 WHERE id = $1', [id]);
    const { rows } = await pool.query(`
      SELECT p.*, u.name as author_name
      FROM posts p 
      LEFT JOIN users u ON p.author_id = u.id 
      WHERE p.id = $1
    `, [id]);
    
    if (rows.length === 0) return res.status(404).json({ error: 'Post not found' });
    res.json(normalizePost(rows[0]));
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
    SELECT p.*, u.name as author_name
    FROM posts p 
    LEFT JOIN users u ON p.author_id = u.id 
    WHERE p.id = $1
  `, [newPostId]);
  
  res.json(normalizePost(rows[0]));
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
    SELECT p.*, u.name as author_name
    FROM posts p 
    LEFT JOIN users u ON p.author_id = u.id 
    WHERE p.id = $1
  `, [id]);
  
  res.json(normalizePost(updatedRows[0]));
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
  res.json(rows.map(normalizeUser));
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
      const viteName = 'vite';
      const { createServer: createViteServer } = await import(viteName /* @vite-ignore */);
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
