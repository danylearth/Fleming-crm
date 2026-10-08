# 2 October CRM chat and team presentation

Production https://crm.fleminglettings.co.uk — dpl_8FmBqNon4RGC57aN7F5BcxLC2hsu, snapshot tmp/chat-team-review-release.

- Team View collapsed by default, matching Team Activity; internal team disclosures and editing preserved.
- Inbox wallpaper removed; conversation wallpaper retained. Message text inherits account font.
- Live/WhatsApp filters: Open, Closed, Assigned, Unassigned, plus existing All/Unread/Favourites. Rows show status and assigned colleague. Assignment control has a separate labelled area and Assign to Me action.
- Expired WhatsApp service window now shows an explanation before composition instead of a failed send. Draft remains in component state; inbound messages restore ordinary composition.
- Earlier landlord colour grouping and duplicate-postcode banner fix retained and verified in live assets.

Only Layout JS/CSS and Users JS differed from the preceding property-banner production snapshot after asset-name normalization. Frontend build passed; fictional browser checks passed for collapse/open, filters, actual mocked assignment update, selected font inheritance, wallpaper placement and 390px layout. Live entry and affected assets match release exactly: tmp/chat-team-final-live-verification.json.

Read-only Twilio diagnostic found zero content templates. The expired conversation in the user's screenshot cannot send free-form text outside the 24-hour customer service window. Contact must message again, or an approved template must be configured and a template-send path integrated. No workaround removes this provider restriction; no test messages were sent. Source: https://www.twilio.com/docs/whatsapp/quickstart . Backend unchanged by this release.
