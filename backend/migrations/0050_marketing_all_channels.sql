ALTER TABLE marketing_permissions DROP CONSTRAINT IF EXISTS marketing_permissions_channel_check;
ALTER TABLE marketing_permissions ADD CONSTRAINT marketing_permissions_channel_check CHECK(channel IN ('email','sms','phone','post'));
