# Twilio SMS Integration

## Overview

Twilio's Programmable Messaging API enables sending SMS/MMS messages, tracking delivery status via webhooks, and retrieving message history. The Node.js SDK (`twilio`) provides a promise-based client for all messaging operations.

Fleming CRM already has a basic Twilio integration in `backend/src/sms.ts` that sends SMS with a simulation fallback. This spec documents the full Twilio SMS capabilities needed to extend that integration with delivery tracking and message history.

## Installation

```bash
npm install twilio
```

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TWILIO_ACCOUNT_SID` | Yes | Account SID from twilio.com/console (starts with `AC`) |
| `TWILIO_AUTH_TOKEN` | Yes | Auth Token from twilio.com/console |
| `TWILIO_PHONE_NUMBER` | Yes | Your Twilio phone number in E.164 format (e.g. `+441234567890`) |

### Initialization

```typescript
import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);
```

The client is initialized once and reused. If env vars are missing, the existing Fleming pattern simulates sends via console.log.

## Key Patterns

### 1. Send an SMS Message

```typescript
const message = await client.messages.create({
  body: 'Your viewing is confirmed for tomorrow at 2pm.',
  from: process.env.TWILIO_PHONE_NUMBER,  // Must be a valid Twilio number
  to: '+447700900123',                      // Recipient in E.164 format
});

console.log('Message SID:', message.sid);     // e.g. "SMaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
console.log('Status:', message.status);        // "queued"
console.log('Date Created:', message.dateCreated);
```

### 2. Send SMS with Status Callback

To track delivery status, provide a `statusCallback` URL. Twilio will POST to this URL each time the message status changes.

```typescript
const message = await client.messages.create({
  body: 'Hi John, your viewing at 42 Oak Street is confirmed for Monday 3pm.',
  from: process.env.TWILIO_PHONE_NUMBER,
  to: '+447700900123',
  statusCallback: 'https://your-api-domain.com/api/sms/status',  // Must be publicly accessible
});
```

### 3. Handle Status Callback Webhook

Twilio sends a POST request with `application/x-www-form-urlencoded` body to your `statusCallback` URL each time the message status changes.

```typescript
import express from 'express';

const app = express();
app.use(express.urlencoded({ extended: true }));

app.post('/api/sms/status', (req, res) => {
  const { MessageSid, MessageStatus, ErrorCode, From, To } = req.body;

  console.log(`SID: ${MessageSid}, Status: ${MessageStatus}`);

  // MessageStatus values: queued → sending → sent → delivered
  //                       queued → sending → sent → undelivered
  //                       queued → failed

  if (ErrorCode && ErrorCode !== '0') {
    console.error(`SMS delivery failed: ErrorCode ${ErrorCode}`);
  }

  // Must return 200 to acknowledge receipt — otherwise Twilio retries
  res.sendStatus(200);
});
```

**Webhook POST body parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `MessageSid` | string | Unique message identifier (e.g. `SMxxxx`) |
| `MessageStatus` | string | Current status: `queued`, `sending`, `sent`, `delivered`, `undelivered`, `failed` |
| `ErrorCode` | string | Error code if failed (e.g. `30001`) — `0` means no error |
| `AccountSid` | string | Your Twilio Account SID |
| `From` | string | Sender phone number |
| `To` | string | Recipient phone number |
| `ApiVersion` | string | API version (e.g. `2010-04-01`) |
| `SmsSid` | string | Same as MessageSid (legacy alias) |
| `SmsStatus` | string | Same as MessageStatus (legacy alias) |

### 4. Message Status Lifecycle

```
queued → sending → sent → delivered     (success path)
queued → sending → sent → undelivered   (carrier couldn't deliver)
queued → failed                          (Twilio couldn't send)
```

- **queued**: Message is in the Twilio queue
- **sending**: Twilio is dispatching to the carrier
- **sent**: Carrier accepted the message
- **delivered**: Carrier confirmed delivery to handset
- **undelivered**: Carrier could not deliver (e.g. invalid number, phone off)
- **failed**: Twilio could not send (e.g. invalid From number, insufficient funds)

### 5. Fetch a Single Message

```typescript
const message = await client.messages('SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxx').fetch();

console.log(message.sid);
console.log(message.status);      // 'delivered', 'failed', etc.
console.log(message.body);
console.log(message.dateSent);
console.log(message.errorCode);   // null if no error
console.log(message.errorMessage);
console.log(message.price);       // e.g. '-0.0075'
console.log(message.priceUnit);   // 'USD'
```

### 6. List / Query Message History

```typescript
// List recent messages
const messages = await client.messages.list({ limit: 20 });

messages.forEach((m) => {
  console.log(`${m.sid} | ${m.to} | ${m.status} | ${m.dateSent}`);
});

// Filter by date range
const messages = await client.messages.list({
  dateSentAfter: new Date('2026-03-01'),
  dateSentBefore: new Date('2026-04-01'),
  limit: 100,
});

// Filter by recipient
const messages = await client.messages.list({
  to: '+447700900123',
  limit: 20,
});

// Filter by sender
const messages = await client.messages.list({
  from: process.env.TWILIO_PHONE_NUMBER,
  limit: 20,
});
```

### 7. Error Handling

```typescript
import twilio from 'twilio';
const { RestException } = twilio;

try {
  const message = await client.messages.create({
    body: 'Hello',
    from: process.env.TWILIO_PHONE_NUMBER,
    to: '+447700900123',
  });
  console.log('Sent:', message.sid);
} catch (error) {
  if (error instanceof RestException) {
    console.error('Twilio Error Code:', error.code);
    console.error('Message:', error.message);
    console.error('HTTP Status:', error.status);
    console.error('More Info:', error.moreInfo);

    // Common error codes:
    // 21211 — Invalid 'To' phone number
    // 21608 — Unverified phone number (trial accounts)
    // 21610 — Recipient has opted out / blocked
    // 21614 — Not a valid mobile number for SMS
    // 30001 — Queue overflow
    // 30002 — Account suspended
    // 30003 — Unreachable destination
    // 30004 — Message blocked
    // 30005 — Unknown destination
    // 30006 — Landline or unreachable carrier
    // 30007 — Message filtered (carrier)
    // 30008 — Unknown error
  } else {
    throw error;
  }
}
```

### 8. Validate Webhook Requests (Security)

Twilio signs webhook requests with your Auth Token. Always validate in production to prevent spoofed callbacks.

```typescript
import twilio from 'twilio';

function validateTwilioWebhook(req: express.Request): boolean {
  const twilioSignature = req.headers['x-twilio-signature'] as string;
  const url = `https://your-domain.com${req.originalUrl}`;
  const params = req.body;

  return twilio.validateRequest(
    process.env.TWILIO_AUTH_TOKEN!,
    twilioSignature,
    url,
    params
  );
}

// Usage as middleware
app.post('/api/sms/status', (req, res) => {
  if (!validateTwilioWebhook(req)) {
    return res.status(403).send('Invalid signature');
  }
  // ... handle webhook
});
```

## API Reference

| Method | Description | Returns |
|--------|-------------|---------|
| `client.messages.create(opts)` | Send SMS/MMS | `Promise<MessageInstance>` |
| `client.messages(sid).fetch()` | Fetch single message by SID | `Promise<MessageInstance>` |
| `client.messages.list(filters?)` | List messages with optional filters | `Promise<MessageInstance[]>` |
| `client.messages(sid).update({ body: '' })` | Redact message body | `Promise<MessageInstance>` |
| `client.messages(sid).remove()` | Delete a message record | `Promise<boolean>` |
| `twilio.validateRequest(token, sig, url, params)` | Validate webhook signature | `boolean` |

### `create()` Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `body` | string | Yes | Message text (max 1600 chars for SMS) |
| `from` | string | Yes* | Your Twilio phone number (E.164) |
| `to` | string | Yes | Recipient phone number (E.164) |
| `statusCallback` | string | No | URL to receive status updates |
| `messagingServiceSid` | string | No* | Messaging Service SID (alternative to `from`) |
| `mediaUrl` | string[] | No | URLs for MMS media attachments |
| `maxPrice` | string | No | Max price in USD you'll pay for this message |
| `validityPeriod` | number | No | Seconds message is valid (max 14400 = 4hrs) |
| `sendAt` | Date | No | Schedule future send (requires Messaging Service) |

*Either `from` or `messagingServiceSid` is required — not both.

### `list()` Filters

| Filter | Type | Description |
|--------|------|-------------|
| `to` | string | Filter by recipient number |
| `from` | string | Filter by sender number |
| `dateSent` | Date | Exact date sent |
| `dateSentAfter` | Date | Messages sent after this date |
| `dateSentBefore` | Date | Messages sent before this date |
| `limit` | number | Max results to return |

## Gotchas

1. **E.164 format required** — All phone numbers must be in E.164 format (e.g. `+447700900123`). The existing `normalizeUkPhone()` in `sms.ts` handles UK numbers.

2. **Trial account limitations** — On trial accounts, you can only send to verified phone numbers. Error code `21608` indicates an unverified number.

3. **statusCallback must be publicly accessible** — Twilio cannot reach `localhost`. Use a tunnel (ngrok) for development or skip statusCallback in dev mode.

4. **Webhook retries** — If your statusCallback endpoint doesn't return 2xx, Twilio retries with exponential backoff for up to 24 hours. Always return 200/204 promptly.

5. **Body parser order matters** — The webhook endpoint needs `express.urlencoded({ extended: true })` middleware. If you're using `express.json()` globally, make sure the urlencoded parser is also registered before the webhook route.

6. **SMS body max length** — A single SMS segment is 160 chars (GSM-7) or 70 chars (UCS-2/Unicode). Longer messages are split into segments and each segment is billed separately. The `body` field supports up to 1600 chars total.

7. **Validate webhook signatures in production** — Without validation, anyone can POST fake status updates to your endpoint. Use `twilio.validateRequest()`.

8. **Opt-out handling** — Twilio automatically handles STOP/HELP keywords for US/CA numbers. For UK numbers, you must handle opt-outs yourself. Error code `21610` means the recipient opted out.

9. **Rate limits** — Twilio imposes per-number sending limits:
   - Long code (standard number): 1 SMS/second
   - Toll-free: 3 SMS/second
   - Short code: 30 SMS/second
   - Messaging Service with number pool: scales with pool size

10. **Price varies by country** — UK outbound SMS costs ~$0.04/segment. Check Twilio pricing page for current rates.

## Rate Limits

| Number Type | Messages/Second | Notes |
|-------------|----------------|-------|
| Long code (e.g. +44...) | 1 msg/sec | Standard phone numbers |
| Toll-free | 3 msg/sec | US/CA only |
| Short code | 30 msg/sec | Requires separate provisioning |
| Messaging Service | Varies | Scales with number pool size |

Twilio also enforces API rate limits:
- **100 requests/second** per account for the Messages API
- Returns HTTP 429 if exceeded

## References

- [Twilio Node.js SDK (GitHub)](https://github.com/twilio/twilio-node)
- [Send SMS Quickstart (Node.js)](https://www.twilio.com/docs/messaging/quickstart/node)
- [Track Outbound Message Status](https://www.twilio.com/docs/messaging/guides/track-outbound-message-status)
- [Outbound Message Logging](https://www.twilio.com/docs/messaging/guides/outbound-message-logging)
- [Message Resource API Reference](https://www.twilio.com/docs/messaging/api/message-resource)
- [Twilio Error Codes](https://www.twilio.com/docs/api/errors)
- [Validate Webhook Requests](https://www.twilio.com/docs/usage/webhooks/webhooks-security)
- [SMS Pricing](https://www.twilio.com/en-us/sms/pricing/gb)
