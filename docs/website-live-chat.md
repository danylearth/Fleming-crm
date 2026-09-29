# Fleming website live chat

Add this once, immediately before the website’s closing `</body>` tag:

```html
<script defer src="https://crm.fleminglettings.co.uk/fleming-live-chat.js"
  data-api="https://fleming-crm-api.fly.dev"></script>
```

Allowed website origins are HTTPS on fleminglettings.co.uk and its subdomains. The website developer should include the CRM script origin and API connection origin in the site's Content Security Policy if it has one.

Visitors enter their name, email and message. Online support means an active CRM staff session has checked in within 75 seconds. Visible CRM tabs check in every 30 seconds. New conversations are assigned to an online staff member with the fewest open website conversations; offline messages remain unassigned for the team to pick up. Support staff can assign, close, reopen and link a chat to an existing CRM record. The Activity log then provides the complete saved transcript.

Website account sign-in does not exist yet. Entering an email address is not proof of identity, so staff must verify the person before linking a record or sharing private information. A later tenant/landlord portal should use server-verified identity; do not pass a trusted tenant ID in public JavaScript.

Visitor sessions use a random token held in session storage, sent in a request header rather than a URL. Staff files are private downloads, restricted to the conversation's participants. Visitors can send text and download files shared with their conversation. Team Chat supports PDF, Office files, images, CSV and text (15 MB per file, five files per message). Chat is protected by authenticated access and HTTPS; it is not end-to-end encrypted.

## WhatsApp connection

The CRM uses the existing Twilio outbound number **+44 7863 747811**. No number purchase or alternative sandbox number is needed. Once Twilio/Meta approves that number, set its inbound message webhook to:

`https://fleming-crm-api.fly.dev/api/public/chat/whatsapp/inbound` (POST)

The CRM supplies this status callback for outbound replies:

`https://fleming-crm-api.fly.dev/api/public/chat/whatsapp/status` (POST)

Both callbacks verify Twilio signatures with the account credentials already configured on the API. Keep BASE_URL set to the public API origin. The inbox checks the registered sender status automatically (cached for one minute). It is ready for incoming conversations and text replies within WhatsApp’s 24-hour customer-service window. Outside that window it requires an approved WhatsApp template; template initiation and WhatsApp media attachments are not part of this first release. Twilio/Meta approval and webhook setup remain external connection steps. No WhatsApp test messages have been sent to real contacts.

## Office chat

Users can privately message colleagues or open the chat for their department/office as configured under Team. Current department membership controls office chat access. Direct messages are visible only to their two members, including when another user is an administrator. The house button opens Flemo AI, Team Chat, Live Chat and WhatsApp; unread badges and optional sounds alert staff to replies.

## Groups and inbox controls

Use New group to choose a name and invite active colleagues. Group history is limited to members. Direct-chat titles show the other participant, not your own name. The Office / department selector uses the existing Team department list; administrators/managers can select any configured department, while staff use their assigned department. Office membership changes are reflected in access checks.

Delete chat hides it and clears its existing messages from your view only. The other participants' copies and saved customer transcripts remain available. New messages bring the conversation back. Minimise keeps a section icon above the house button; switching between those icons restores the selected chat and draft. Closing a section removes its shortcut.
