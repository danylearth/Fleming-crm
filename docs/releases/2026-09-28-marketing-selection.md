# Marketing selection highlight — 28 September 2026

Published frontend dpl_HEDCe5FTnVu78ZLCiXNuhfkF7xTk to https://crm.fleminglettings.co.uk.

Selected Marketing contact rows now use white in light mode and grey (#444) in dark mode, plus an inset purple left edge and semibold contact name. The existing selected state drives both the checkbox and aria-selected row styling, so single selection, bulk selection, deselection and Clear All stay aligned. Selection and sending behavior are unchanged.

Changed: frontend/src/pages/Marketing.tsx and Marketing.css. Production frontend build passed. Live index-BV3RbcQV.js and Marketing-ywqhRf0i.css verified. Scoped frontend snapshot: tmp/release-2026-09-28-marketing-selection/crm. Backend unchanged from crm28-email-auth-dd2b5df817.
