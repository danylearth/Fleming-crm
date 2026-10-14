# Required document indicators and review guidance

Approved presentation: red “Mandatory to continue” pill while a required upload is missing. Successful saved uploads remove the pill; removing the last file restores it. Optional categories, office overrides and conditional income exemptions retain their existing rules.

Applied to tenant and guarantor public applications, CRM enquiry document slots/uploads, missing evidence in application reviews and the shared credit-report upload. Existing multi-file upload and per-file review controls are preserved. Removing a file from a CRM category now reloads remaining documents before deciding whether the category is empty.

Tenant and guarantor application reviews have a purple “Click to View Acceptable Documents” button beside Supporting Documents. Its accessible, scrollable dialog reuses the established public-form guidance, with optional employment-reference guidance for guarantors.

## Verification

- Frontend production build and public guarantor JavaScript syntax check passed.
- Eight existing tenant application regression tests passed.
- Browser checks passed at 390, 820 and 1440 pixels for tenant and guarantor applications and CRM document slots: failed uploads, successful uploads, multiple files, removal of one file and removal of the last file.
- Tenant checks covered office overrides and conditional employment requirements.
- Review guidance opened, displayed the existing category advice, and closed with Escape and its close button at all three widths. No dialog overflow or page errors.
- Browser checks used mocked APIs and fictional records. No live application was signed, submitted, approved or progressed.

Production deployment and live source checks are recorded in the task's release results.
