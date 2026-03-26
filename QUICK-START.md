# 🚀 Quick Start - Deploy Landlord Form to Subdomain

## ⚡ 2-Minute Setup

### Step 1: Deploy Backend (REQUIRED FIRST)
```bash
git add backend/src/index.ts backend/src/index-pg.ts
git commit -m "feat: add landlord enquiry endpoint"
git push origin main
```
✅ Railway auto-deploys → wait 3-5 minutes

### Step 2: Prepare Deployment
```bash
./deploy-landlord-subdomain.sh
```
✅ Creates `landlords-subdomain/` directory

### Step 3: Deploy to Vercel (Recommended)
```bash
cd landlords-subdomain
vercel --prod
```
✅ Follow prompts, then add custom domain: `landlords.fleminglettings.co.uk`

### Step 4: Configure DNS
Add CNAME record in your DNS provider:
```
Type:  CNAME
Name:  landlords
Value: cname.vercel-dns.com (or value from Vercel)
```
✅ Wait 5-30 minutes for DNS propagation

### Step 5: Test
```bash
# Visit subdomain
open https://landlords.fleminglettings.co.uk

# Or test API directly
curl -X POST https://fleming-crm-api-production-7e58.up.railway.app/api/public/landlord-enquiries \
  -H "Content-Type: application/json" \
  -d '{"registration_type":"Sole","firstName":"Test","surname":"User","email":"test@example.com","phone":"07700900000","address":"123 Test","postcode":"TE1 2ST","propertyAddress":"456 Prop","propertyPostcode":"PR1 2OP","bedrooms":"3","ownershipStructure":"Mortgaged","propertyCondition":"Good","yearsAtAddress":"5","dob":"1980-01-01","nationality":"British","offroadParking":"Yes","alreadyLet":"No","mortgageAttached":"Yes","lookingForNewTenant":"No","epcCertificate":"Yes","eicrCertificate":"Yes","gasCertificate":"Yes"}'
```

## ✅ Success Checklist
- [ ] Backend deployed to Railway
- [ ] Form deployed to hosting platform
- [ ] DNS CNAME record added
- [ ] Form loads at subdomain
- [ ] Test submission works
- [ ] Enquiry appears in CRM BDM module

## 📚 Full Documentation
- **LANDLORD-FORM-SUMMARY.md** - Complete overview
- **LANDLORD-FORM-DEPLOYMENT.md** - Detailed hosting guide
- **DEPLOY-BACKEND-UPDATE.md** - Backend deployment

## 🆘 Troubleshooting
| Issue | Solution |
|-------|----------|
| Form doesn't load | Wait 30 min for DNS, check `dig landlords.fleminglettings.co.uk` |
| Submission fails | Check browser console, verify backend deployed |
| 404 on API | Backend not deployed yet, run Step 1 |
| Duplicate error | Expected behavior, wait 24h or use different email |

## 📞 Need Help?
Check Railway logs: `railway logs --follow`
Check browser console: Press F12

---

**Target URL:** https://landlords.fleminglettings.co.uk
**API Endpoint:** https://fleming-crm-api-production-7e58.up.railway.app/api/public/landlord-enquiries
**CRM Module:** https://fleming-portal.vercel.app/v3/bdm

🎉 You're ready to go live!
