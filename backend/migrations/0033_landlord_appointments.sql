CREATE TABLE landlord_appointments (
 id SERIAL PRIMARY KEY,
 enquiry_id INTEGER NOT NULL REFERENCES landlords_bdm(id),
 request_id UUID NOT NULL UNIQUE,
 kind TEXT NOT NULL CHECK(kind IN ('meeting','follow_up')),
 appointment_date DATE NOT NULL,
 appointment_time TIME,
 location TEXT,
 assigned_to INTEGER REFERENCES users(id),
 created_by INTEGER NOT NULL REFERENCES users(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 delivery JSONB NOT NULL DEFAULT '{"pending":true}'
);
