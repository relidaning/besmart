import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Set in the untracked .env (docker-compose passes it through). Production refuses to
// start without it, so a missing secret never falls back to a well-known one.
if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET is not set (see .env.example)');
}
export const JWT_SECRET = process.env.JWT_SECRET || 'besmart-dev-secret';

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    req.user = { id: payload.id, email: payload.email, display_name: payload.display_name };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function signToken(user: { id: number; email: string | null; display_name: string | null }) {
  return jwt.sign(
    { id: user.id, email: user.email, display_name: user.display_name },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}
