import 'dotenv/config';
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
const safeUpload = (req, res, next) => { upload.single('attachment')(req, res, (err) => { if (err) { const errorMsg = 'Multer Error: ' + (err.stack || err) + '\n'; console.error(errorMsg); fs.appendFileSync('debug.log', errorMsg); return res.status(500).json({ error: '파일 파싱 에러(Multer)', details: err.message }); } next(); }); };

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

  if (process.env.VERCEL) {
    // In Vercel, schema migrations are discouraged from running on every request.
    // Assuming DB is already migrated.
    return;
  }

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
    );`
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

function decodeFileName(originalname: string): string {
  // If the string already contains characters outside ISO-8859-1 (like Korean), it's already decoded.
  const isLatin1Only = !/[^\x00-\xff]/.test(originalname);
  if (isLatin1Only) {
    try {
      return Buffer.from(originalname, 'latin1').toString('utf8');
    } catch (e) {
      return originalname;
    }
  }
  return originalname;
}
const initDbPromise = initDb().catch(err => {
  console.error('Critical Database initialization failed:', err);
});

// Request logger (development only)
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
  });
}

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
    return res.status(400).json({ error: '모든 필드를 입력해주세요.' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const id = 'user_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 7);

    // Check if email already exists (could be a Google user)
    const { rows: existing } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (existing.length > 0) {
      if (existing[0].password) {
        return res.status(400).json({ error: '이미 가입된 이메일입니다.' });
      } else {
        // Was a Google user, now setting a password
        await pool.query(
          'UPDATE users SET password = $1, name = $2, is_email_verified = true WHERE email = $3',
          [hashedPassword, name, email]
        );
        const token = jwt.sign({ userId: existing[0].id, email }, JWT_SECRET, { expiresIn: '7d' });
        setAuthCookie(res, token);
        return res.json({ success: true, token, user: normalizeUser({ ...existing[0], name }) });
      }
    }

    const { rows: allUsers } = await pool.query('SELECT COUNT(*) as count FROM users');
    const isFirstUser = parseInt(allUsers[0].count, 10) === 0;
    const adminEmail = process.env.ADMIN_EMAIL;
    const role = (isFirstUser || (adminEmail && email === adminEmail)) ? 'admin' : 'user';

    await pool.query(
      'INSERT INTO users (id, email, name, password, is_email_verified, role) VALUES ($1, $2, $3, $4, true, $5)',
      [id, email, name, hashedPassword, role]
    );

    const token = jwt.sign({ userId: id, email }, JWT_SECRET, { expiresIn: '7d' });
    setAuthCookie(res, token);

    res.json({ success: true, message: '가입 성공!', token, user: normalizeUser({ id, email, name, role }) });
  } catch (error: any) {
    console.error('Register error:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

function setAuthCookie(res: any, token: string) {
  const isProd = !!process.env.VERCEL || process.env.NODE_ENV === 'production';
  res.cookie('auth_token', token, {
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/'
  });
}

app.post('/api/auth/login', async (req, res) => {
  await initDbPromise;
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: '이메일과 비밀번호를 입력해주세요.' });
  }

  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = rows[0];

    if (!user || !user.password) {
      return res.status(401).json({ error: '가입되지 않은 이메일이거나 소셜 로그인 계정입니다.' });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: '비밀번호가 일치하지 않습니다.' });
    }

    const sessionToken = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    setAuthCookie(res, sessionToken);

    res.json({
      success: true,
      token: sessionToken,
      user: normalizeUser(user)
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

app.get('/api/auth/url', async (req, res) => {
  await initDbPromise;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'http';
  let origin = req.query.origin as string;

  // Always use the real host if available, as it's the most reliable source of truth
  // and prevents Vercel rewrite issues from falling back to localhost.
  if (host) {
    origin = `${proto}://${host}`;
  } else if (!origin) {
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

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return res.status(500).json({ error: 'OAuth is not fully configured. Please supply both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the environment variables.' });
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

  // Always derive redirectUri from state (set during /api/auth/url)
  // Use host header as the absolute source of truth for targetOrigin fallback
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'http';

  let redirectUri = '';
  let targetOrigin = host ? `${proto}://${host}` : (process.env.APP_URL || `http://localhost:${PORT}`);
  try {
    if (state) {
      const decodedState = JSON.parse(Buffer.from(state as string, 'base64').toString());
      redirectUri = decodedState.redirectUri;
      if (redirectUri) {
        targetOrigin = new URL(redirectUri).origin;
      }
    }
  } catch (e) {
    console.error('Failed to parse state:', e);
  }

  if (!redirectUri) {
    redirectUri = `${targetOrigin}/auth/callback`;
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
        user.id = rows[0].id;
        await pool.query(`
          UPDATE users SET 
            name = COALESCE($1, name), 
            picture = COALESCE($2, picture), 
            is_email_verified = true 
          WHERE id = $3
        `, [user.name, user.picture, user.id]);
      } else {
        const { rows: allUsers } = await pool.query('SELECT COUNT(*) as count FROM users');
        const isFirstUser = parseInt(allUsers[0].count, 10) === 0;
        const adminEmail = process.env.ADMIN_EMAIL;
        const role = (isFirstUser || (adminEmail && user.email === adminEmail)) ? 'admin' : 'user';

        await pool.query(`
          INSERT INTO users (id, email, name, picture, is_email_verified, role) 
          VALUES ($1, $2, $3, $4, true, $5)
        `, [user.id, user.email, user.name, user.picture, role]);
      }
    }

    const sessionToken = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    setAuthCookie(res, sessionToken);

    // Use targetOrigin for postMessage (never '*') to prevent token leakage
    res.send(`
      <html>
        <head><meta charset="utf-8" /></head>
        <body>
          <script>
            var targetOrigin = ${JSON.stringify(targetOrigin)};
            try {
              localStorage.setItem('auth_token', ${JSON.stringify(sessionToken)});
            } catch (e) {
              console.warn('localStorage block in callback:', e);
            }
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', token: ${JSON.stringify(sessionToken)} }, targetOrigin);
              setTimeout(function() { window.close(); }, 300);
            } else {
              // Cookie is already set; no token needed in URL
              window.location.href = '/board';
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
    let user = rows[0];
    if (!user) {
      console.warn(`requireAuth: User not found for ID ${decoded.userId}`);
      return res.status(401).json({ error: 'User not found' });
    }

    // Dynamic admin promotion if user email matches ADMIN_EMAIL
    const adminEmail = process.env.ADMIN_EMAIL;
    if (adminEmail && user.email === adminEmail && user.role !== 'admin') {
      console.log(`[requireAuth] Promoting user ${user.email} to admin dynamically.`);
      await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [user.id]);
      user.role = 'admin';
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

app.get('/api/me', async (req: any, res: any) => {
  const customHeaderToken = req.headers.authorization?.split(' ')[1];
  const token = customHeaderToken || req.cookies.auth_token;
  if (!token) return res.json(null);

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    if (!pool) return res.status(500).json({ error: 'Database not initialized' });

    await initDbPromise;
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [decoded.userId]);
    let user = rows[0];

    if (!user) return res.json(null);

    // Dynamic admin promotion if user email matches ADMIN_EMAIL
    const adminEmail = process.env.ADMIN_EMAIL;
    if (adminEmail && user.email === adminEmail && user.role !== 'admin') {
      console.log(`[/api/me] Promoting user ${user.email} to admin dynamically.`);
      await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [user.id]);
      user.role = 'admin';
    }

    res.json(normalizeUser(user));
  } catch (err) {
    res.json(null);
  }
});

app.put('/api/me', requireAuth, upload.single('picture'), async (req: any, res: any) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  if (!pool) return res.status(500).json({ error: 'Database not initialized' });

  let picture = req.user.picture;
  if (req.file) {
    try {
      const decodedName = decodeFileName(req.file.originalname);
      const blob = await put(decodedName, req.file.buffer, {
        access: 'public',
        token: process.env.BLOB_READ_WRITE_TOKEN
      });
      picture = blob.url;
    } catch (e) {
      console.error('Failed to upload profile picture to Blob:', e);
      return res.status(500).json({ error: 'Failed to upload profile picture' });
    }
  }

  await pool.query('UPDATE users SET name = $1, picture = $2 WHERE id = $3', [name, picture, req.user.id]);
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
  res.json(normalizeUser(rows[0]));
});

app.post('/api/logout', (req, res) => {
  const isProd = !!process.env.VERCEL || process.env.NODE_ENV === 'production';
  res.clearCookie('auth_token', {
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    httpOnly: true,
    path: '/'
  });
  res.json({ success: true });
});

/** -----------------------------------------
 * Board API
 * ----------------------------------------- */
app.get('/api/posts', async (req, res) => {
  await initDbPromise;
  if (!pool) return res.status(500).json({ error: 'Database not initialized' });

  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const offset = (page - 1) * limit;

  try {
    const countResult = await pool.query('SELECT COUNT(*) FROM posts');
    const totalCount = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalCount / limit) || 1;

    const { rows } = await pool.query(`
      SELECT p.*, u.name as author_name, u.picture as author_picture
      FROM posts p 
      LEFT JOIN users u ON p.author_id = u.id 
      ORDER BY p.id DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    res.json({
      items: rows.map(normalizePost),
      pagination: { totalCount, totalPages, page, limit }
    });
  } catch (err) {
    console.error('Fetch posts error:', err);
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
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

app.post('/api/posts', requireAuth, safeUpload, async (req: any, res: any) => {
  console.log('POST /api/posts hit', { body: req.body, hasFile: !!req.file });
  const { title, content, type = '일반' } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });

  if (!pool) return res.status(500).json({ error: 'Database not initialized' });

  let attachment_name = null;
  let attachment_url = null;
  if (req.file) {
    console.log('Uploading file to Vercel Blob:', req.file.originalname);
    try {
      const decodedName = decodeFileName(req.file.originalname);
      const blob = await put(decodedName, req.file.buffer, {
        access: 'public',
        addRandomSuffix: true,
        token: process.env.BLOB_READ_WRITE_TOKEN
      });
      attachment_name = decodedName;
      attachment_url = blob.url;
    } catch (e: any) {
      console.error('Failed to upload file to Blob:', e);
      if (e.message && e.message.includes('private store')) {
        return res.status(500).json({ error: '첨부파일 업로드 실패: Vercel Blob 저장소가 Private으로 설정되어 있습니다. Public 저장소를 새로 생성하여 토큰을 교체해주세요.' });
      }
      return res.status(500).json({ error: 'Failed to upload attachment' });
    }
  }

  try {
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
  } catch (err: any) {
    const errorMsg = 'Failed to create post: ' + err.stack + '\n';
    console.error(errorMsg);
    fs.appendFileSync('debug.log', errorMsg);
    res.status(500).json({ error: 'Failed to create post', details: err.message });
  }
});

app.put('/api/posts/:id', requireAuth, safeUpload, async (req: any, res: any) => {
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
      const decodedName = decodeFileName(req.file.originalname);
      const blob = await put(decodedName, req.file.buffer, {
        access: 'public',
        addRandomSuffix: true,
        token: process.env.BLOB_READ_WRITE_TOKEN
      });
      attachment_name = decodedName;
      attachment_url = blob.url;
    } catch (e: any) {
      console.error('Failed to upload file to Blob:', e);
      if (e.message && e.message.includes('private store')) {
        return res.status(500).json({ error: '첨부파일 업로드 실패: Vercel Blob 저장소가 Private으로 설정되어 있습니다. Public 저장소를 새로 생성하여 토큰을 교체해주세요.' });
      }
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

app.delete('/api/admin/posts/bulk', requireAuth, requireAdmin, async (req: any, res: any) => {
  const { postIds } = req.body;
  if (!Array.isArray(postIds) || postIds.length === 0) {
    return res.status(400).json({ error: '삭제할 게시글 ID 목록을 제공해야 합니다.' });
  }

  try {
    await initDbPromise;
    if (!pool) throw new Error('Database pool not initialized');

    console.log(`Admin ${req.user.email} is bulk deleting post IDs: ${postIds.join(', ')}`);

    // Delete posts from database
    const result = await pool.query('DELETE FROM posts WHERE id = ANY($1)', [postIds.map(Number)]);

    console.log(`Successfully bulk deleted posts. Rows affected: ${result.rowCount}`);
    res.json({ success: true, deletedCount: result.rowCount });
  } catch (e) {
    console.error('Failed to bulk delete posts:', e);
    res.status(500).json({ error: '게시글 일괄 삭제 실패: ' + (e as Error).message });
  }
});

app.delete('/api/admin/users/bulk', requireAuth, requireAdmin, async (req: any, res: any) => {
  const { userIds } = req.body;
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return res.status(400).json({ error: '삭제할 사용자 ID 목록을 제공해야 합니다.' });
  }

  // Prevent admin from deleting themselves
  const filteredIds = userIds.filter(id => id !== req.user.id);
  if (filteredIds.length === 0) {
    return res.status(400).json({ error: '자기 자신은 삭제할 수 없으며, 유효한 사용자가 없습니다.' });
  }

  try {
    await initDbPromise;
    if (!pool) throw new Error('Database pool not initialized');

    console.log(`Admin ${req.user.email} is bulk deleting user IDs: ${filteredIds.join(', ')}`);

    // 1. 사용자의 게시글 삭제
    await pool.query('DELETE FROM posts WHERE author_id = ANY($1)', [filteredIds]);
    // 2. 사용자 삭제
    const result = await pool.query('DELETE FROM users WHERE id = ANY($1)', [filteredIds]);

    console.log(`Successfully bulk deleted users. Rows affected: ${result.rowCount}`);
    res.json({ success: true, deletedCount: result.rowCount });
  } catch (e) {
    console.error('Failed to bulk delete users:', e);
    res.status(500).json({ error: '사용자 일괄 삭제 실패: ' + (e as Error).message });
  }
});

app.delete('/api/admin/users/:id', requireAuth, requireAdmin, async (req: any, res: any) => {
  console.log('DELETE /api/admin/users/:id HIT!', req.params.id);
  const { id } = req.params;

  if (req.user.id === id) {
    return res.status(400).json({ error: '자기 자신은 삭제할 수 없습니다.' });
  }

  try {
    await initDbPromise;
    if (!pool) throw new Error('Database pool not initialized');

    console.log(`Admin ${req.user.email} is deleting user ID: ${id}`);

    // 1. 사용자의 게시글 삭제
    await pool.query('DELETE FROM posts WHERE author_id = $1', [id]);
    // 2. 사용자 삭제
    const result = await pool.query('DELETE FROM users WHERE id = $1', [id]);

    console.log(`Successfully deleted user ${id}. Rows affected: ${result.rowCount}`);
    res.json({ success: true });
  } catch (e) {
    console.error('Failed to delete user:', e);
    res.status(500).json({ error: '사용자 삭제 실패: ' + (e as Error).message });
  }
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

    app.use((err, req, res, next) => { fs.appendFileSync('debug.log', 'Global Error: ' + (err.stack || err) + '\n'); res.status(500).json({ error: 'Internal Server Error' }); });

app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }
}

startServer();

// Export the express app for Vercel Serverless
export default app;
