export interface PropertyComplianceDocument {
  doc_type: string;
}

export interface PropertyComplianceInput {
  has_gas: boolean | number;
  epc_expiry_date?: string | Date | null;
  eicr_expiry_date?: string | Date | null;
  gas_safety_expiry_date?: string | Date | null;
  documents: PropertyComplianceDocument[];
}

export interface PropertyComplianceItem {
  docType: 'EPC' | 'EICR' | 'Gas Safety Certificate';
  label: string;
  expiryDate: string | null;
  hasDocument: boolean;
  inDate: boolean;
  ready: boolean;
  reason: string | null;
}

export interface PropertyComplianceResult {
  ready: boolean;
  items: PropertyComplianceItem[];
}

function ukDate(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }
  const match = /^\d{4}-\d{2}-\d{2}/.exec(String(value));
  return match ? match[0] : null;
}

export function propertyCompliance(
  property: PropertyComplianceInput,
  today = new Date(),
): PropertyComplianceResult {
  const todayDate = today.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
  const uploadedTypes = new Set(property.documents.map(document => document.doc_type));
  const requirements: Array<{
    docType: PropertyComplianceItem['docType'];
    label: string;
    expiryDate: string | Date | null | undefined;
  }> = [
    { docType: 'EPC', label: 'EPC', expiryDate: property.epc_expiry_date },
    { docType: 'EICR', label: 'EICR', expiryDate: property.eicr_expiry_date },
  ];

  if (Boolean(property.has_gas)) {
    requirements.push({
      docType: 'Gas Safety Certificate',
      label: 'Gas Safety certificate',
      expiryDate: property.gas_safety_expiry_date,
    });
  }

  const items = requirements.map(requirement => {
    const expiryDate = ukDate(requirement.expiryDate);
    const hasDocument = uploadedTypes.has(requirement.docType);
    const inDate = Boolean(expiryDate && expiryDate >= todayDate);
    let reason: string | null = null;
    if (!hasDocument) reason = `${requirement.label} document is missing`;
    else if (!expiryDate) reason = `${requirement.label} expiry date is missing`;
    else if (!inDate) reason = `${requirement.label} has expired`;
    return {
      docType: requirement.docType,
      label: requirement.label,
      expiryDate,
      hasDocument,
      inDate,
      ready: hasDocument && inDate,
      reason,
    };
  });

  return { ready: items.every(item => item.ready), items };
}
