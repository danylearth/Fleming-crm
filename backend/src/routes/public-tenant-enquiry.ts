import { Router, Request, Response } from 'express';
import { pool } from '../db-pg';
import { sendEmail } from '../email';

const router = Router();

/**
 * PUBLIC ENDPOINT - No authentication required
 * POST /api/public/tenant-enquiry
 *
 * Accepts tenant enquiry form submissions from fleminglettings.co.uk subdomain
 * This is the critical lead capture endpoint
 */
router.post('/tenant-enquiry', async (req: Request, res: Response) => {
  try {
    const {
      // Registration type
      registration_type,

      // Applicant 1
      FirstName,
      Surname,
      address,
      Postcode,
      yearofaddress,
      dob,
      form_email,
      contactNumber,
      Nationality,

      // Employment (Applicant 1)
      EmploymentStatus,
      furtherinformation,
      IndustryofEmployment,
      job_title,
      YearsinEmployment,
      AnnualSalary,
      position,

      // Applicant 2 (if joint)
      FirstName2,
      Surname2,
      address2,
      Postcode2,
      yearofaddress2,
      dob2,
      form_email2,
      contactNumber2,
      Nationality2,
      EmploymentStatus2,
      furtherinformation2,
      IndustryofEmployment2,
      job_title2,
      YearsinEmployment2,
      AnnualSalary2,
      position2,

      // Property requirements
      preferred_location,
      bedrooms,
      monthly_rent_budget,
      move_in_date,
      property_type, // JSON array
      pets,
      pet_details,
      additional_requirements,

      // Additional info
      referral_source,
      comments,
      gdpr_consent,
      marketing_consent
    } = req.body;

    // Validation - Required fields
    if (!FirstName || !Surname || !form_email || !contactNumber) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: First Name, Surname, Email, and Contact Number are required'
      });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(form_email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email address'
      });
    }

    // Check for duplicate submissions (within last 24 hours)
    const duplicateCheck = await pool.query(
      `SELECT id FROM tenant_enquiries
       WHERE email_1 = $1
       AND created_at > NOW() - INTERVAL '24 hours'
       LIMIT 1`,
      [form_email]
    );

    if (duplicateCheck.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'A recent enquiry with this email already exists. Please contact us if you need to update your details.'
      });
    }

    // Determine if joint application
    const is_joint = registration_type === 'Joint' ? 1 : 0;

    // Get client IP and user agent for audit
    const client_ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const user_agent = req.headers['user-agent'];

    // Insert into database
    const result = await pool.query(
      `INSERT INTO tenant_enquiries (
        -- Applicant 1
        first_name_1,
        last_name_1,
        email_1,
        phone_1,
        current_address_1,
        postcode_1,
        years_at_address_1,
        date_of_birth_1,
        nationality_1,
        employment_status_1,
        provide_employment_info_1,
        industry_of_employment_1,
        job_title_1,
        years_in_employment_1,
        annual_salary_1,
        position_type_1,
        income_1,

        -- Joint application
        is_joint_application,

        -- Applicant 2
        first_name_2,
        last_name_2,
        email_2,
        phone_2,
        current_address_2,
        postcode_2,
        years_at_address_2,
        date_of_birth_2,
        nationality_2,
        employment_status_2,
        provide_employment_info_2,
        industry_of_employment_2,
        job_title_2,
        years_in_employment_2,
        annual_salary_2,
        position_type_2,
        income_2,

        -- Property requirements
        preferred_location,
        bedrooms,
        monthly_rent_budget,
        move_in_date,
        property_type,
        has_pets,
        pet_details,
        additional_requirements,

        -- Additional info
        referral_source,
        comments,
        gdpr_consent,
        marketing_consent,

        -- Metadata
        form_submission_ip,
        form_submission_user_agent,
        form_version,
        status,
        created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
        $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
        $31, $32, $33, $34, $35, $36, $37, $38, $39, $40,
        $41, $42, $43, $44, $45, $46, $47, $48, NOW()
      ) RETURNING id`,
      [
        // Applicant 1
        FirstName,
        Surname,
        form_email,
        contactNumber,
        address,
        Postcode,
        yearofaddress,
        dob || null,
        Nationality,
        EmploymentStatus,
        furtherinformation === 'Yes' ? 1 : 0,
        IndustryofEmployment || null,
        job_title || null,
        YearsinEmployment || null,
        parseFloat(AnnualSalary) || null,
        position || null,
        parseFloat(AnnualSalary) || null, // income_1 (same as annual_salary)

        // Joint
        is_joint,

        // Applicant 2
        FirstName2 || null,
        Surname2 || null,
        form_email2 || null,
        contactNumber2 || null,
        address2 || null,
        Postcode2 || null,
        yearofaddress2 || null,
        dob2 || null,
        Nationality2 || null,
        EmploymentStatus2 || null,
        furtherinformation2 === 'Yes' ? 1 : 0,
        IndustryofEmployment2 || null,
        job_title2 || null,
        YearsinEmployment2 || null,
        parseFloat(AnnualSalary2) || null,
        position2 || null,
        parseFloat(AnnualSalary2) || null, // income_2

        // Property requirements
        preferred_location || null,
        parseInt(bedrooms) || null,
        parseFloat(monthly_rent_budget) || null,
        move_in_date || null,
        property_type ? JSON.stringify(property_type) : null,
        pets === 'Yes' ? 1 : 0,
        pet_details || null,
        additional_requirements || null,

        // Additional
        referral_source || null,
        comments || null,
        gdpr_consent ? 1 : 0,
        marketing_consent ? 1 : 0,

        // Metadata
        client_ip,
        user_agent,
        'v1',
        'new'
      ]
    );

    const enquiryId = result.rows[0].id;

    // Send confirmation email to applicant
    try {
      await sendEmail({
        to: form_email,
        subject: 'Thank you for your enquiry - Fleming Lettings',
        html: `
          <div style="font-family: 'Switzer', Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background-color: #DC006D; padding: 30px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 28px;">Fleming Lettings</h1>
            </div>

            <div style="padding: 40px 30px; background-color: #f5f5f5;">
              <h2 style="color: #25073B; margin-top: 0;">Thank you for your enquiry!</h2>

              <p style="font-size: 16px; line-height: 1.6; color: #333;">
                Dear ${FirstName},
              </p>

              <p style="font-size: 16px; line-height: 1.6; color: #333;">
                Thank you for registering your interest with Fleming Lettings. We have received your enquiry
                and one of our team will be in touch shortly to discuss your property requirements.
              </p>

              <div style="background-color: white; padding: 25px; border-left: 4px solid #DC006D; margin: 25px 0;">
                <h3 style="margin-top: 0; color: #25073B;">Your enquiry details:</h3>
                <p style="margin: 5px 0;"><strong>Reference:</strong> #ENQ-${enquiryId}</p>
                <p style="margin: 5px 0;"><strong>Name:</strong> ${FirstName} ${Surname}</p>
                <p style="margin: 5px 0;"><strong>Email:</strong> ${form_email}</p>
                ${bedrooms ? `<p style="margin: 5px 0;"><strong>Bedrooms:</strong> ${bedrooms}</p>` : ''}
                ${monthly_rent_budget ? `<p style="margin: 5px 0;"><strong>Budget:</strong> £${monthly_rent_budget}/month</p>` : ''}
                ${move_in_date ? `<p style="margin: 5px 0;"><strong>Move-in Date:</strong> ${move_in_date}</p>` : ''}
              </div>

              <p style="font-size: 16px; line-height: 1.6; color: #333;">
                In the meantime, you can browse our available properties on our website or contact us directly:
              </p>

              <div style="text-align: center; margin: 30px 0;">
                <a href="https://fleminglettings.co.uk" style="background-color: #DC006D; color: white; padding: 15px 40px; text-decoration: none; border-radius: 0; display: inline-block; font-weight: 500;">
                  View Properties
                </a>
              </div>

              <p style="font-size: 14px; color: #666; margin-top: 30px;">
                Best regards,<br>
                <strong>The Fleming Lettings Team</strong>
              </p>
            </div>

            <div style="background-color: #25073B; padding: 20px; text-align: center;">
              <p style="color: white; font-size: 12px; margin: 5px 0;">
                Fleming Lettings | Your local property experts
              </p>
              <p style="color: white; font-size: 12px; margin: 5px 0;">
                www.fleminglettings.co.uk
              </p>
            </div>
          </div>
        `
      });
    } catch (emailError) {
      console.error('Failed to send confirmation email:', emailError);
      // Don't fail the request if email fails - enquiry is still saved
    }

    // Send notification email to Fleming Lettings team
    try {
      await sendEmail({
        to: process.env.ENQUIRY_NOTIFICATION_EMAIL || 'admin@fleming.com',
        subject: `New Tenant Enquiry - ${FirstName} ${Surname} (#ENQ-${enquiryId})`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px;">
            <h2 style="color: #DC006D;">New Tenant Enquiry Received</h2>

            <p><strong>Reference:</strong> #ENQ-${enquiryId}</p>
            <p><strong>Type:</strong> ${is_joint ? 'Joint Application' : 'Single Application'}</p>
            <p><strong>Submitted:</strong> ${new Date().toLocaleString('en-GB')}</p>

            <h3>Applicant Details:</h3>
            <ul>
              <li><strong>Name:</strong> ${FirstName} ${Surname}</li>
              <li><strong>Email:</strong> ${form_email}</li>
              <li><strong>Phone:</strong> ${contactNumber}</li>
              <li><strong>Current Address:</strong> ${address}, ${Postcode}</li>
              <li><strong>Date of Birth:</strong> ${dob || 'Not provided'}</li>
              <li><strong>Employment:</strong> ${EmploymentStatus}</li>
              ${AnnualSalary ? `<li><strong>Annual Salary:</strong> £${AnnualSalary}</li>` : ''}
            </ul>

            ${is_joint ? `
              <h3>Second Applicant:</h3>
              <ul>
                <li><strong>Name:</strong> ${FirstName2} ${Surname2}</li>
                <li><strong>Email:</strong> ${form_email2}</li>
                <li><strong>Phone:</strong> ${contactNumber2}</li>
              </ul>
            ` : ''}

            <h3>Property Requirements:</h3>
            <ul>
              ${bedrooms ? `<li><strong>Bedrooms:</strong> ${bedrooms}</li>` : ''}
              ${monthly_rent_budget ? `<li><strong>Budget:</strong> £${monthly_rent_budget}/month</li>` : ''}
              ${move_in_date ? `<li><strong>Move-in Date:</strong> ${move_in_date}</li>` : ''}
              ${preferred_location ? `<li><strong>Location:</strong> ${preferred_location}</li>` : ''}
              <li><strong>Pets:</strong> ${pets === 'Yes' ? 'Yes' : 'No'}</li>
            </ul>

            ${additional_requirements ? `
              <h3>Additional Requirements:</h3>
              <p>${additional_requirements}</p>
            ` : ''}

            <div style="background-color: #f0f0f0; padding: 15px; margin-top: 20px;">
              <p style="margin: 0;"><strong>Action Required:</strong> View this enquiry in the CRM and follow up promptly.</p>
              <a href="${process.env.FRONTEND_URL || 'https://fleming-portal.vercel.app'}/v3/tenant-enquiries/${enquiryId}"
                 style="display: inline-block; background-color: #DC006D; color: white; padding: 10px 20px; text-decoration: none; margin-top: 10px;">
                View in CRM
              </a>
            </div>
          </div>
        `
      });
    } catch (emailError) {
      console.error('Failed to send team notification email:', emailError);
    }

    // Return success response
    res.status(201).json({
      success: true,
      message: 'Thank you! Your enquiry has been received. We will be in touch shortly.',
      enquiry_id: enquiryId,
      reference: `ENQ-${enquiryId}`
    });

  } catch (error: any) {
    console.error('Error creating tenant enquiry:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while submitting your enquiry. Please try again or contact us directly.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * PUBLIC ENDPOINT - Health check
 * GET /api/public/health
 */
router.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'Fleming Lettings - Tenant Enquiry API',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

export default router;
