import {CircleAlert} from 'lucide-react';

export default function MandatoryDocumentBadge(){
 return <span className="inline-flex items-center gap-[7px] whitespace-nowrap rounded-full border border-[#f2b5bb] bg-[#fff0f1] px-3 py-2 text-xs font-semibold text-[#be2537]" role="status"><CircleAlert size={16} aria-hidden="true"/>Mandatory to continue</span>;
}
