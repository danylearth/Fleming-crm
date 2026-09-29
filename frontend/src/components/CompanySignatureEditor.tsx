import {useEffect,useRef} from 'react';
import {PenLine} from 'lucide-react';
import {Button} from './ui';
import {signatureEditor} from '../utils/signatureEditor.js';
import '../styles/publicDocumentSigning.css';
export default function CompanySignatureEditor({name,onChange,disabled}:{name:string;onChange:(signature:string)=>void;disabled:boolean}) {
 const canvas=useRef<HTMLCanvasElement>(null),editor=useRef<ReturnType<typeof signatureEditor>|null>(null);
 const current=useRef({name,onChange,disabled});current.current={name,onChange,disabled};
 useEffect(()=>{if(!canvas.current)return;const instance=signatureEditor({canvas:canvas.current,name:()=>current.current.name,apply:image=>{if(!current.current.disabled)current.current.onChange(image.toDataURL('image/png'));}});editor.current=instance;return()=>{instance.destroy();editor.current=null;};},[]);
 return <><div hidden><canvas ref={canvas} width={700} height={290}/></div><Button variant="outline" className="gap-2" disabled={disabled||!name} onClick={()=>editor.current?.open()}><PenLine size={15}/>Create Signature</Button></>;
}
