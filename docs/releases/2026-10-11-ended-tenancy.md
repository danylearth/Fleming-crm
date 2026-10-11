# Ended tenancy presentation — 11 October 2026

Frontend deployment: `dpl_FNHxhGt9Rg8SduqeeNk3FmUoMbjs`.

Inactive tenancy duration badges now use red border, background and text. Active badges retain green. The elapsed end-date message reads “Tenancy has ended”. No duration calculation or tenancy status is changed.

Built from the previous live release with only TenantDetail presentation changed. Build and mocked browser checks passed for active/inactive badges and the exact ended wording. Earlier Tenants refresh-loop and login-alignment fixes are retained.

Separately, the user confirmed no rent was due on the checkout date for the identified joint tenancy. The single incorrect £800 opening-balance entry dated 20 September 2026 was removed after checking both records were inactive with that end date and that the charge had no bank allocation, issued document, external invoice reference or chaser history. The full original row and user-requested reason were preserved in the production audit log. Eleven earlier charges remain unchanged; the last due date is 20 August 2026. No bank transactions were changed.
