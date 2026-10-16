// Plain status labels shown across Rentro. The server decides the label; the app only displays it.
export type StatusLabel = 'To do' | 'In review' | 'Action needed' | 'Approved' | 'Renewal due';

export interface OwnershipStatus { label: StatusLabel; owner: 'you' | 'Fleming'; next: string }

/** Where a landlord's proof of ownership stands for one home. */
export function ownershipStatus(authority: string | null | undefined, managementMode: string, reviewNotes?: string | null): OwnershipStatus {
  if (managementMode === 'fleming') return { label: 'Approved', owner: 'Fleming', next: 'Fleming holds the ownership records for this home.' };
  switch (authority) {
    case 'verified': return { label: 'Approved', owner: 'Fleming', next: 'Ownership verified.' };
    case 'submitted': return { label: 'In review', owner: 'Fleming', next: 'Fleming is checking your proof of ownership.' };
    case 'rejected': return { label: 'Action needed', owner: 'you', next: reviewNotes ? `Upload new proof: ${reviewNotes}` : 'Upload new proof of ownership.' };
    default: return { label: 'To do', owner: 'you', next: 'Upload proof of ownership, such as a Land Registry title.' };
  }
}
