import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import db from '../database.js';
import { signToken, requireAuth } from '../middleware/auth.js';
import { createDefaultSchedules } from '../database.js';

export const authRoutes = Router();

const APP_URL = process.env.APP_URL || 'http://localhost:3001';

// ── Email helpers ────────────────────────────────────────────────────────────

function getMailer() {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  return nodemailer.createTransport({
    host,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

async function sendVerificationEmail(email: string, token: string) {
  const mailer = getMailer();
  if (!mailer) return; // skip if SMTP not configured
  const link = `${APP_URL}/api/auth/verify-email?token=${token}`;
  await mailer.sendMail({
    from: process.env.SMTP_FROM || 'noreply@besmart.app',
    to: email,
    subject: 'Verify your BeSmart account',
    html: `<p>Click the link to verify your email:</p><p><a href="${link}">${link}</a></p><p>This link expires in 24 hours.</p>`,
  });
}

async function sendPasswordResetEmail(email: string, token: string) {
  const link = `${APP_URL}/reset-password?token=${token}`;
  const mailer = getMailer();
  if (!mailer) {
    console.log(`[Password Reset] SMTP not configured. Reset link for ${email}:\n  ${link}`);
    return;
  }
  await mailer.sendMail({
    from: process.env.SMTP_FROM || 'noreply@besmart.app',
    to: email,
    subject: 'Reset your BeSmart password',
    html: `<p>Click the link to reset your password:</p><p><a href="${link}">${link}</a></p><p>This link expires in 1 hour.</p>`,
  });
}

// ── OAuth state store (CSRF protection) ─────────────────────────────────────

const oauthStates = new Map<string, { provider: string; expires: number }>();

function generateState(provider: string): string {
  const state = crypto.randomBytes(16).toString('hex');
  oauthStates.set(state, { provider, expires: Date.now() + 10 * 60 * 1000 });
  return state;
}

function verifyState(state: string, expectedProvider: string): boolean {
  const entry = oauthStates.get(state);
  if (!entry) return false;
  oauthStates.delete(state);
  return entry.provider === expectedProvider && entry.expires > Date.now();
}

// ── User helpers ─────────────────────────────────────────────────────────────

function findOrCreateOAuthUser(
  provider: string,
  oauthId: string,
  email: string | null,
  displayName: string | null,
  avatarUrl: string | null
): any {
  // Try to find by oauth identity
  let user = db.prepare(
    'SELECT * FROM users WHERE oauth_provider = ? AND oauth_id = ?'
  ).get(provider, oauthId) as any;

  if (!user && email) {
    // Try to find by email and link the OAuth account
    user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;
    if (user) {
      db.prepare(
        'UPDATE users SET oauth_provider = ?, oauth_id = ?, display_name = ?, avatar_url = ? WHERE id = ?'
      ).run(provider, oauthId, displayName || user.display_name, avatarUrl || user.avatar_url, user.id);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    }
  }

  if (!user) {
    const result = db.prepare(
      `INSERT INTO users (email, is_verified, oauth_provider, oauth_id, display_name, avatar_url)
       VALUES (?, 1, ?, ?, ?, ?)`
    ).run(email, provider, oauthId, displayName, avatarUrl);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    createDefaultSchedules(user.id);
  }

  return user;
}

// ── Auth config endpoint ──────────────────────────────────────────────────────

authRoutes.get('/config', (_req, res) => {
  res.json({
    data: {
      google: !!process.env.GOOGLE_CLIENT_ID,
      github: !!process.env.GITHUB_CLIENT_ID,
      wechat: !!process.env.WECHAT_APP_ID,
      emailVerification: !!process.env.SMTP_HOST,
    },
  });
});

// ── Email / password auth ─────────────────────────────────────────────────────

authRoutes.post('/signup', async (req, res) => {
  const { email, password, display_name } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'password must be at least 6 characters' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    return res.status(409).json({ error: 'Email already registered' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const smtpConfigured = !!process.env.SMTP_HOST;
  const verificationToken = smtpConfigured ? crypto.randomBytes(32).toString('hex') : null;
  const verificationExpires = smtpConfigured
    ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    : null;

  const result = db.prepare(
    `INSERT INTO users (email, password_hash, is_verified, verification_token, verification_expires, display_name)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    email,
    passwordHash,
    smtpConfigured ? 0 : 1,
    verificationToken,
    verificationExpires,
    display_name || email.split('@')[0]
  );

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid) as any;
  createDefaultSchedules(user.id);

  if (smtpConfigured && verificationToken) {
    try {
      await sendVerificationEmail(email, verificationToken);
    } catch (err) {
      console.error('Failed to send verification email:', err);
    }
    return res.status(201).json({ message: 'Check your email to verify your account' });
  }

  const token = signToken({ id: user.id, email: user.email, display_name: user.display_name });
  res.status(201).json({
    data: { token, user: { id: user.id, email: user.email, display_name: user.display_name, avatar_url: user.avatar_url } },
  });
});

authRoutes.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;
  if (!user || !user.password_hash) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  if (!user.is_verified) {
    return res.status(403).json({ error: 'Please verify your email before logging in' });
  }

  const token = signToken({ id: user.id, email: user.email, display_name: user.display_name });
  res.json({
    data: { token, user: { id: user.id, email: user.email, display_name: user.display_name, avatar_url: user.avatar_url } },
  });
});

authRoutes.get('/verify-email', (req, res) => {
  const { token } = req.query as { token: string };
  if (!token) return res.status(400).send('Missing token');

  const user = db.prepare(
    'SELECT * FROM users WHERE verification_token = ? AND verification_expires > datetime("now")'
  ).get(token) as any;

  if (!user) {
    return res.redirect(`${APP_URL}/login?error=invalid_token`);
  }

  db.prepare(
    'UPDATE users SET is_verified = 1, verification_token = NULL, verification_expires = NULL WHERE id = ?'
  ).run(user.id);

  res.redirect(`${APP_URL}/login?verified=1`);
});

authRoutes.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email is required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;
  // Always return success to prevent email enumeration
  if (!user) return res.json({ message: 'If that email exists, a reset link has been sent' });

  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  db.prepare(
    'UPDATE users SET password_reset_token = ?, password_reset_expires = ? WHERE id = ?'
  ).run(token, expires, user.id);

  const smtpConfigured = !!process.env.SMTP_HOST;
  try {
    await sendPasswordResetEmail(email, token);
  } catch (err) {
    console.error('Failed to send reset email:', err);
    return res.status(500).json({ error: 'Failed to send reset email. Check server SMTP configuration.' });
  }

  res.json({
    message: smtpConfigured
      ? 'If that email exists, a reset link has been sent'
      : 'SMTP not configured — reset link logged to server console',
  });
});

authRoutes.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'token and password are required' });
  if (password.length < 6) return res.status(400).json({ error: 'password must be at least 6 characters' });

  const user = db.prepare(
    'SELECT * FROM users WHERE password_reset_token = ? AND password_reset_expires > datetime("now")'
  ).get(token) as any;

  if (!user) return res.status(400).json({ error: 'Invalid or expired reset token' });

  const hash = await bcrypt.hash(password, 10);
  db.prepare(
    'UPDATE users SET password_hash = ?, password_reset_token = NULL, password_reset_expires = NULL WHERE id = ?'
  ).run(hash, user.id);

  res.json({ message: 'Password updated successfully' });
});

authRoutes.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, email, display_name, avatar_url, created_at FROM users WHERE id = ?').get(req.user!.id);
  res.json({ data: user });
});

// ── Google OAuth ──────────────────────────────────────────────────────────────

authRoutes.get('/oauth/google', (_req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return res.redirect('/login?error=oauth_not_configured');

  const state = generateState('google');
  const redirectUri = encodeURIComponent(`${APP_URL}/api/auth/oauth/google/callback`);
  const scope = encodeURIComponent('openid email profile');
  res.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&state=${state}`
  );
});

authRoutes.get('/oauth/google/callback', async (req, res) => {
  const { code, state, error } = req.query as Record<string, string>;
  if (error || !code || !verifyState(state, 'google')) {
    return res.redirect(`${APP_URL}/login?error=oauth_failed`);
  }

  try {
    const clientId = process.env.GOOGLE_CLIENT_ID!;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
    const redirectUri = `${APP_URL}/api/auth/oauth/google/callback`;

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
    });
    const tokenData = await tokenRes.json() as any;
    if (!tokenData.access_token) throw new Error('No access token');

    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const googleUser = await userRes.json() as any;

    const user = findOrCreateOAuthUser('google', googleUser.id, googleUser.email, googleUser.name, googleUser.picture);
    const token = signToken({ id: user.id, email: user.email, display_name: user.display_name });
    res.redirect(`${APP_URL}/auth/callback?token=${token}`);
  } catch (err) {
    console.error('Google OAuth error:', err);
    res.redirect(`${APP_URL}/login?error=oauth_failed`);
  }
});

// ── GitHub OAuth ──────────────────────────────────────────────────────────────

authRoutes.get('/oauth/github', (_req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) return res.redirect('/login?error=oauth_not_configured');

  const state = generateState('github');
  res.redirect(
    `https://github.com/login/oauth/authorize?client_id=${clientId}&scope=user:email&state=${state}`
  );
});

authRoutes.get('/oauth/github/callback', async (req, res) => {
  const { code, state, error } = req.query as Record<string, string>;
  if (error || !code || !verifyState(state, 'github')) {
    return res.redirect(`${APP_URL}/login?error=oauth_failed`);
  }

  try {
    const clientId = process.env.GITHUB_CLIENT_ID!;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET!;

    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    });
    const tokenData = await tokenRes.json() as any;
    if (!tokenData.access_token) throw new Error('No access token');

    const [userRes, emailRes] = await Promise.all([
      fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${tokenData.access_token}`, 'User-Agent': 'BeSmart' },
      }),
      fetch('https://api.github.com/user/emails', {
        headers: { Authorization: `Bearer ${tokenData.access_token}`, 'User-Agent': 'BeSmart' },
      }),
    ]);
    const ghUser = await userRes.json() as any;
    const emails = await emailRes.json() as any[];
    const primary = Array.isArray(emails) ? emails.find((e) => e.primary)?.email : null;

    const user = findOrCreateOAuthUser('github', String(ghUser.id), primary || ghUser.email, ghUser.name || ghUser.login, ghUser.avatar_url);
    const token = signToken({ id: user.id, email: user.email, display_name: user.display_name });
    res.redirect(`${APP_URL}/auth/callback?token=${token}`);
  } catch (err) {
    console.error('GitHub OAuth error:', err);
    res.redirect(`${APP_URL}/login?error=oauth_failed`);
  }
});

// ── WeChat OAuth ──────────────────────────────────────────────────────────────

// Returns params for the frontend WeChat JS SDK (embedded QR code flow)
authRoutes.get('/oauth/wechat/jssdk-params', (_req, res) => {
  const appId = process.env.WECHAT_APP_ID;
  if (!appId) return res.status(501).json({ error: 'WeChat OAuth not configured' });

  const state = generateState('wechat');
  res.json({
    data: {
      appid: appId,
      redirect_uri: `${APP_URL}/api/auth/oauth/wechat/callback`,
      state,
    },
  });
});

authRoutes.get('/oauth/wechat', (_req, res) => {
  const appId = process.env.WECHAT_APP_ID;
  if (!appId) return res.redirect('/login?error=oauth_not_configured');

  const state = generateState('wechat');
  const redirectUri = encodeURIComponent(`${APP_URL}/api/auth/oauth/wechat/callback`);
  res.redirect(
    `https://open.weixin.qq.com/connect/qrconnect?appid=${appId}&redirect_uri=${redirectUri}&response_type=code&scope=snsapi_login&state=${state}#wechat_redirect`
  );
});

authRoutes.get('/oauth/wechat/callback', async (req, res) => {
  const { code, state } = req.query as Record<string, string>;
  if (!code || !verifyState(state, 'wechat')) {
    return res.redirect(`${APP_URL}/login?error=oauth_failed`);
  }

  try {
    const appId = process.env.WECHAT_APP_ID!;
    const appSecret = process.env.WECHAT_APP_SECRET!;

    const tokenRes = await fetch(
      `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${appId}&secret=${appSecret}&code=${code}&grant_type=authorization_code`
    );
    const tokenData = await tokenRes.json() as any;
    if (!tokenData.access_token) throw new Error('No access token');

    const userRes = await fetch(
      `https://api.weixin.qq.com/sns/userinfo?access_token=${tokenData.access_token}&openid=${tokenData.openid}`
    );
    const wxUser = await userRes.json() as any;

    const user = findOrCreateOAuthUser('wechat', tokenData.openid, null, wxUser.nickname, wxUser.headimgurl);
    const token = signToken({ id: user.id, email: user.email, display_name: user.display_name });
    res.redirect(`${APP_URL}/auth/callback?token=${token}`);
  } catch (err) {
    console.error('WeChat OAuth error:', err);
    res.redirect(`${APP_URL}/login?error=oauth_failed`);
  }
});
