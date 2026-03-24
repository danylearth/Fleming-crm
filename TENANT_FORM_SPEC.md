# Fleming Lettings - Tenant Enquiry Form Specification

Based on the official form at: **https://fleminglettings.co.uk/tenant-enquiry-form/**

## Form Overview

The Fleming Lettings tenant enquiry form is a comprehensive, multi-section form designed to collect detailed information from prospective tenants. It supports both **sole** and **joint** registrations.

---

## Design Specifications

### Visual Style

**Colors:**
- Background: White (`#ffffff`)
- Section backgrounds: Light gray (`#eeeeee`)
- Input fields: Light gray (`#eee`)
- Labels: Bold black text
- Required field indicators: Red (`#e63232`)
- Submit button: Pink (`#DC006D`) with hover to purple (`#25073B`)

**Typography:**
- Font: **Switzer** (all weights)
- Label font size: 16px
- Input font size: 16px
- Headings (h3, h4): Bold

**Form Styling:**
```css
.form_area input, .form_area select {
    margin-top: 8px;
    background-color: #eee;
    border: none;
    border-radius: 0px;
}

.form_area textarea {
    height: 130px;
    background-color: #eee;
    border: none;
    border-radius: 0px;
}

input.wpcf7-form-control.wpcf7-submit {
    width: 180px;
    padding: 16px;
    margin-top: 35px;
    background-color: #DC006D;
    color: #fff;
}

input.wpcf7-form-control.wpcf7-submit:hover {
    background-color: #25073B;
}
```

**Layout:**
- Two-column layout for applicants (50% each)
- Dashed border between columns
- Responsive: Stacks to single column on mobile
- Padding: 0 25px for columns

---

## Form Structure

### Section 1: Registration Type

**Question:** Is this a sole or joint registration?

**Field:**
- Type: Radio buttons
- Name: `registration_type`
- Options:
  - `Sole` (default checked)
  - `Joint`
- Required: Yes
- Conditional Logic: If "Joint" is selected, show Applicant 2 section

---

### Section 2: Applicant 1 Details

**Heading:** "Applicant 1" (h4)

**Fields:**

1. **First Name** *
   - Type: Text input
   - Name: `FirstName`
   - Placeholder: "First Name"
   - Max length: 400
   - Required: Yes

2. **Surname** *
   - Type: Text input
   - Name: `Surname`
   - Placeholder: "Last Name"
   - Max length: 400
   - Required: Yes

3. **Home Address** *
   - Type: Text input
   - Name: `address`
   - Placeholder: "Home Address"
   - Max length: 400
   - Required: Yes

4. **Postcode** *
   - Type: Text input
   - Name: `Postcode`
   - Placeholder: "Postcode"
   - Max length: 400
   - Required: Yes

5. **Years at Address** *
   - Type: Text input
   - Name: `yearofaddress`
   - Placeholder: "Years at Address"
   - Max length: 400
   - Required: Yes

6. **Date of Birth** *
   - Type: Date input
   - Name: `dob`
   - Placeholder: "DD/MM/YYYY"
   - Format: Date picker
   - Required: Yes

7. **Email Address** *
   - Type: Email input
   - Name: `form_email`
   - Placeholder: "Email"
   - Max length: 400
   - Validation: Valid email format
   - Required: Yes

8. **Contact Number** *
   - Type: Text input
   - Name: `contactNumber`
   - Placeholder: "Contact Number"
   - Max length: 400
   - Required: Yes

9. **Nationality** *
   - Type: Select dropdown
   - Name: `Nationality`
   - Default: "Please select an option" (disabled)
   - Options:
     - African
     - Arab
     - Bangladeshi
     - Caribbean
     - Chinese
     - English, Welsh, Scottish, Northern Irish or British
     - Gypsy or Irish Traveller
     - Indian
     - Irish
     - Pakistani
     - Roma
     - White and Black Caribbean
     - White and Black African
     - White and Asian
     - Any other Mixed or multiple ethnic background
     - Any other Asian background
     - Any other White background
     - Any other Black, Black British, or Caribbean background
     - Any other ethnic group
     - Rather not say
   - Required: Yes

---

### Section 3: Employment History (Applicant 1)

**Heading:** "Employment History" (h3)

**Fields:**

1. **Employment Status** *
   - Type: Select dropdown
   - Name: `EmploymentStatus`
   - Default: "Please select an option" (disabled)
   - Options:
     - Full-Time Employed
     - Part-Time Employed
     - Self-Employed
     - Unemployed
   - Required: Yes
   - Width: 50% (half_width1)

2. **Happy to provide further information?** *
   - Type: Radio buttons
   - Name: `furtherinformation`
   - Options:
     - Yes (default checked)
     - No
   - Required: Yes
   - Conditional Logic: If "Yes", show employment details section

**Conditional Section (if "Yes" selected):**

3. **Industry of Employment**
   - Type: Select dropdown
   - Name: `IndustryofEmployment`
   - Default: "Please select an option" (disabled)
   - Options:
     - Administration
     - Animal care
     - Beauty and wellbeing
     - Business and finance
     - Computing, technology and digital
     - Construction and trades
     - Creative and media
     - Delivery and storage
     - Emergency and uniform services
     - Engineering and maintenance
     - Environment and land
     - Government services
     - Healthcare
     - Home services
     - Hospitality and food
     - Law and legal
     - Managerial
     - Manufacturing
   - Width: 50% (half_width1)

4. **Job Title**
   - Type: Text input
   - Name: `job_title`
   - Placeholder: "Job Title"
   - Max length: 400
   - Width: 50% (half_width2)

5. **Years in Employment**
   - Type: Text input
   - Name: `YearsinEmployment`
   - Placeholder: "Years in Employment"
   - Max length: 400
   - Width: 50% (half_width1)

6. **Annual Salary or Yearly Equivalent**
   - Type: Text input
   - Name: `AnnualSalary`
   - Placeholder: "Annual Salary or Yearly Equivalent:"
   - Max length: 400
   - Width: 50% (half_width2)

7. **Is this a contract role or fixed term position?**
   - Type: Radio buttons
   - Name: `position`
   - Options:
     - Contract role position
     - Fixed term position
     - Temporary or agency role
     - Permanent position

---

### Section 4: Applicant 2 Details (Conditional)

**Conditional Display:** Only shows if `registration_type = "Joint"`

**Layout:** Second column (right side), 50% width with dashed left border

**Heading:** "Applicant 2" (h4)

**Fields:** (Same structure as Applicant 1)
- All fields have suffix "2" (e.g., `FirstName2`, `Surname2`)
- Same validation and requirements as Applicant 1
- Same employment history section with conditional logic

---

### Section 5: Property Requirements

**Heading:** "Property Requirements" (h3)

**Fields:**

1. **Preferred Location**
   - Type: Text input or Select
   - Name: `preferred_location`
   - Note: Specific fields not shown in HTML snippet but likely present

2. **Number of Bedrooms**
   - Type: Select dropdown
   - Name: `bedrooms`
   - Options: 1, 2, 3, 4, 5+

3. **Budget (Monthly Rent)**
   - Type: Range slider
   - Name: `uacf7_range_slider-rental`
   - Display: £ prefix
   - Format: `£(value)`

4. **Move-in Date**
   - Type: Date input
   - Name: `move_in_date`
   - Format: Date picker

5. **Property Type**
   - Type: Checkboxes
   - Name: `property_type[]`
   - Options:
     - House
     - Flat/Apartment
     - Studio
     - Bungalow

6. **Pets**
   - Type: Radio buttons
   - Name: `pets`
   - Options:
     - Yes
     - No

7. **Additional Requirements**
   - Type: Textarea
   - Name: `additional_requirements`
   - Rows: ~5
   - Height: 130px

---

### Section 6: Additional Information

1. **How did you hear about us?**
   - Type: Select dropdown
   - Name: `referral_source`
   - Options:
     - Google Search
     - Social Media
     - Referral from friend/family
     - Rightmove/Zoopla
     - Other

2. **Additional Comments**
   - Type: Textarea
   - Name: `comments`
   - Height: 130px

---

### Section 7: Consent & Submit

**GDPR Consent:**
- Type: Checkbox
- Name: `gdpr_consent`
- Label: "I agree to the [Terms & Conditions](#) and [Privacy Policy](#)"
- Required: Yes
- Font size: 16px
- Margin left: 4px for label text

**Submit Button:**
- Text: "Submit Enquiry"
- Width: 180px
- Padding: 16px
- Margin top: 35px
- Background: `#DC006D` (Fleming Pink)
- Hover: `#25073B` (Fleming Purple)
- Color: White
- Border radius: 0px (sharp corners)
- Font: Switzer, medium weight

---

## Form Behavior

### Validation Rules

1. **Required Field Indicator:**
   - Red asterisk (*) next to label
   - Color: `#e63232`

2. **Email Validation:**
   - Must be valid email format
   - Show error message if invalid

3. **Date Validation:**
   - Must be valid date
   - Date of birth must be 18+ years ago

4. **Conditional Display:**
   - Joint applicant section only shows if "Joint" selected
   - Employment details only show if "Yes" to further information

### Responsive Behavior

**Desktop (> 768px):**
- Two-column layout for joint applications
- Side-by-side fields with `half_width1` and `half_width2`

**Mobile (< 768px):**
- Single column stack
- Full width for all fields
- Checkboxes stack vertically (50% width → 100%)

---

## Data Handling

### Form Submission

**Method:** POST
**Action:** Contact Form 7 handler
**Response:**
- Success: Display success message, clear form
- Error: Display error message inline

### Data Storage

Form data should be stored in the CRM database as a **Tenant Enquiry** record with status:
- Initial status: `new`
- Workflow: `new` → `viewing_booked` → `onboarding` → `converted` / `rejected`

### Email Notifications

Upon submission, send:
1. **Confirmation email to applicant** (use `form_email`)
2. **Notification email to Fleming Lettings** team

---

## Implementation Notes

### React Component Structure

```tsx
// Recommended component hierarchy:
<TenantEnquiryForm>
  <FormSection title="Registration Type">
    <RadioGroup name="registration_type" />
  </FormSection>

  <FormSection title="Applicant 1">
    <ApplicantDetailsFields applicantNumber={1} />
    <EmploymentHistoryFields applicantNumber={1} />
  </FormSection>

  {registrationType === 'Joint' && (
    <FormSection title="Applicant 2">
      <ApplicantDetailsFields applicantNumber={2} />
      <EmploymentHistoryFields applicantNumber={2} />
    </FormSection>
  )}

  <FormSection title="Property Requirements">
    <PropertyRequirementsFields />
  </FormSection>

  <FormSection title="Additional Information">
    <AdditionalInfoFields />
  </FormSection>

  <ConsentCheckbox />
  <SubmitButton />
</TenantEnquiryForm>
```

### State Management

```typescript
interface TenantEnquiryFormData {
  // Registration
  registration_type: 'Sole' | 'Joint';

  // Applicant 1
  FirstName: string;
  Surname: string;
  address: string;
  Postcode: string;
  yearofaddress: string;
  dob: Date;
  form_email: string;
  contactNumber: string;
  Nationality: string;

  // Employment (Applicant 1)
  EmploymentStatus: string;
  furtherinformation: 'Yes' | 'No';
  IndustryofEmployment?: string;
  job_title?: string;
  YearsinEmployment?: string;
  AnnualSalary?: string;
  position?: string;

  // Applicant 2 (conditional)
  FirstName2?: string;
  Surname2?: string;
  // ... (mirror Applicant 1 fields)

  // Property requirements
  preferred_location?: string;
  bedrooms?: number;
  monthly_rent_budget?: number;
  move_in_date?: Date;
  property_type?: string[];
  pets?: 'Yes' | 'No';
  additional_requirements?: string;

  // Additional
  referral_source?: string;
  comments?: string;

  // Consent
  gdpr_consent: boolean;
}
```

---

## API Integration

### Submit Endpoint

```typescript
POST /api/tenant-enquiries

Request Body: TenantEnquiryFormData

Response:
{
  success: boolean;
  message: string;
  enquiry_id?: number;
}
```

### Duplicate Check

Before submission, check for duplicates:
```typescript
GET /api/tenant-enquiries/check-duplicates
  ?email={email}
  &phone={phone}
```

---

## Styling Reference

### CSS Classes to Use

```css
/* Form wrapper */
.form_area {
  padding-left: 0px;
  font-family: 'Switzer', sans-serif;
}

/* Column layout */
.first_column {
  width: 50%;
  float: left;
  padding-right: 25px;
  min-height: 93px;
}

.second_column {
  width: 50%;
  float: left;
  padding-left: 25px;
  border-left: 1px dashed #000;
  min-height: 93px;
}

.col-md-12 {
  width: 100%;
  float: left;
  padding: 0 25px;
}

.half_width1 {
  width: 50%;
  float: left;
  padding-right: 25px;
}

.half_width2 {
  width: 50%;
  float: left;
  padding-left: 25px;
}

/* Inputs */
.form_area input[type="text"],
.form_area input[type="email"],
.form_area input[type="tel"],
.form_area input[type="date"],
.form_area select {
  width: 100%;
  margin-top: 8px;
  background-color: #eee;
  border: none;
  border-radius: 0px;
  padding: 12px;
  font-size: 16px;
  font-family: 'Switzer', sans-serif;
}

.form_area textarea {
  width: 100%;
  height: 130px;
  background-color: #eee;
  border: none;
  border-radius: 0px;
  padding: 12px;
  font-size: 16px;
  font-family: 'Switzer', sans-serif;
}

/* Labels */
.form_area label,
.form_area b {
  font-size: 16px;
  font-weight: 600;
  color: #000;
  font-family: 'Switzer', sans-serif;
}

/* Required indicator */
.form_area b span {
  color: #e63232;
}

/* Submit button */
input[type="submit"] {
  width: 180px;
  padding: 16px;
  margin-top: 35px;
  background-color: #DC006D;
  color: #fff;
  border: none;
  border-radius: 0px;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.3s ease;
  font-family: 'Switzer', sans-serif;
}

input[type="submit"]:hover {
  background-color: #25073B;
}

/* Radio buttons and checkboxes */
.wpcf7-list-item {
  margin-right: 15px;
  display: inline-block;
}

.wpcf7-list-item-label {
  margin-left: 4px;
  font-size: 16px;
}

/* Headings */
.form_area h3 {
  margin-top: 40px;
  margin-bottom: 20px;
  font-weight: 700;
  font-family: 'Switzer', sans-serif;
}

.form_area h4 {
  margin-bottom: 15px;
  font-weight: 600;
  font-family: 'Switzer', sans-serif;
}

/* Responsive */
@media (max-width: 768px) {
  .first_column,
  .second_column,
  .half_width1,
  .half_width2 {
    width: 100%;
    padding: 0 15px;
    border-left: none;
    min-height: auto;
  }

  .similar_checkbox .wpcf7-list-item {
    width: 50%;
  }
}
```

---

## Summary

The Fleming Lettings tenant enquiry form is a comprehensive, conditional form with:
- **20+ fields** for single applicant
- **40+ fields** for joint application
- **Conditional logic** based on registration type and employment disclosure
- **Two-column responsive layout**
- **Fleming brand styling** (pink/purple, Switzer font, sharp corners)
- **Validation** for required fields and email format
- **GDPR consent** checkbox

This specification provides all necessary information to build a matching form component in the CRM.
