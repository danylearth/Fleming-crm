import crypto from 'crypto';

export interface BankFeedConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authBaseUrl: string;
  apiBaseUrl: string;
}

export interface BankTransaction {
  transaction_id: string;
  timestamp: string;
  description?: string;
  amount: number;
  currency?: string;
  transaction_type?: string;
  transaction_category?: string;
  merchant_name?: string;
}

export interface RentCandidate {
  tenantId: number;
  propertyId: number;
  tenancyId: number | null;
  tenantName: string;
  propertyAddress: string;
  postcode: string;
  rentAmount: number;
  tenancyStartDate?: string | null;
}

export interface PropertyCandidate {
  propertyId: number;
  address: string;
  postcode: string;
}

export interface DepositCandidate {
  tenantId?: number | null;
  enquiryId?: number | null;
  propertyId?: number | null;
  tenancyId?: number | null;
  name: string;
  amount: number;
}

export function bankFeedConfig(): BankFeedConfig | null {
  const clientId = process.env.TRUELAYER_CLIENT_ID?.trim();
  const clientSecret = process.env.TRUELAYER_CLIENT_SECRET?.trim();
  const redirectUri = process.env.TRUELAYER_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !redirectUri || !process.env.BANK_FEED_ENCRYPTION_KEY) return null;
  const sandbox = process.env.TRUELAYER_ENV !== 'live';
  return {
    clientId,
    clientSecret,
    redirectUri,
    authBaseUrl: sandbox ? 'https://auth.truelayer-sandbox.com' : 'https://auth.truelayer.com',
    apiBaseUrl: sandbox ? 'https://api.truelayer-sandbox.com' : 'https://api.truelayer.com',
  };
}

function encryptionKey(): Buffer {
  const raw = process.env.BANK_FEED_ENCRYPTION_KEY || '';
  const key = /^[a-f0-9]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('BANK_FEED_ENCRYPTION_KEY must be 32 bytes (base64 or hex)');
  return key;
}

export function encryptToken(value: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map(part => part.toString('base64url')).join('.');
}

export function decryptToken(value: string): string {
  const [ivRaw, tagRaw, ciphertextRaw] = String(value || '').split('.');
  if (!ivRaw || !tagRaw || !ciphertextRaw) throw new Error('Stored bank token is invalid');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivRaw, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextRaw, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

async function trueLayerRequest<T>(url: string, options: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({})) as Record<string, any>;
  if (!response.ok) {
    const message = body.error_description || body.detail || body.error || `TrueLayer request failed (${response.status})`;
    throw new Error(String(message));
  }
  return body as T;
}

export function buildAuthUrl(config: BankFeedConfig, state: string): string {
  const url = new URL(config.authBaseUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('scope', 'info accounts balance transactions offline_access');
  url.searchParams.set('providers', process.env.TRUELAYER_PROVIDERS || 'uk-ob-all');
  url.searchParams.set('state', state);
  return url.toString();
}

export async function exchangeCode(config: BankFeedConfig, code: string) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    code,
  });
  return trueLayerRequest<{ access_token: string; refresh_token?: string; expires_in?: number }>(
    `${config.authBaseUrl}/connect/token`,
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body },
  );
}

export async function refreshAccess(config: BankFeedConfig, refreshToken: string) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
  });
  return trueLayerRequest<{ access_token: string; refresh_token?: string; expires_in?: number }>(
    `${config.authBaseUrl}/connect/token`,
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body },
  );
}

export async function fetchAccounts(config: BankFeedConfig, accessToken: string) {
  return trueLayerRequest<{ results: Array<{ account_id: string; display_name?: string; provider?: { display_name?: string } }> }>(
    `${config.apiBaseUrl}/data/v1/accounts`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
}

export async function fetchTransactions(config: BankFeedConfig, accessToken: string, accountId: string, from: string, to: string) {
  const url = new URL(`${config.apiBaseUrl}/data/v1/accounts/${encodeURIComponent(accountId)}/transactions`);
  url.searchParams.set('from', from);
  url.searchParams.set('to', to);
  return trueLayerRequest<{ results: BankTransaction[] }>(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

function normalise(value: string): string {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function usefulNameTokens(name: string): string[] {
  return String(name || '').toLowerCase().split(/[^a-z]+/).filter(token => token.length >= 4 && !['and', 'with'].includes(token));
}

export function matchRent(transaction: BankTransaction, candidates: RentCandidate[]): RentCandidate | null {
  if (Number(transaction.amount) <= 0) return null;
  const description = String(transaction.description || transaction.merchant_name || '').toLowerCase();
  const compact = normalise(description);
  const scored = candidates.map(candidate => {
    let score = 0;
    if (Math.abs(Number(transaction.amount) - Number(candidate.rentAmount)) < 0.01) score += 3;
    if (usefulNameTokens(candidate.tenantName).some(token => description.includes(token))) score += 3;
    if (candidate.postcode && compact.includes(normalise(candidate.postcode))) score += 2;
    return { candidate, score };
  }).filter(item => item.score >= 6).sort((a, b) => b.score - a.score);
  if (!scored.length || (scored[1] && scored[1].score === scored[0].score)) return null;
  return scored[0].candidate;
}

export function matchDeposit(transaction: BankTransaction, candidates: DepositCandidate[]): DepositCandidate | null {
  if (Number(transaction.amount) <= 0) return null;
  const description = String(transaction.description || transaction.merchant_name || '').toLowerCase();
  const matches = candidates.filter(candidate =>
    candidate.amount > 0 &&
    Math.abs(Number(transaction.amount) - Number(candidate.amount)) < 0.01 &&
    usefulNameTokens(candidate.name).some(token => description.includes(token))
  );
  return matches.length === 1 ? matches[0] : null;
}

export function matchExpense(transaction: BankTransaction, candidates: PropertyCandidate[]): PropertyCandidate | null {
  if (Number(transaction.amount) >= 0) return null;
  const compact = normalise(`${transaction.description || ''} ${transaction.merchant_name || ''}`);
  const matches = candidates.filter(candidate => {
    const postcode = normalise(candidate.postcode);
    if (postcode.length >= 5 && compact.includes(postcode)) return true;
    const address = normalise(candidate.address.replace(/,.*$/, ''));
    return address.length >= 8 && compact.includes(address);
  });
  return matches.length === 1 ? matches[0] : null;
}

export function dueDateForPayment(startDate: string | null | undefined, timestamp: string): string {
  const payment = new Date(timestamp);
  const start = startDate ? new Date(startDate) : payment;
  const day = Math.min(start.getUTCDate(), new Date(Date.UTC(payment.getUTCFullYear(), payment.getUTCMonth() + 1, 0)).getUTCDate());
  return new Date(Date.UTC(payment.getUTCFullYear(), payment.getUTCMonth(), day)).toISOString().slice(0, 10);
}
