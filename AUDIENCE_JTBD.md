# Audience & Jobs to Be Done

## Target Audience
Property management staff at Fleming Lettings — a small lettings agency managing landlords, tenants, properties, compliance, and maintenance. Primary users are the accounts team and lettings support staff who process tenant applications, manage landlord relationships, and track compliance deadlines daily.

## Primary Job to Be Done
When I'm **managing tenant applications and property compliance**, I want to **process enquiries through a clear pipeline with automated emails, application forms, and document tracking**, so I can **onboard tenants quickly without manual follow-up or data re-entry**.

## Activity Map
Receive enquiry → Book viewing → Send application email → Track application form completion → Collect holding deposit → Verify KYC/documents → Convert to tenant → Link to property → Monitor compliance → Track rent payments → Handle maintenance

## Current Release Scope
Release: **Production UAT Sprint**
Activities: Fix client-reported bugs, implement feedback from April 1st session (SMS module, activity timeline, email templates, application form improvements, onboarding tracking), delete V1/V2 dead code, rename V3 pages, systematic audit of all V3 pages + backend API endpoints.

## SLC Criteria (Simple, Lovable, Complete)
- **Simple:** Focused on fixing what exists and implementing specific client feedback — no new modules or architectural changes
- **Lovable:** Staff can process tenant applications end-to-end with proper email templates, SMS tracking, and activity timelines instead of manual workarounds
- **Complete:** Every existing module works correctly with full CRUD, conversion workflows function, and the tenant application form works on mobile/tablet with all required fields and declarations
