# EPC connection setup for Fleming Lettings

The CRM now uses the replacement government domestic EPC API. Automatic lookup remains unavailable until Fleming creates an account and supplies its access token. Existing certificates can still be uploaded and dates entered manually.

1. Open [Get energy performance of buildings data](https://get-energy-performance-data.communities.gov.uk/) and choose the sign-in option.
2. Sign in or create a GOV.UK One Login for the person who will manage Fleming’s access. Complete the service’s registration and terms.
3. Open **My Account** and obtain the API bearer token. Follow the service’s [API guidance](https://get-energy-performance-data.communities.gov.uk/guidance/energy-certificate-data-apis).
4. Have the CRM administrator save that token as **EPC_API_TOKEN** in the **fleming-crm-api** Fly application’s secrets. Keep it out of source code and screenshots. The legacy EPC email/password credentials are not used by the new integration.
5. In the CRM, open a property, select **Edit → Sync EPC Data**, check that its address matches, then save. Verify the grade and expiry against the certificate. Upload the certificate PDF in Documents; a lookup alone does not supply the compliance document.

New property creation attempts the lookup automatically when the token is configured. Missing credentials or unmatched addresses produce a clear message without preventing property creation. The CRM does not select a neighbouring property’s certificate merely because it shares a postcode.

Technical reference: [Making an API request](https://get-energy-performance-data.communities.gov.uk/api-technical-documentation/making-a-request). The server uses `Authorization: Bearer …` with the domestic search endpoint. Check the government account for any token renewal requirements.
