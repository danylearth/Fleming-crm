import {useState} from 'react';
import {ChevronDown,UserRound} from 'lucide-react';

type Colleague={id:number;name:string;department?:string;avatar_url?:string;online:boolean};
function Photo({user}:{user:Colleague}){
 const [failed,setFailed]=useState(false);
 return <span className="chat-avatar">{user.avatar_url&&!failed?<img src={user.avatar_url} alt="" onError={()=>setFailed(true)}/>:<UserRound size={20}/>}</span>;
}
export default function TeamChatDirectory({users,departments,department,currentUserId,search,busy,onSelect}:{users:Colleague[];departments:{name:string}[];department:string;currentUserId?:number;search:string;busy:boolean;onSelect:(id:number)=>void}){
 const [expanded,setExpanded]=useState<Record<string,boolean>>({});
 const query=search.trim().toLowerCase();
 const names=[...new Set([...departments.map(d=>d.name),...users.map(u=>u.department||'Unassigned')])].sort((a,b)=>a.localeCompare(b));
 const ownDepartment=department||users.find(u=>u.id===currentUserId)?.department||'Unassigned';
 const groups=[ownDepartment,...names.filter(name=>name!==ownDepartment)].map(name=>({name,users:users.filter(u=>u.id!==currentUserId&&(u.department||'Unassigned')===name&&`${u.name} ${name}`.toLowerCase().includes(query)).sort((a,b)=>a.name.localeCompare(b.name))}));
 return <section className="chat-team-directory" aria-label="Team directory">
  {groups.filter(group=>!query||group.users.length).map(group=>{const own=group.name===ownDepartment,open=Boolean(query)||own||Boolean(expanded[group.name]);return <section key={group.name} className="chat-team-department">
   {own?<h4>{group.name}<small>Your department</small></h4>:<button className="chat-department-toggle" aria-expanded={open} onClick={()=>setExpanded(old=>({...old,[group.name]:!old[group.name]}))}><span>{group.name}<small>{group.users.length} {group.users.length===1?'user':'users'}</small></span><ChevronDown size={18} className={open?'is-open':''}/></button>}
   {open&&<div className="chat-directory">{group.users.map(person=><button key={person.id} disabled={busy} onClick={()=>onSelect(person.id)}><Photo user={person}/><span><strong>{person.name}</strong><small>{person.online?'Online':'Offline'}</small></span><span className={person.online?'chat-online':'chat-offline'}/></button>)}{!group.users.length&&<p className="chat-directory-empty">No other users in this department.</p>}</div>}
  </section>})}
  {query&&!groups.some(group=>group.users.length>0)&&<p className="chat-directory-empty">No users or departments match “{search}”.</p>}
 </section>;
}
