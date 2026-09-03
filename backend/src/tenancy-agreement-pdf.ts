import PDFDocument from 'pdfkit';

export type AgreementType = 'internal' | 'client';
export type PaymentRoute = 'fleming_operating' | 'fleming_client_money' | 'landlord';

export interface AgreementBankDetails {
  sortCode: string;
  accountNumber: string;
  accountName: string;
  bankName: string;
}

export interface AgreementPerson {
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
}

export interface TenancyAgreementPdfInput {
  enquiryId: number;
  agreementType: AgreementType;
  serviceType?: string | null;
  agreementDate: Date;
  tenancyStartDate: Date;
  rent: number;
  deposit: number;
  propertyAddress: string;
  hasGas: boolean;
  landlord: AgreementPerson;
  tenants: AgreementPerson[];
  permittedOccupiers?: string | null;
  sharedFacilities?: string | null;
  parking?: string | null;
  paymentReference: string;
  bankDetails: AgreementBankDetails;
  paymentRoute: PaymentRoute;
  complianceDocuments: string[];
}

export const FLEMING_OPERATING_ACCOUNT: AgreementBankDetails = {
  sortCode: '20-08-64',
  accountNumber: '53346137',
  accountName: 'Fleming Lettings & Developments UK LTD',
  bankName: 'Barclays Bank PLC',
};

export const FLEMING_CLIENT_MONEY_ACCOUNT: AgreementBankDetails = {
  sortCode: '20-08-64',
  accountNumber: '03803880',
  accountName: 'Fleming Lettings & Developments UK Limited',
  bankName: 'Barclays Bank PLC',
};

const FLEMING_NAME = 'Fleming Lettings & Developments UK Limited';
const FLEMING_ADDRESS = 'Creative Industries Centre, Glaisher Drive, Wolverhampton Science Park, Wolverhampton, West Midlands, WV10 9TG';

export function resolveAgreementType(landlordType: string | null | undefined): AgreementType {
  return landlordType === 'internal' ? 'internal' : 'client';
}

export function resolvePaymentRoute(agreementType: AgreementType, serviceType: string | null | undefined): PaymentRoute {
  if (agreementType === 'internal') return 'fleming_operating';
  return serviceType === 'let_only' ? 'landlord' : 'fleming_client_money';
}

export function bankDetailsForRoute(route: PaymentRoute, landlordBank?: Partial<AgreementBankDetails>): AgreementBankDetails {
  if (route === 'fleming_operating') return FLEMING_OPERATING_ACCOUNT;
  if (route === 'fleming_client_money') return FLEMING_CLIENT_MONEY_ACCOUNT;
  const bank = {
    sortCode: String(landlordBank?.sortCode || '').trim(),
    accountNumber: String(landlordBank?.accountNumber || '').trim(),
    accountName: String(landlordBank?.accountName || '').trim(),
    bankName: String(landlordBank?.bankName || '').trim(),
  };
  if (!/^\d{2}-?\d{2}-?\d{2}$/.test(bank.sortCode)) throw new Error('Enter the landlord sort code');
  if (!/^\d{8}$/.test(bank.accountNumber)) throw new Error('Enter the landlord 8-digit account number');
  if (!bank.accountName) throw new Error('Enter the landlord account name');
  if (!bank.bankName) throw new Error('Enter the landlord bank name');
  bank.sortCode = bank.sortCode.replace(/^(\d{2})-?(\d{2})-?(\d{2})$/, '$1-$2-$3');
  return bank;
}

function ordinal(day: number): string {
  const suffix = day % 100 >= 11 && day % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[day % 10] || 'th';
  return `${day}${suffix}`;
}

function longDate(date: Date): string {
  return `${ordinal(Number(date.toLocaleDateString('en-GB', { day: 'numeric', timeZone: 'Europe/London' })))} ${date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'Europe/London' })}`;
}

const DEFINITIONS: Array<[string, string]> = [
  ['agent', 'means a company or person we have engaged to manage the property on our behalf, or anyone who later takes over our agent rights and obligations.'],
  ['communication services', 'means any TV licences, internet provision, telephones, satellite TV subscriptions or streaming services.'],
  ['contents', 'means anything we provide as stated in the Inventory. This includes white goods, furniture, cutlery, utensils, implements, tools, equipment, and the fixtures and fittings.'],
  ['disabled person', 'has the same meaning as set out in Section 6(2) of the Equality Act 2010.'],
  ['emergency', 'means where there is a risk to life or damage to the fabric of the property or the contents.'],
  ['fixtures and fittings', 'includes references to any fixtures, fittings, furnishings, effects, and floor, ceiling and wall coverings.'],
  ['house in multiple occupation / HMO', 'means that the property is let to a group of three or more people where at least two of them are unrelated.'],
  ['Inventory and Schedule of Condition', 'is a summary of the condition of the property or contents and usually includes a description of any faults, damage or missing items.'],
  ['jointly and severally liable', 'means that if there are two or more tenants, you are each responsible for complying with the agreement obligations together and individually. We are free to enforce these obligations or claim damages against one or more of you.'],
  ['landlord', 'includes anyone entitled to possession of the property when the agreement ends, as well as their successors in title or assignees.'],
  ['permitted occupier', 'means a person who is neither a tenant nor any other party to the tenancy. They have no rights to the property but we have granted them permission to occupy it as a guest for a time during this tenancy.'],
  ['property', 'means the self-contained flat or house. It also includes any part of the property boundaries, fences, garden and outbuildings that we own unless specifically excluded from the agreement.'],
  ['superior lease', 'sets out the promises we have made to our superior landlord. You are also bound by these promises if you have prior knowledge of them.'],
  ['tenancy', 'means the time between the start and termination of the agreement plus any addendum to it.'],
  ['tenant', 'means anyone entitled to possession of the property for the duration of the tenancy.'],
  ['Utilities', 'means water and sewage, electricity, gas, other forms of fuel for heating, or payments under a Green Deal charge.'],
  ['working day', 'does not include Saturdays, Sundays and bank holidays.'],
  ['you and your', 'mean the tenant.'],
];

const TERMS: Array<[string, string[]]> = [
  ['1. General terms', [
    '1.1 If there is more than one tenant, you are all jointly and severally liable for the obligations in the agreement.',
    '1.2 You must make reasonable efforts to ensure that no-one in your household or any visitor to the property breaches the terms of the agreement.',
    '1.3 If we have given you a copy of a superior lease, you agree that you will also be bound by its promises, except for any payments we are responsible for making under that lease.',
  ]],
  ['2. You must — rent and other payments', [
    '2.1 Pay the rent on the days and in the way we have agreed.',
    '2.2 Pay the charges for Council Tax and utilities and other relevant suppliers that you are responsible for under this agreement.',
    '2.3 Pay any sum which a court orders you to pay us, including any costs the court awards, in proceedings relating to this agreement. Nothing in this agreement requires a prohibited payment under the Tenant Fees Act 2019.',
    '2.4 Pay interest at 3% above the Bank of England base rate on any rent or other money more than 14 days in arrears, from the due date to the payment date.',
    '2.5 Notify us promptly if you start receiving Universal Credit, as well as any delays in receiving payment.',
  ]],
  ['Utilities', [
    '2.6 Inform us as soon as possible if you change the supplier of a utility.',
    '2.7 Not change the utility meters for the property without our written permission.',
  ]],
  ['Use of the property', [
    '2.8 Occupy the property as your only or main home and behave in a tenant-like manner.',
    '2.9 Take reasonable care of the property and any common parts.',
    '2.10 Take all reasonable steps not to block or cause a blockage to drains, pipes, gutters and channels in or on the property.',
    '2.11 Take all reasonable precautions to prevent condensation and mould growth by keeping the property adequately ventilated and heated.',
    '2.12 Take all reasonable precautions to prevent frost damage to any pipes or other installations in the property.',
    '2.13 Arrange suitable contents insurance for your own belongings. We have no liability to insure anything belonging to you.',
    '2.14 Notify us of any damage done deliberately or through neglect by you or visitors, and repair it within one month of our written notice.',
    '2.15 Only park in the space allocated to you in this agreement and not use it for any purpose other than storing a private motor vehicle.',
    '2.16 Not take a lodger or assign, sublet, or transfer possession of the property or any part of it without our written permission.',
    '2.17 Not use the property as anything other than a private home.',
    '2.18 Not harass or act in an antisocial way to any person in the neighbourhood, including making excessive noise, using the property for illegal purposes, or leaving rubbish in unauthorised places.',
    '2.19 Not bring dangerous or flammable goods, materials or substances into the property apart from those needed for general household use.',
    '2.20 Not smoke tobacco or any other substance, including vapes, in the property without our written permission.',
    '2.21 Not put any damaging oil, grease or other harmful or corrosive substance into washing or sanitary appliances or drains.',
    '2.22 Not obstruct the fire escape or any of the property common parts.',
    '2.23 Not do anything that would lead the property to require HMO licensing if it is not already so licensed.',
    '2.24 Not store or charge an E-bike or E-scooter in the property or shared facilities without our prior written consent.',
    '2.25 Not install or modify any charging points or stations for electric vehicles without our prior written permission.',
  ]],
  ['Leaving the property empty', [
    '2.26 Lock all doors and windows and switch on any burglar alarm whenever you leave the property unattended.',
    '2.27 Tell us if the property is going to be empty for more than seven days in a row.',
    '2.28 Not leave the property empty for more than 28 days in any circumstances.',
  ]],
  ['Condition of the property', [
    '2.29 Keep the inside of the property and its common parts in the same condition, cleanliness, repair and decoration as at the start of the tenancy, except for fair wear and tear.',
    '2.30 Notify us as soon as reasonably possible of any defect in the property.',
    '2.31 Replace any light bulbs, fluorescent tubes and batteries promptly and when necessary.',
    '2.32 Keep the exterior free from rubbish and place all rubbish and recycling containers in the allocated space on collection day.',
    '2.33 Keep the garden tidy and cut any grass regularly, but you do not have to improve the garden.',
    '2.34 Inspect smoke or carbon-monoxide alarms regularly, replacing batteries if necessary, and tell us as soon as possible of any fault.',
    '2.35 Not remove any of the contents from the property without our written permission.',
    '2.36 Not damage the property, fixtures and fittings, contents or the electric, gas, or plumbing system.',
  ]],
  ['Letters and notices', [
    '2.37 Forward any notice, order, proposal or legal proceedings affecting the property to us promptly on receiving them.',
    '2.38 Forward to us all correspondence addressed to the landlord at the property within a reasonable time.',
  ]],
  ['Access to the property', [
    '2.39 Allow us, our agent or contractors to enter at reasonable hours to inspect, perform repairs, or perform legal obligations. We will give at least 24 hours written notice.',
    '2.40 Let us enter the property immediately in an emergency.',
    '2.41 Allow possible new tenants, valuers and buyers access on at least 24 hours written notice.',
  ]],
  ['Keys and alarm codes', [
    '2.42 Permit us and our agent to hold a set of keys or security devices necessary to enter in an emergency.',
    '2.43 Not change alarm codes or door locks or have duplicate keys cut without our written permission.',
  ]],
  ['3. We agree to', [
    '3.1 Allow you to quietly possess and enjoy the property during the tenancy without interruption from us.',
    '3.2 Pay all assessments and outgoings regarding the property that are our responsibility.',
    '3.3 Ensure that any furniture and equipment we supply comply with the Furniture and Furnishings (Fire) (Safety) Regulations 1988 (as amended).',
    '3.4 Keep in repair all mechanical and electrical appliances forming part of the contents, unless the fault is due to your act or failure to act.',
    '3.5 Keep the property insured against fire and other usual comprehensive risks as long as cover is available on reasonable terms.',
    '3.6 Ensure the property complies with The Smoke and Carbon Monoxide Alarm (England) Regulations 2015 at the start of the tenancy.',
  ]],
  ['4. At the end of the tenancy', [
    '4.1 Give up the property with full vacant possession and in as good a condition as at the start, apart from fair wear and tear; return all keys and security devices; remove personal belongings; and give us a forwarding address.',
    '4.2 Allow us to erect a to-let or for-sale board once a valid notice to end the tenancy has been served and allow it to remain until the tenancy ends.',
    '4.3 We may remove, store, sell or otherwise dispose of goods you do not remove at the end of the tenancy. You are responsible for reasonable costs arising from this.',
  ]],
  ['6. Effect of termination', [
    '6.1 Termination ends the tenancy but does not release you from outstanding obligations or any obligation breached before termination.',
  ]],
  ['7. Serving notices', [
    '7.1 Notices sent by first-class post are deemed served two working days after posting. Notices sent by email before 4.30pm on a working day are deemed served that day; otherwise on the next working day.',
    '7.2 You agree that we may serve notices and other documents by email to the email address(es) provided in Section A.',
  ]],
  ['8. Ending the tenancy (Renters Rights Act 2025)', [
    '8.1 The Renters Rights Act 2025 has abolished Section 21 no-fault evictions. We can no longer serve a Section 21 notice to end this tenancy.',
    '8.2 We may only seek possession by serving a valid Section 8 notice in the prescribed form, stating the ground(s) relied upon from Schedule 2 of the Housing Act 1988 (as amended). If you do not leave, we must obtain and execute a court order for possession.',
    '8.3 You may end the tenancy by giving at least two months written notice ending on the first or last day of a tenancy period. Any one tenant can serve notice for all joint tenants.',
    '8.4 Once notice is validly served it may only be withdrawn if the landlord and all joint tenants agree in writing.',
  ]],
  ['9. Pets', [
    '9.1 You may request consent to keep a pet in writing, including the number and type of pets, a photograph, pet name, age, and how you intend to look after it.',
    '9.2 A written request will be answered within 28 days. We may not unreasonably refuse consent.',
    '9.3 You may not keep pets without first obtaining our written permission.',
    '9.4 If consent is granted, we may set reasonable written conditions for the pet behaviour. Failure to follow them is a breach of this agreement.',
  ]],
  ['10. Adaptations and improvements', [
    '10.1 You must not alter the property, fixtures or fittings, electric, gas or plumbing system, or erect any aerial, satellite dish or cable without our written permission.',
    '10.2 Requests under the Equality Act 2010 must be made in writing. We may not unreasonably withhold consent where the statutory conditions apply.',
    '10.3 If we refuse consent to a written request, we will respond in writing and give reasons.',
    '10.4 Permission may include reasonable conditions. Failure to comply is a breach of the tenancy.',
  ]],
  ['11. Conditions specific to a house in multiple occupation (HMO)', [
    '11.1 You, permitted occupiers and guests must not impede us, our contractors or our agent in performing duties imposed by legislation or a licence condition.',
    '11.2 Store and dispose of rubbish and recyclable waste in the appropriate container as instructed by the local authority.',
    '11.3 Tell us if the containers provided are insufficient for the property waste.',
    '11.4 Comply with reasonable requests or instructions made by us, our agent or the local authority in performing HMO management duties.',
  ]],
];

const ADDENDUM_TERMS = [
  'Switch off appliances when leaving the room or property, including the oven, hob, hair straighteners and curlers.',
  'Keep the heating on low while away to avoid frozen pipes, especially during winter.',
  'Ventilate all rooms regularly to prevent mould.',
  'Maintain the front and back garden and keep the property clean.',
  'Where permission is given for a pet, dispose of all associated mess and waste properly.',
  'Do not smoke inside the property. Smoke outside and properly dispose of cigarette or cigar butts, used vape coils and disposable vapes.',
  'The use or production of illegal substances is prohibited and violations will be reported.',
  'Lock all windows and doors to prevent break-ins. Double-check them in the evening and before leaving.',
  'Do not paint or drill into walls. Damage-free wall hanging strips are allowed.',
];

export function generateTenancyAgreementPdf(input: TenancyAgreementPdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 72, right: 48, bottom: 58, left: 48 },
      bufferPages: true,
      info: {
        Title: `Assured Periodic Tenancy - ${input.propertyAddress}`,
        Author: 'Fleming Lettings',
        Subject: `Tenant enquiry ${input.enquiryId}`,
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', chunk => chunks.push(Buffer.from(chunk)));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const width = doc.page.width - 96;
    const brand = '#DC006D';
    const ink = '#24172a';
    const muted = '#665c6b';

    const pageHeader = () => {
      doc.save();
      doc.rect(0, 0, doc.page.width, 48).fill('#24172a');
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(13).text('FLEMING LETTINGS', 48, 17, { lineBreak: false });
      doc.fillColor('#e9b5cf').font('Helvetica').fontSize(8).text('ASSURED PERIODIC TENANCY AGREEMENT', 305, 20, { width: 242, align: 'right', lineBreak: false });
      doc.restore();
      doc.y = Math.max(doc.y, 72);
    };
    doc.on('pageAdded', pageHeader);
    pageHeader();

    const ensure = (height: number) => { if (doc.y + height > doc.page.height - 62) doc.addPage(); };
    const paragraph = (text: string, options: { bold?: boolean; size?: number; indent?: number; color?: string } = {}) => {
      ensure(28);
      doc.font(options.bold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(options.size || 8.6)
        .fillColor(options.color || ink)
        .text(text, 48 + (options.indent || 0), doc.y, { width: width - (options.indent || 0), lineGap: 1.5, align: 'justify' });
      doc.moveDown(0.45);
    };
    const heading = (text: string, level = 1) => {
      ensure(level === 1 ? 44 : 30);
      doc.moveDown(level === 1 ? 0.65 : 0.3);
      doc.fillColor(level === 1 ? brand : ink).font('Helvetica-Bold').fontSize(level === 1 ? 14 : 10.5).text(text, { width });
      if (level === 1) {
        doc.moveDown(0.18);
        doc.moveTo(48, doc.y).lineTo(48 + width, doc.y).strokeColor('#e5bfd2').stroke();
      }
      doc.moveDown(0.45);
    };
    const labelValue = (label: string, value: string) => {
      ensure(26);
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(muted).text(label, 48, doc.y, { width: 118, continued: false });
      const y = doc.y - doc.currentLineHeight() - 1;
      doc.font('Helvetica').fillColor(ink).text(value || 'None', 170, y, { width: width - 122, lineGap: 1.2 });
      doc.moveDown(0.35);
    };

    const tenantNames = input.tenants.map(tenant => tenant.name).join(' | ');
    const tenantEmails = input.tenants.map(tenant => tenant.email).filter(Boolean).join(' | ') || 'Not provided';
    const tenantPhones = input.tenants.map(tenant => tenant.phone).filter(Boolean).join(' | ') || 'Not provided';
    const tenantAddresses = input.tenants.map(tenant => tenant.address).filter(Boolean).join(' | ') || 'Not provided';
    const landlordDisplay = input.agreementType === 'internal' ? `${FLEMING_NAME}, of ${FLEMING_ADDRESS}` : `${input.landlord.name}, of ${input.landlord.address || 'the address held in the CRM'}`;
    const startDate = longDate(input.tenancyStartDate);
    const rentDay = ordinal(Number(input.tenancyStartDate.toLocaleDateString('en-GB', { day: 'numeric', timeZone: 'Europe/London' })));

    doc.font('Helvetica-Bold').fontSize(18).fillColor(ink).text('Assured Periodic Tenancy Agreement');
    doc.moveDown(0.5);
    paragraph(`This agreement is dated: ${longDate(input.agreementDate)}`, { bold: true, size: 10 });
    paragraph('This agreement is a written statement of the terms and obligations of the assured periodic tenancy that you (the tenant) are entering into with us (the landlord). It sets out the legally binding obligations accepted as soon as the agreement is dated above.');
    paragraph('This tenancy is governed by the Housing Act 1988 as amended by the Renters Rights Act 2025. All new assured tenancies must be periodic from the outset; fixed-term assured tenancies can no longer be granted.');
    paragraph('Read the agreement carefully before signing. If you do not understand anything, ask for an explanation before signing or seek independent advice.');

    heading('Section A - Main Terms of the Agreement');
    paragraph('This agreement is between us, the landlord:', { bold: true });
    paragraph(landlordDisplay);
    paragraph('And you, the tenants (if there is more than one, you are jointly and severally liable):', { bold: true });
    paragraph(tenantNames);
    paragraph(`The landlord will let out the property at ${input.propertyAddress}, together with any furniture, fixtures, fittings and items referred to in the Inventory and Schedule of Condition.`);

    heading('Tenancy Start Date', 2);
    paragraph(`The tenancy begins on ${startDate}, and you are entitled to possession from that date. It runs from month to month, each rental period beginning on the ${rentDay} day of each month, until lawfully ended under clause 8.0.`);
    heading('Tenancy Type', 2);
    paragraph('This is an assured periodic tenancy under the Housing Act 1988 as amended by the Renters Rights Act 2025. It runs from period to period until lawfully ended in accordance with clause 8.0.');

    heading('Rent', 2);
    paragraph(`You must pay £${input.rent.toFixed(2)} rent in advance. The initial payment must be paid by ${startDate}. Subsequent payments of £${input.rent.toFixed(2)} must be paid in advance on the ${rentDay} day of each month.`);
    if (input.paymentRoute === 'landlord') {
      paragraph(`The first month's rent is payable to Fleming Lettings' client-money account. Future monthly rent must be made in cleared funds to the landlord account below.`, { bold: true });
    } else {
      paragraph('Payment must be made in cleared funds to:', { bold: true });
    }
    labelValue('Sort Code', input.bankDetails.sortCode);
    labelValue('Account Number', input.bankDetails.accountNumber);
    labelValue('Account Name', input.bankDetails.accountName);
    labelValue('Bank Name', input.bankDetails.bankName);
    labelValue('Payment Reference', input.paymentReference);
    if (input.paymentRoute === 'landlord') {
      paragraph(`Initial first-month payment account: ${FLEMING_CLIENT_MONEY_ACCOUNT.accountName}; sort code ${FLEMING_CLIENT_MONEY_ACCOUNT.sortCode}; account number ${FLEMING_CLIENT_MONEY_ACCOUNT.accountNumber}.`, { size: 8.2 });
    }
    paragraph('A rent increase requires a formal notice under Section 13 of the Housing Act 1988 (as amended). Rent can only be increased once per year, and you may refer a proposed increase to the First-tier Tribunal if you consider it above market rate.');

    heading('Permitted Occupiers', 2);
    paragraph(`In addition to you/yourselves, only the following permitted occupiers may live at the property: ${input.permittedOccupiers || 'None'}. Nobody else may live there without written permission.`);
    heading('Shared Facilities and Parking', 2);
    paragraph(`Shared facilities and common parts: ${input.sharedFacilities || 'None specified'}.`);
    paragraph(`Parking (if allocated): ${input.parking || 'No allocated parking'}.`);
    heading('Utilities and Council Tax', 2);
    paragraph('Rent does not include utilities, communication services, Council Tax or any similar charge. You are responsible for those charges from the day you are entitled to possession until the tenancy ends.');

    heading('Security Deposit', 2);
    if (input.agreementType === 'internal') {
      paragraph(`You must pay the deposit of £${input.deposit.toFixed(2)} to ${FLEMING_NAME}, of ${FLEMING_ADDRESS}. We will protect it in The Tenancy Deposit Scheme (TDS) within thirty days of receiving cleared funds and provide the prescribed information in that period, in line with clause 5.0.`);
    } else {
      paragraph(`You must pay the deposit of £${input.deposit.toFixed(2)} to Fleming Lettings as the landlord's agent. Once cleared funds have been received, the deposit will be transferred to the landlord, ${input.landlord.name}, who is responsible for protecting it in a Government-approved scheme within thirty days and providing the prescribed information. Fleming Lettings has no ongoing role or liability in managing the deposit.`);
    }

    heading('Right to Rent', 2);
    paragraph('It is a condition of this tenancy that you and anyone living in the property must have a right to rent as set out in Section 22 of the Immigration Act 2014.');
    heading('Contact Details', 2);
    paragraph(`Address for serving notices on the landlord: ${landlordDisplay}.`);
    if (input.agreementType === 'internal') {
      labelValue('Email', 'enquiries@fleminglettings.co.uk');
      labelValue('Phone', '01902 212 415');
    } else {
      labelValue('Email', input.landlord.email || 'Not provided');
      labelValue('Phone', input.landlord.phone || 'Not provided');
      paragraph(`Managing agent: ${FLEMING_NAME}, ${FLEMING_ADDRESS}; enquiries@fleminglettings.co.uk; 01902 212 415.`);
    }
    labelValue('Tenant name(s)', tenantNames);
    labelValue('Tenant email(s)', tenantEmails);
    labelValue('Tenant phone(s)', tenantPhones);
    labelValue('Address(es) before tenancy', tenantAddresses);
    paragraph('By providing an email address here you indicate that notices and other tenancy documents may be served by email.');

    heading('Ending the Tenancy', 2);
    paragraph('If any tenant wishes to end this tenancy, at least two months written notice must be given ending on the first or last day of a rental period. The landlord may only seek possession by serving a valid Section 8 notice and obtaining and executing a court order. Section 21 no-fault evictions have been abolished.');
    heading('Unfitness and Disrepair', 2);
    paragraph('The landlord must ensure the property is fit for human habitation as required by Section 9A of the Landlord and Tenant Act 1985, and keep the structure, exterior and installations for heating, water, gas, electricity and sanitation in repair as required by Section 11. You must promptly report defects.');
    heading(input.hasGas ? 'Gas and Electrical Safety' : 'Electrical Safety', 2);
    if (input.hasGas) paragraph('Any gas supply and appliances must comply with the Gas Safety (Installation and Use) Regulations 1998 (as amended), including annual gas safety checks by an approved person.');
    paragraph('Electrical installations must comply with the Electrical Safety Standards in the Private Rented Sector (England) Regulations 2020 (as amended), including inspection at least every five years by a qualified person.');
    heading('Pets', 2);
    paragraph('In accordance with Section 16A of the Housing Act 1988, as inserted by the Renters Rights Act 2025, you may request consent to keep a pet. Consent may not be unreasonably refused. See clause 9.0.');
    heading('Equality Act and Prior Notice', 2);
    paragraph('Where Section 190 of the Equality Act 2010 applies, consent for qualifying disability-related improvements may not be unreasonably withheld. Where a qualifying superior lease exists, the property may be repossessed under Grounds 2ZB or 2ZD of Schedule 2 of the Housing Act 1988 if the statutory conditions are met.');

    heading('Section B - Definitions');
    for (const [term, definition] of DEFINITIONS) {
      paragraph(`“${term}” ${definition}`, { size: 8.2 });
    }
    paragraph(input.agreementType === 'internal'
      ? `“us”, “our” and “we” mean the landlord, ${FLEMING_NAME}, which owns the property. Where we appoint an agent, we remain responsible for our obligations.`
      : `“us”, “our” and “we” mean the landlord and do not refer to the agent, ${FLEMING_NAME}, which acts solely as an intermediary and has no liability under this tenancy agreement.`, { size: 8.2 });

    heading('Section C - Terms and Conditions');
    paragraph('The landlord agrees to let the property with the contents to you for the tenancy on the terms in this agreement and any addendum.');
    for (const [title, clauses] of TERMS) {
      if (title === '6. Effect of termination') {
        heading('5. The deposit', 2);
        if (input.agreementType === 'internal') {
          paragraph(`5.1 The deposit will be held by ${FLEMING_NAME} from the date cleared funds are received.`);
          paragraph('5.2 We will protect it in The Tenancy Deposit Scheme (TDS) within thirty days and provide the prescribed information. We may transfer it to another approved scheme and will tell you in writing.');
        } else {
          paragraph(`5.1 The deposit will be held by the landlord, ${input.landlord.name}, once cleared funds have been received by the agent.`);
          paragraph('5.2 The landlord will protect it in a Government-approved tenancy deposit scheme within thirty days and provide the prescribed information. The agent has no ongoing role or liability in managing the deposit.');
        }
        paragraph('5.3 The deposit will be returned when the tenancy ends if all conditions are met, less properly due rent, reasonable breach costs, unpaid utilities or Council Tax, and damage or missing items subject to fair wear and tear.');
        paragraph('5.4 If the deposit is insufficient, you must pay the properly due shortfall.');
      }
      heading(title, 2);
      for (const clause of clauses) paragraph(`• ${clause}`, { indent: 10, size: 8.25 });
    }

    heading('Signed as an agreement');
    paragraph('Between us, the Landlord:', { bold: true });
    paragraph(input.agreementType === 'internal' ? `Mr. Robert Fleming (Managing Director), for and on behalf of ${FLEMING_NAME}` : input.landlord.name);
    paragraph(input.agreementType === 'internal'
      ? `Electronically signed: Robert Fleming    Date: ${longDate(input.tenancyStartDate)}`
      : 'Signature: ____________________________________    Date: ____________________');
    paragraph('And you, the Tenant(s):', { bold: true });
    paragraph(tenantNames);
    paragraph('Signature: ____________________________________    Date: ____________________');
    if (input.agreementType === 'client') {
      paragraph(`${FLEMING_NAME} acts solely as the managing/letting agent. The landlord remains responsible for all statutory and contractual obligations unless applicable law provides otherwise.`, { size: 8.2 });
    }

    heading('Addendum to Tenancy Agreement');
    paragraph(`This addendum forms part of the tenancy agreement dated ${longDate(input.agreementDate)} between ${input.agreementType === 'internal' ? FLEMING_NAME : input.landlord.name} and ${tenantNames} for ${input.propertyAddress}. If a term below conflicts with a standard term, the addendum prevails to the extent of that inconsistency.`);
    for (const term of ADDENDUM_TERMS) paragraph(`• ${term}`, { indent: 10, size: 8.4 });

    heading('Documents supplied with this agreement', 2);
    paragraph('By signing, the parties confirm receipt and understanding of the following documents:');
    paragraph('• Written Statement of Terms (Section A)');
    for (const item of input.complianceDocuments) paragraph(`• ${item}`);
    paragraph('This addendum is binding on all parties.');
    paragraph(`Landlord: ${input.agreementType === 'internal' ? `Mr. Robert Fleming, for ${FLEMING_NAME}` : input.landlord.name}`);
    paragraph(input.agreementType === 'internal'
      ? `Electronically signed: Robert Fleming    Date: ${longDate(input.tenancyStartDate)}`
      : 'Signed: ____________________________________    Date: ____________________');
    paragraph(`Tenant(s): ${tenantNames}`);
    paragraph('Signed: ____________________________________    Date: ____________________');

    const range = doc.bufferedPageRange();
    for (let pageIndex = range.start; pageIndex < range.start + range.count; pageIndex += 1) {
      doc.switchToPage(pageIndex);
      doc.page.margins.bottom = 0;
      doc.font('Helvetica').fontSize(7.5).fillColor('#766c7a').text(
        `Fleming Lettings · FL-TA-${input.enquiryId} · Page ${pageIndex + 1} of ${range.count}`,
        48,
        doc.page.height - 38,
        { width, align: 'center', lineBreak: false },
      );
    }
    doc.end();
  });
}
