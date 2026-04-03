# Resend Email API

## Overview

Resend is a transactional email API for developers. The Node.js SDK provides a simple interface for sending HTML emails, batch sending, retrieving email status, using templates with variables, and sending attachments. Delivery tracking is available via webhooks and the retrieve email endpoint.

**Already integrated in this project** — see `backend/src/email.ts` for the existing wrapper.

## Installation

```bash
npm install resend
```

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `RESEND_API_KEY` | Yes | API key from [resend.com/api-keys](https://resend.com/api-keys). Prefixed with `re_` |
| `EMAIL_FROM` | No | Default sender address. Format: `Name <email@yourdomain.com>`. Must use a verified domain or `onboarding@resend.dev` for testing |

### Initialization

```typescript
import { Resend } from 'resend';

// Production — API key from environment
const resend = new Resend(process.env.RESEND_API_KEY);

// Graceful fallback when key is missing (dev/test)
const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;
```

## Key Patterns

### Send a Single Email (HTML)

```typescript
const { data, error } = await resend.emails.send({
  from: 'Fleming Lettings <notifications@fleminglettings.co.uk>',
  to: ['tenant@example.com'],
  subject: 'Viewing Confirmation',
  html: '<h1>Your viewing is confirmed</h1><p>Details below...</p>',
});

if (error) {
  console.error(error);
  return;
}

console.log('Sent:', data.id); // e.g. "4ef9a417-02e9-4d39-ad75-9611e0fcc33c"
```

### Send with Plain Text Fallback

```typescript
const { data, error } = await resend.emails.send({
  from: 'Fleming Lettings <notifications@fleminglettings.co.uk>',
  to: ['tenant@example.com'],
  subject: 'Rent Reminder',
  html: '<p>Your rent of <strong>£1,200</strong> is due.</p>',
  text: 'Your rent of £1,200 is due.',  // plain text fallback
});
```

### Send with CC, BCC, Reply-To

```typescript
const { data, error } = await resend.emails.send({
  from: 'Fleming Lettings <notifications@fleminglettings.co.uk>',
  to: ['tenant@example.com'],
  cc: ['manager@fleminglettings.co.uk'],
  bcc: ['archive@fleminglettings.co.uk'],
  reply_to: 'accounts@fleminglettings.co.uk',
  subject: 'Payment Confirmation',
  html: '<p>Payment received. Thank you.</p>',
});
```

### Send with Attachments

Attachments support two methods: base64 content or a URL path.

```typescript
// Method 1: Base64 content
const { data, error } = await resend.emails.send({
  from: 'Fleming Lettings <notifications@fleminglettings.co.uk>',
  to: ['tenant@example.com'],
  subject: 'Your Invoice',
  html: '<p>Please find your invoice attached.</p>',
  attachments: [
    {
      filename: 'invoice.pdf',
      content: Buffer.from(pdfBytes).toString('base64'),
    },
  ],
});

// Method 2: URL path
const { data, error } = await resend.emails.send({
  from: 'Fleming Lettings <notifications@fleminglettings.co.uk>',
  to: ['tenant@example.com'],
  subject: 'Your Invoice',
  html: '<p>Please find your invoice attached.</p>',
  attachments: [
    {
      filename: 'invoice.pdf',
      path: 'https://example.com/invoices/invoice-123.pdf',
    },
  ],
});
```

### Send Using a Dashboard Template

Templates are created in the Resend dashboard. Variables are injected at send time.

```typescript
const { data, error } = await resend.emails.send({
  from: 'Fleming Lettings <notifications@fleminglettings.co.uk>',
  to: 'tenant@example.com',
  template: {
    id: 'order-confirmation',
    variables: {
      TENANT_NAME: 'John Smith',
      PROPERTY_ADDRESS: '42 High Street, London',
      MOVE_IN_DATE: '2026-05-01',
    },
  },
});
```

### Send with Tags (for tracking/filtering)

```typescript
const { data, error } = await resend.emails.send({
  from: 'Fleming Lettings <notifications@fleminglettings.co.uk>',
  to: ['tenant@example.com'],
  subject: 'Viewing Confirmation',
  html: '<p>Confirmed.</p>',
  tags: [
    { name: 'category', value: 'viewing_confirmation' },
    { name: 'enquiry_id', value: '12345' },
  ],
});
```

### Batch Send (up to 100 emails)

```typescript
const { data, error } = await resend.batch.send([
  {
    from: 'Fleming Lettings <notifications@fleminglettings.co.uk>',
    to: ['tenant1@example.com'],
    subject: 'Rent Reminder',
    html: '<p>Your rent is due.</p>',
  },
  {
    from: 'Fleming Lettings <notifications@fleminglettings.co.uk>',
    to: ['tenant2@example.com'],
    subject: 'Rent Reminder',
    html: '<p>Your rent is due.</p>',
  },
]);

// data.data contains array of { id } for each email
```

### Retrieve Email Status

```typescript
const { data, error } = await resend.emails.get(
  '4ef9a417-02e9-4d39-ad75-9611e0fcc33c'
);

// data.last_event — delivery status:
// 'sent' | 'delivered' | 'delivery_delayed' | 'complained' | 'bounced' | 'opened' | 'clicked'
console.log(data.last_event); // e.g. "delivered"
```

### List Sent Emails

```typescript
const { data, error } = await resend.emails.list({
  limit: 50,       // max 100, default 20
  after: 'email-id', // cursor-based pagination
});

// data.data — array of email summaries
// data.has_more — boolean for pagination
```

## API Reference

| Method | Description | Returns |
|--------|-------------|---------|
| `resend.emails.send(params)` | Send a single email | `{ data: { id }, error }` |
| `resend.emails.get(id)` | Retrieve email by ID (status, content) | `{ data: EmailObject, error }` |
| `resend.emails.list(params?)` | List sent emails with pagination | `{ data: { data: [], has_more }, error }` |
| `resend.batch.send(emails[])` | Send up to 100 emails in one request | `{ data: { data: [{ id }] }, error }` |

### `emails.send()` Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `from` | `string` | Yes | Sender. Format: `Name <email@domain.com>` |
| `to` | `string \| string[]` | Yes | Recipient(s) |
| `subject` | `string` | Yes (unless using `template`) | Email subject |
| `html` | `string` | No | HTML body |
| `text` | `string` | No | Plain text body |
| `template` | `{ id, variables }` | No | Dashboard template with variables |
| `cc` | `string \| string[]` | No | CC recipients |
| `bcc` | `string \| string[]` | No | BCC recipients |
| `reply_to` | `string \| string[]` | No | Reply-to address(es) |
| `attachments` | `Attachment[]` | No | File attachments (content or path) |
| `tags` | `{ name, value }[]` | No | Email tags for filtering |
| `scheduled_at` | `string` | No | ISO 8601 datetime to schedule send |

## Webhook Events

Configure webhooks in the Resend dashboard to receive delivery notifications:

| Event | Description |
|-------|-------------|
| `email.sent` | Email accepted by Resend |
| `email.delivered` | Email delivered to recipient's inbox |
| `email.delivery_delayed` | Delivery temporarily delayed |
| `email.complained` | Recipient marked as spam |
| `email.bounced` | Email bounced (hard bounce) |
| `email.opened` | Recipient opened the email |
| `email.clicked` | Recipient clicked a link |
| `email.failed` | Send failed (invalid recipient, quota, domain issue) |

Webhook payload structure:
```json
{
  "type": "email.delivered",
  "created_at": "2024-11-22T23:41:12.126Z",
  "data": {
    "email_id": "56761188-7520-42d8-8898-ff6fc54ce618",
    "from": "Acme <onboarding@resend.dev>",
    "to": ["delivered@resend.dev"],
    "subject": "Hello",
    "tags": { "category": "confirm_email" }
  }
}
```

## Gotchas

1. **Domain verification required** — You can only send from `onboarding@resend.dev` (testing) or a verified domain. Emails from unverified domains will fail silently or error.

2. **Batch limitations** — Max 100 emails per batch. `attachments` and `scheduled_at` are **not supported** in batch requests. If any single email in the batch is invalid, the **entire batch fails**.

3. **`from` format matters** — Must be `Name <email@domain.com>`. Just an email address may cause issues.

4. **Error shape** — All SDK methods return `{ data, error }`. Never throws — you must check `error` explicitly.

5. **API key prefix** — All Resend API keys start with `re_`. If the key doesn't start with this prefix, it's invalid.

6. **Rate limits apply per-key** — Check your plan's limits in the Resend dashboard. The `email.failed` webhook with `reason: "reached_daily_quota"` indicates you've hit your limit.

7. **No retry built-in** — The SDK does not automatically retry failed sends. Implement your own retry logic if needed.

8. **`to` accepts string or array** — But batch send always expects arrays for `to`.

## Rate Limits

Rate limits depend on your Resend plan:

| Plan | Daily Limit | Rate (per second) |
|------|-------------|-------------------|
| Free | 100 emails/day | 2/sec |
| Pro | 50,000 emails/month | 10/sec |
| Enterprise | Custom | Custom |

When limits are exceeded, sends fail with a quota error. Monitor via the `email.failed` webhook event.

## References

- [Official Docs](https://resend.com/docs)
- [Node.js Quickstart](https://resend.com/docs/send-with-nodejs)
- [API Reference](https://resend.com/docs/api-reference)
- [Templates](https://resend.com/docs/dashboard/templates/introduction)
- [Webhooks](https://resend.com/docs/webhooks)
- [Batch Sending](https://resend.com/docs/dashboard/emails/batch-sending)
- [npm: resend](https://www.npmjs.com/package/resend)
