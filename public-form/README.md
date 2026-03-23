# Fleming Lettings - Tenant Enquiry Form

This is a standalone tenant enquiry form that can be hosted on a separate domain and integrated with the Fleming CRM system.

## Features

- **Responsive Design**: Works perfectly on mobile, tablet, and desktop
- **Match CRM Theme**: Uses Fleming's navy/gold color scheme
- **Property Integration**: Fetches available properties from CRM API
- **Joint Applications**: Support for sole and joint tenant applications
- **Comprehensive Fields**: Captures all necessary tenant information
- **No Budget Slider**: As per requirements, pricing fields have been excluded
- **Direct CRM Integration**: Submissions go directly to the CRM tenant enquiries module

## Fields Captured

### Primary Applicant
- Personal Details: Name, DOB, Email, Phone, Nationality
- Address: Current address, postcode, years at address
- Employment: Status, industry, job title, salary, contract type

### Joint Applicant (conditional)
- Same fields as primary applicant
- Only shown when "Joint Application" is selected

### Property Requirements
- Interested property (optional dropdown from CRM)
- Type of tenancy (long-term/short-term/interim)
- Reason for renting
- Property type preference
- Number of bedrooms required
- Parking requirements
- Preferred locations (multi-select)

### Legal
- Terms & Conditions acceptance
- Privacy Policy consent
- Marketing opt-in (optional)

## Deployment Options

### Option 1: Static File Hosting
Upload `tenant-enquiry.html` to any static hosting service:
- **Vercel**: `vercel deploy`
- **Netlify**: Drag and drop in dashboard
- **GitHub Pages**: Commit to repo and enable Pages
- **Any Web Server**: Upload via FTP

### Option 2: Subdomain on Main Site
1. Create subdomain: `enquiry.fleminglettings.co.uk`
2. Upload `tenant-enquiry.html` as `index.html`
3. Configure SSL certificate

### Option 3: Direct Link from Main Site
Add a button/link on your main website:
```html
<a href="https://yourdomain.com/tenant-enquiry.html" class="btn">
    Register Your Interest
</a>
```

## API Configuration

The form currently points to the production CRM API:
```javascript
const API_URL = 'https://fleming-crm-api-production-7e58.up.railway.app';
```

### API Endpoints Used
- `GET /api/public/properties` - Fetches available properties
- `POST /api/public/tenant-enquiries` - Submits new enquiry

These are **public endpoints** (no authentication required) specifically created for the external form.

## Testing Locally

1. Open `tenant-enquiry.html` in a browser
2. Fill out the form
3. Submit and check the CRM's Tenant Enquiries module

Or use a local server:
```bash
# Python
python3 -m http.server 8000

# Node.js (http-server)
npx http-server -p 8000

# Then visit: http://localhost:8000/tenant-enquiry.html
```

## CORS Configuration

The backend has CORS enabled to accept requests from any origin. If you want to restrict to specific domains:

In `backend/src/index-pg.ts`:
```javascript
app.use(cors({
  origin: ['https://fleminglettings.co.uk', 'https://enquiry.fleminglettings.co.uk']
}));
```

## How Data Flows to CRM

1. User fills out form on external site
2. Form submits to `/api/public/tenant-enquiries`
3. Backend creates new record in `tenant_enquiries` table
4. Enquiry appears in CRM with status "new"
5. Staff can view, manage, and progress the enquiry through the workflow

## Customization

### Change API URL
Edit line 922 in `tenant-enquiry.html`:
```javascript
const API_URL = 'https://your-api-url.com';
```

### Modify Styling
All CSS is in the `<style>` block (lines 7-439). Key variables:
```css
:root {
    --navy: #1a2332;
    --gold: #d4af37;
    --orange: #f59e0b;
}
```

### Add/Remove Fields
The form uses standard HTML inputs. To add a field:
1. Add HTML input in the form
2. Ensure the `name` attribute matches database column
3. Backend will automatically handle it

## Security Notes

- Form uses HTTPS (ensure your hosting supports SSL)
- No sensitive data is stored in browser
- All submissions validated server-side
- Public endpoints are rate-limited (if configured)
- Personal data handled per GDPR/Privacy Policy

## Support

For issues or questions:
1. Check browser console for errors
2. Verify API_URL is correct
3. Ensure backend is running
4. Check CORS settings if cross-origin errors

## Next Steps

1. Upload file to your hosting
2. Test submission end-to-end
3. Verify data appears in CRM
4. Add link/button from main website
5. Monitor submissions in CRM dashboard
