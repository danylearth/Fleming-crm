import {Pencil} from 'lucide-react';
import {usePermissions} from '../../hooks/usePermissions';
export default function SectionEditButton({editing,onEdit,onSave,onCancel,saving=false,disabled=false,label='section'}:{editing:boolean;onEdit:()=>void;onSave:()=>void;onCancel:()=>void;saving?:boolean;disabled?:boolean;label?:string}){
 const {canEdit}=usePermissions();if(!canEdit())return null;
 return editing?<div className="flex shrink-0 gap-2"><button type="button" disabled={saving} onClick={onCancel} className="text-sm px-3 py-1.5 rounded-full border border-[var(--border-input)]">Cancel</button><button type="button" disabled={saving} onClick={onSave} className="text-sm px-3 py-1.5 rounded-full bg-[var(--accent-orange)] text-white">{saving?'Saving…':'Save'}</button></div>:<button type="button" aria-label={`Edit ${label}`} title={`Edit ${label}`} disabled={disabled} onClick={onEdit} className="p-2 rounded-full border border-[var(--border-input)] hover:bg-[var(--bg-hover)] disabled:opacity-40"><Pencil size={16}/></button>;
}
