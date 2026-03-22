import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'fleming-lettings-secret-change-in-production';

export interface AuthRequest extends Request {
  user?: {
    id: number;
    email: string;
    role: string;
    name: string;
  };
}

export function generateToken(user: { id: number; email: string; role: string; name: string }) {
  return jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string) {
  return jwt.verify(token, JWT_SECRET) as { id: number; email: string; role: string; name: string };
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  
  try {
    const decoded = verifyToken(token);
    req.user = decoded;
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
