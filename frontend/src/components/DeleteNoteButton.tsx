import {useState} from 'react';
import {Trash2} from 'lucide-react';
import {useAuth} from '../context/AuthContext';
import {useApi} from '../hooks/useApi';
import {useNotifications} from '../context/NotificationContext';
export default function DeleteNoteButton({entity,id,note,onDeleted}:{entity:string;id:number|string;note:{id:string|number;text:string};onDeleted:()=>void|Promise<void>}) {
 const {user}=useAuth(),api=useApi(),{confirmAction,notify}=useNotifications();const [busy,setBusy]=useState(false);
 if(user?.role!=='admin')return null;
 return <button type="button" disabled={busy} aria-label="Delete note" className="p-2 rounded-full text-red-500 hover:bg-red-500/10" onClick={async()=>{if(!await confirmAction('Delete this note? The deletion will be recorded in the activity log.'))return;setBusy(true);try{await api.post(`/api/record-notes/${entity}/${id}/delete`,{note_id:note.id,text:note.text});await onDeleted();}catch(error){notify(error instanceof Error?error.message:'Note could not be deleted','error');}finally{setBusy(false);}}}><Trash2 size={14}/></button>;
}
