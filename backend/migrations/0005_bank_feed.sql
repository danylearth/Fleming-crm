CREATE TABLE IF NOT EXISTS bank_feed_connections (
  id SERIAL PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'truelayer',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'connected', 'expired', 'error', 'revoked')),
  state_hash TEXT UNIQUE,
  refresh_token_encrypted TEXT,
  token_expires_at TIMESTAMP,
  provider_name TEXT,
  last_synced_at TIMESTAMP,
  last_error TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bank_feed_transactions (
  id SERIAL PRIMARY KEY,
  connection_id INTEGER NOT NULL REFERENCES bank_feed_connections(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  booked_at TIMESTAMP NOT NULL,
  description TEXT,
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'GBP',
  transaction_type TEXT,
  transaction_category TEXT,
  merchant_name TEXT,
  property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL,
  tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
  enquiry_id INTEGER REFERENCES tenant_enquiries(id) ON DELETE SET NULL,
  rent_payment_id INTEGER REFERENCES rent_payments(id) ON DELETE SET NULL,
  expense_id INTEGER REFERENCES property_expenses(id) ON DELETE SET NULL,
  match_status TEXT NOT NULL DEFAULT 'unmatched' CHECK(match_status IN ('unmatched', 'matched_rent', 'matched_deposit', 'matched_expense', 'ignored')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(external_id)
);

CREATE INDEX IF NOT EXISTS idx_bank_feed_transactions_booked_at ON bank_feed_transactions(booked_at DESC);
CREATE INDEX IF NOT EXISTS idx_bank_feed_transactions_match_status ON bank_feed_transactions(match_status);
