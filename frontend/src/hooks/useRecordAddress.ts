import { useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
// Keep existing numeric links valid; add a readable name once the record loads.
export function useRecordAddress(section: string, name?: string) {
  const { id: parameter } = useParams();
  const id = parameter?.match(/^([1-9]\d*)(?:-|$)/)?.[1];
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (!id || !name) return;
    const slug = name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
    const pathname = `/${section}/${id}${slug ? `-${slug}` : ''}`;
    if (location.pathname !== pathname) navigate({ pathname, search: location.search, hash: location.hash }, { replace: true });
  }, [id,name,section,location.pathname,location.search,location.hash,navigate]);
  return id;
}
