# Audience & Jobs to Be Done

## Target Audience
Solo developer / small team maintaining Fleming CRM — a lettings management platform for property management companies. Deploying from macOS to Railway (backend) and Vercel (frontend).

## Primary Job to Be Done
When I'm preparing the platform for production use after deployment fixes, I want every CRUD operation, pipeline flow, and UI interaction to work correctly, so I can confidently onboard users without firefighting regressions.

## Activity Map
verify build → test each entity's API endpoints → test each frontend page → fix broken flows → re-verify build → deploy

## Current Release Scope
Release: "Full Platform UAT & Bug Fix"
Activities: test each entity's API endpoints → test each frontend page → fix broken flows → re-verify build

## SLC Criteria (Simple, Lovable, Complete)
- **Simple:** No new features — purely fixing what the deployment changes broke across existing CRUD and pipeline flows
- **Lovable:** Every button, form, and status change works as expected — no dead clicks or silent failures
- **Complete:** All 13 entity areas tested and working: properties, landlords, BDM, tenants, enquiries, maintenance, tasks, payments, documents, dashboard, users, public API, and kanban boards
