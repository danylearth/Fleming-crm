import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const apiSource = fs.readFileSync(path.resolve(__dirname, 'index-pg.ts'), 'utf8');

describe('31 August CRM feedback regressions', () => {
  it('casts reviewer IDs as integers in document and application reviews', () => {
    expect(apiSource).toContain("reviewed_by = CASE WHEN $1 = 'pending' THEN NULL ELSE $3::INTEGER END");
    expect(apiSource).toContain("application_reviewed_by = CASE WHEN $1 = 'approved' THEN $3::INTEGER ELSE NULL END");
  });

  it('stores a generated completed application PDF in enquiry documents', () => {
    expect(apiSource).toContain("doc_type = 'Completed Tenancy Application'");
    expect(apiSource).toContain("'application/pdf'");
    expect(apiSource).toContain('generateCompletedApplicationPdf');
  });

  it('supports viewings without a linked property when a custom location is provided', () => {
    expect(apiSource).toContain("if (!property_id && !customLocation)");
    expect(apiSource).toContain('viewing_location');
  });
});
