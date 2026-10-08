import PropertyOnboardingWizard from './PropertyOnboardingWizard';
export default function PropertyContractStep({propertyId,onClose}:{propertyId:number;onClose:()=>void;existing?:boolean}) {
 return <PropertyOnboardingWizard propertyId={propertyId} onClose={onClose}/>;
}
