// Staging must never contact real people. When EMAIL_RECIPIENT_ALLOWLIST or SMS_RECIPIENT_ALLOWLIST is
// set, messages go only to the listed recipients; everyone else is withheld and logged. Unset (production)
// means no restriction. Email entries are addresses or whole domains ("@example.com"); SMS entries are
// phone numbers in any common UK format.

const list = (value: string | undefined) => (value || '').split(',').map(v => v.trim()).filter(Boolean);

export function emailRecipientAllowed(address: string, setting = process.env.EMAIL_RECIPIENT_ALLOWLIST) {
  const allowed = list(setting).map(v => v.toLowerCase());
  if (!allowed.length) return true;
  const email = String(address || '').trim().toLowerCase().replace(/^.*<([^<>]+)>.*$/, '$1');
  const domain = email.slice(email.lastIndexOf('@'));
  return allowed.includes(email) || (domain.length > 1 && allowed.includes(domain));
}

const phoneKey = (value: string) => {
  const digits = String(value || '').replace(/^whatsapp:/, '').replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('44')) return '+' + digits;
  if (digits.startsWith('0')) return '+44' + digits.slice(1);
  return digits;
};

export function smsRecipientAllowed(number: string, setting = process.env.SMS_RECIPIENT_ALLOWLIST) {
  const allowed = list(setting).map(phoneKey);
  if (!allowed.length) return true;
  return allowed.includes(phoneKey(number));
}
