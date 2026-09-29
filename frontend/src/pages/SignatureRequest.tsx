import {useParams,Navigate} from 'react-router-dom';
export default function SignatureRequest(){const {entity,id}=useParams();if(!['tenant','landlord'].includes(entity||'')||!Number(id))return <p>Choose a tenant or landlord record.</p>;return <Navigate replace to={`/${entity==='tenant'?'tenants':'landlords'}/${id}#request-signatures`}/>;}
