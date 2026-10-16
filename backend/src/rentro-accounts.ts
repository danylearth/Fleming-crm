// Rentro sign-up and the signed-in account. Supabase Auth owns passwords, email confirmation and
// sessions; sign-up comes through here so the pilot allowlist and the CRM records are created together.
import crypto from 'crypto';
import type { Express, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { createChallenge, verifySolution } from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/pbkdf2';
import pool, { query, queryOne, run } from './db-pg';
import { brandedEmailHtml, sendEmail } from './email';
import { rentroSignupMode } from './rentro-config';
import { rentroAuth, type RentroRequest } from './rentro-auth';
import { rentroAudit } from './rentro-audit';
import { InputError } from './rentro-scope';
import { supabaseAdmin } from './rentro-supabase';

export const RENTRO_TERMS_VERSION = '2026-10-pilot';
const COMMON = ['password', 'password1', 'password123', '12345678', '123456789', '1234567890', 'qwerty123', 'qwertyuiop', 'iloveyou', 'letmein1', 'welcome1', 'abc12345', '11111111', 'sunshine', 'football', 'monkey123'];

/** Why a password won't do, or null. Supabase also enforces the 12-character minimum. */
export function weakPassword(password: unknown, email: string): string | null {
  if (typeof password !== 'string' || password.length < 12) return 'Use at least 12 characters';
  if (password.length > 72) return 'Use 72 characters or fewer';
  const p = password.toLowerCase();
  if (COMMON.some(c => p.includes(c))) return 'That one is too easy to guess. Try another.';
  const local = email.split('@')[0].toLowerCase();
  if (local.length >= 3 && p.includes(local)) return 'Keep your email out of your password';
  return null;
}

export interface SignupInput { email: string; password: string; name: string; phone: string | null }

export function signupInput(body: any): SignupInput {
  const email = String(body?.email || '').trim().toLowerCase();
  const name = String(body?.name || '').trim().replace(/\s+/g, ' ');
  const phone = String(body?.phone || '').trim();
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) || email.length > 254) throw new InputError('Enter a valid email address');
  if (name.length < 2 || name.length > 120) throw new InputError('Enter your full name');
  if (phone && !/^\+?[0-9 ()-]{7,20}$/.test(phone)) throw new InputError('Enter a valid phone number, or leave it blank');
  if (body?.terms !== true) throw new InputError('Agree to the pilot terms to continue');
  const problem = weakPassword(body?.password, email);
  if (problem) throw new InputError(problem);
  return { email, password: body.password, name, phone: phone || null };
}

const challengeSecret = () => crypto.createHmac('sha256', process.env.JWT_SECRET!).update('rentro-signup-bot-check').digest('hex');
const hash = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

async function verifyBotCheck(altcha: unknown) {
  if (typeof altcha !== 'string' || altcha.length > 8000) throw new Error();
  const payload = JSON.parse(Buffer.from(altcha, 'base64').toString());
  const params = payload.challenge?.parameters;
  if (params?.data?.purpose !== 'rentro-signup' || params.algorithm !== 'PBKDF2/SHA-256' || params.cost !== 1000) throw new Error();
  if (!(await verifySolution({ challenge: payload.challenge, solution: payload.solution, deriveKey, hmacSignatureSecret: challengeSecret() })).verified) throw new Error();
  await run('DELETE FROM auth_challenge_uses WHERE expires_at<NOW()');
  const used = await query('INSERT INTO auth_challenge_uses(signature_hash,expires_at) VALUES($1,to_timestamp($2)) ON CONFLICT DO NOTHING RETURNING signature_hash',
    [hash(payload.challenge.signature), params.expiresAt]);
  if (!used.length) throw new Error();
}

const appUrl = () => (process.env.RENTRO_APP_URL || 'http://127.0.0.1:4390/rentro.html').replace(/#.*$/, '');

function confirmEmail(name: string, link: string) {
  const first = name.split(' ')[0];
  return {
    subject: 'Confirm your email to finish setting up Rentro',
    html: brandedEmailHtml('Rentro', `<p>Hi ${first.replace(/[<>&"']/g, '')},</p>
      <p>Confirm your email address to finish setting up your Rentro account.</p>
      <p><a href="${link}" style="display:inline-block;background:#27083D;color:#ffffff;padding:12px 20px;text-decoration:none;font-weight:bold">Confirm my email</a></p>
      <p>This link expires in 24 hours. If you did not ask for a Rentro account, you can ignore this email.</p>`),
  };
}

/**
 * Creates the Supabase user and the CRM records in one step. A landlord whose email already belongs to a
 * CRM landlord waits for staff to link them (pending_link); otherwise a new Rentro landlord is created.
 */
export async function createRentroLandlord(input: SignupInput) {
  if (await queryOne('SELECT 1 FROM customer_accounts WHERE lower(email)=$1', [input.email])) throw new InputError('An account with that email already exists. Sign in instead.', 409);
  if (rentroSignupMode() === 'allowlist' && !await queryOne('SELECT 1 FROM rentro_pilot_allowlist WHERE email=$1', [input.email]))
    throw new InputError('Rentro is invite-only during the pilot. Ask Fleming Lettings for an invitation.', 403);

  const { data, error } = await supabaseAdmin().auth.admin.generateLink({
    type: 'signup', email: input.email, password: input.password, options: { redirectTo: appUrl(), data: { name: input.name } },
  });
  if (error || !data?.user?.id || !data.properties?.action_link) {
    const exists = /already (been )?registered|already exists/i.test(error?.message || '');
    if (exists) throw new InputError('An account with that email already exists. Sign in instead.', 409);
    throw new Error(`Supabase generateLink failed: ${error?.message || 'no user or link returned'}`);
  }
  const userId = data.user.id;
  const client = await pool.connect();
  let pendingLink = false;
  try {
    await client.query('BEGIN');
    await client.query("INSERT INTO customer_accounts(id,email,name,phone,terms_version,terms_accepted_at) VALUES($1,$2,$3,$4,$5,NOW())",
      [userId, input.email, input.name, input.phone, RENTRO_TERMS_VERSION]);
    await client.query('INSERT INTO customer_notification_prefs(account_id) VALUES($1)', [userId]);
    const existing = (await client.query('SELECT id FROM landlords WHERE lower(email)=$1 ORDER BY id LIMIT 1', [input.email])).rows[0];
    if (existing) {
      pendingLink = true;
      await client.query("INSERT INTO customer_roles(account_id,role,status,granted_via) VALUES($1,'landlord','pending_link','signup')", [userId]);
      await client.query(`INSERT INTO tasks(title,description,status,priority,entity_type,entity_id,task_type,due_date)
        VALUES($1,$2,'pending','medium','landlord',$3,'rentro_authority',CURRENT_DATE)`,
        [`Link Rentro account — ${input.name}`, `A Rentro sign-up used ${input.email}, which matches this landlord. Confirm it is the same person before linking the account in Rentro → Accounts.`, existing.id]);
    } else {
      const landlord = (await client.query("INSERT INTO landlords(name,email,phone,landlord_type,source) VALUES($1,$2,$3,'external','rentro') RETURNING id",
        [input.name, input.email, input.phone])).rows[0];
      await client.query("INSERT INTO customer_roles(account_id,role,landlord_id,status,granted_via) VALUES($1,'landlord',$2,'active','signup')", [userId, landlord.id]);
    }
    await rentroAudit(client, { accountId: userId, email: input.email }, 'create', 'customer_account', null, { role: 'landlord', pending_link: pendingLink });
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    try { await supabaseAdmin().auth.admin.deleteUser(userId); } catch (cleanup) { console.error('[rentro signup] could not remove Supabase user after a failed sign-up', userId, cleanup); }
    throw e;
  } finally {
    client.release();
  }
  const email = confirmEmail(input.name, data.properties.action_link);
  const sent = await sendEmail({ to: input.email, ...email, idempotencyKey: `rentro-signup-${userId}` });
  return { userId, pendingLink, emailSent: sent.success };
}

const fail = (res: Response, e: any) => {
  if (e instanceof InputError) return res.status(e.status).json({ error: e.message });
  console.error('[rentro signup]', e);
  return res.status(500).json({ error: 'Your account could not be created. Please try again.' });
};

export function registerRentroAccounts(app: Express) {
  const signupLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many attempts. Please try again in 15 minutes.' } });
  const challengeLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many bot checks. Please try again in 15 minutes.' } });

  app.get('/api/rentro/signup-challenge', challengeLimiter, async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(await createChallenge({ algorithm: 'PBKDF2/SHA-256', cost: 1000, counter: crypto.randomInt(1000, 2000), deriveKey,
      hmacSignatureSecret: challengeSecret(), expiresAt: new Date(Date.now() + 5 * 60 * 1000), data: { purpose: 'rentro-signup' } }));
  });

  app.post('/api/rentro/signup', signupLimiter, async (req, res) => {
    let input: SignupInput;
    try { input = signupInput(req.body); } catch (e) { return fail(res, e); }
    try { await verifyBotCheck(req.body.altcha); } catch { return res.status(400).json({ error: 'Complete the bot check again before submitting' }); }
    try {
      const result = await createRentroLandlord(input);
      res.status(201).json({ message: 'Check your email to confirm your account.', pending_link: result.pendingLink, email_sent: result.emailSent });
    } catch (e) { fail(res, e); }
  });

  app.get('/api/rentro/me', rentroAuth, async (req: RentroRequest, res) => {
    const ctx = req.rentro!;
    const landlord = ctx.landlordIds.length ? await queryOne('SELECT id,name,email,phone FROM landlords WHERE id=$1', [ctx.landlordIds[0]]) : null;
    res.json({
      account: { id: ctx.accountId, email: ctx.email, name: ctx.name },
      roles: ctx.roles.map(r => ({ role: r.role, status: r.status })),
      landlord,
    });
  });
}
