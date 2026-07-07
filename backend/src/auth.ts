import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { queryOne } from './db-pg';

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable must be set in production');
  process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET || 'fleming-lettings-dev-only-secret';

export interface AuthRequest extends Request {
  user?: {
    id: number;
    email: string;
    role: string;
    name: string;
  };
}

export function generateToken(user: { id: number; email: string; role: string; name: string }) {
  return jwt.sign(user, JWT_SECRET, { expiresIn: '24h' });
}

export function verifyToken(token: string) {
  return jwt.verify(token, JWT_SECRET) as { id: number; email: string; role: string; name: string; iat?: number };
}

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = verifyToken(token);
    // Revocation: deactivating a user or changing their password invalidates
    // every token issued before that moment
    const user = await queryOne(
      'SELECT is_active, last_password_change, role FROM users WHERE id = $1',
      [decoded.id]
    );
    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    if (user.last_password_change && decoded.iat &&
        decoded.iat * 1000 < new Date(user.last_password_change).getTime()) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    // Role changes take effect on the next request, not the next login
    req.user = { ...decoded, role: user.role };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

// Permission hierarchy helper
export function hasPermission(userRole: string, requiredRole: 'viewer' | 'staff' | 'manager' | 'admin'): boolean {
  const hierarchy = { 'viewer': 1, 'staff': 2, 'manager': 3, 'admin': 4 };
  return hierarchy[userRole as keyof typeof hierarchy] >= hierarchy[requiredRole];
}

// Middleware to require minimum permission level
export function requirePermission(minRole: 'viewer' | 'staff' | 'manager' | 'admin') {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    if (!hasPermission(req.user.role, minRole)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}
