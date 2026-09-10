# Resend setup for Fleming CRM

Verified live on 9 September 2026: the CRM sends from `contact@tenancies.fleminglettings.co.uk`; its existing sending key remains configured. The Fleming webhook signing secret is now applied on Fly. A controlled email to the accounts inbox was delivered, both sent/delivered events returned HTTP 200, and the CRM recorded `delivered`. The steps below are a maintenance runbook, not outstanding setup.

1. Open [Resend → Webhooks](https://resend.com/webhooks). Edit an existing Fleming CRM endpoint if present; otherwise choose **Add Webhook**.
2. Set the endpoint to `https://fleming-crm-api.fly.dev/api/email/webhook`. Select `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained`, `email.opened`, `email.clicked` and `email.failed`. Save it. [Resend webhook instructions](https://resend.com/docs/webhooks/introduction).
3. Copy that endpoint’s **Signing Secret**, beginning `whsec_`. This is different from the API key beginning `re_`.
4. Open [Fly → fleming-crm-api → Secrets](https://fly.io/apps/fleming-crm-api/secrets). Add/update `RESEND_WEBHOOK_SECRET` with the complete signing secret and apply/deploy the secret change. Keep `RESEND_API_KEY` unchanged. Wait for the API machine to be healthy. Secrets must be applied to the running machine, not only staged. [Fly secret deployment](https://fly.io/docs/apps/secrets/).
5. In [Resend → Domains](https://resend.com/domains), ensure the sending domain is verified. Delivery tracking works without open/click tracking. For open/click metrics, open the domain’s **Configuration → Enable tracking metrics → Configure**. Follow the displayed tracking-subdomain/DNS instructions and verify the supplied records. [Tracking configuration](https://resend.com/docs/dashboard/domains/tracking).
6. Send one CRM email to an inbox you control. In Resend, open its webhook event: delivery to the CRM should show **HTTP 200**. Refresh the CRM record’s Communications panel and check **Delivered**. If tracking is enabled, open the email/click a link and check for the corresponding events. Opens are an indicator, not proof a person read the message.
7. Replay failed historical events from the Resend webhook dashboard to restore missed delivery updates. Already-sent emails keep their original HTML; newly sent emails use the corrected templates.

If it fails:

- **503**: the signing secret has not reached the running API machine.
- **403**: confirm the full signing secret belongs to this exact endpoint. Replay the event from Resend rather than reposting an old signed request.
- **200 but no CRM change**: check that the event’s email ID belongs to a message sent and logged by this CRM.
- **Sending itself fails**: check the sending domain’s verification, the existing key’s sending permission and the failed message in Resend Logs. Webhook configuration does not repair an invalid sending key or unverified sender.

No API key or signing secret belongs in chat, source control or the frontend/Vercel environment.
