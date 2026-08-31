import { describe, expect, it } from 'vitest';
import { viewingEmailPreview, viewingSmsPreview } from './viewingMessages';

describe('viewing communication previews', () => {
  it('shows a custom location, date, and time in the SMS preview', () => {
    const preview = viewingSmsPreview('Derek', 'Fleming Lettings office', '2026-09-01', '10:30');
    expect(preview).toContain('Fleming Lettings office');
    expect(preview).toContain('01/09/2026 at 10:30');
  });

  it('shows the same booking details in the email preview', () => {
    const preview = viewingEmailPreview('Derek Guest', '10 High Street', '2026-09-01', '10:30');
    expect(preview).toContain('Subject: Your viewing with Fleming Lettings at 10 High Street');
    expect(preview).toContain('01/09/2026 at 10:30');
  });
});
