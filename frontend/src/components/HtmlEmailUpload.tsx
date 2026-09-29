import { useRef, useState } from 'react';
import { FolderOpen, Upload, CheckCircle, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiUrl, readApiResponse } from '../utils/apiResponse';
import { emailAssetReferences, localEmailAsset, matchEmailAsset, replaceEmailAsset } from '../utils/emailAssets';
import { Button, Select } from './ui';
type Entry = { isFile: boolean; isDirectory: boolean; name: string; file: (ok: (file: File) => void, fail: (error: unknown) => void) => void; createReader: () => { readEntries: (ok: (entries: Entry[]) => void, fail: (error: unknown) => void) => void } };
type AssetFile = { path: string; file: File };
export default function HtmlEmailUpload({ onLoaded, resolveKnown, onBusy, onReady }: { onLoaded: (html: string, name: string) => void; resolveKnown: (html: string) => string; onBusy: (value: boolean) => void; onReady: (value: boolean) => void }) {
  const { token } = useAuth(), filesInput = useRef<HTMLInputElement>(null), folderInput = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<AssetFile[]>([]), [chosen, setChosen] = useState(''), [busy, setBusy] = useState(false), [status, setStatus] = useState(''), [error, setError] = useState(''), [dragging, setDragging] = useState(false);
  const process = async (all: AssetFile[], htmlPath: string) => {
    if (!htmlPath) { onReady(false); setStatus('Choose the HTML email below.'); return; }
    setBusy(true); onBusy(true); onReady(false); setError(''); setStatus('Checking HTML and linked assets…');
    try {
      const item = all.find(item => item.path === htmlPath)!;
      if (item.file.size > 200000) throw Error('Choose an HTML file up to 200 KB.');
      const parsed = new DOMParser().parseFromString(await item.file.text(), 'text/html');
      parsed.querySelectorAll('script').forEach(node => node.remove());
      for (const link of Array.from(parsed.querySelectorAll('link[rel="stylesheet"]'))) {
        const ref = link.getAttribute('href') || '';
        if (!localEmailAsset(ref)) throw Error('Include the stylesheet in the folder so it can be embedded in the email.');
        const path = matchEmailAsset(ref, htmlPath, all.map(item => item.path)), css = all.find(item => item.path === path);
        if (!css) throw Error(`Missing stylesheet: ${ref}`);
        let text = await css.file.text();
        for (const asset of emailAssetReferences(text)) if (localEmailAsset(asset)) {
          const matched = matchEmailAsset(asset, css.path, all.map(item => item.path));
          if (matched) text = replaceEmailAsset(text, asset, matched);
        }
        const style = parsed.createElement('style'); style.textContent = text; link.replaceWith(style);
      }
      let html = parsed.documentElement.outerHTML;
      const refs = emailAssetReferences(html).filter(localEmailAsset), mapped = new Map<string, AssetFile>();
      for (const ref of refs) { const path = matchEmailAsset(ref, htmlPath, all.map(item => item.path)), file = all.find(item => item.path === path); if (file) mapped.set(ref, file); }
      for (const ref of emailAssetReferences(html).filter(ref => /^data:/i.test(ref))) {
        const match = ref.match(/^data:image\/(png|jpeg|gif|webp);base64,(.+)$/i);
        if (!match) throw Error('Unsupported embedded image. Include PNG, JPEG, GIF or WebP image files.');
        const bytes = Uint8Array.from(atob(match[2]), char => char.charCodeAt(0));
        const name = `embedded-${mapped.size}.${match[1]}`;
        mapped.set(ref, { path: name, file: new File([bytes], name, { type: `image/${match[1]}` }) });
      }
      const urls = new Map<string, string>();
      for (const [ref, asset] of mapped) {
        if (!/\.(png|jpe?g|gif|webp)$/i.test(asset.file.name)) throw Error(`Unsupported email asset: ${asset.path}. Use PNG, JPEG, GIF or WebP images.`);
        if (asset.file.size > 8 * 1024 * 1024) throw Error(`Image is too large: ${asset.path}. Maximum 8 MB.`);
        if (!urls.has(asset.path)) {
          setStatus(`Preparing image ${urls.size + 1} of ${new Set([...mapped.values()].map(item => item.path)).size}…`);
          const body = new FormData(); body.append('file', asset.file);
          const response = await fetch(apiUrl('/api/marketing/images'), { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body });
          const result = await readApiResponse(response); urls.set(asset.path, result.url);
        }
        html = replaceEmailAsset(html, ref, urls.get(asset.path)!);
      }
      html = resolveKnown(html);
      const missing = emailAssetReferences(html).filter(localEmailAsset);
      onLoaded(html, item.file.name);
      if (missing.length) throw Error(`Missing assets: ${missing.join(', ')}. Add the folder or missing images before sending.`);
      setStatus(`${item.file.name} ready · ${urls.size} image${urls.size === 1 ? '' : 's'} prepared for email delivery.`);
      onReady(true);
    } catch (e) { setStatus(''); setError(e instanceof Error ? e.message : 'Could not prepare this email.'); }
    finally { setBusy(false); onBusy(false); }
  };
  const accept = async (incoming: AssetFile[]) => {
    onReady(false);
    const combined = new Map(files.map(item => [item.path, item])); incoming.forEach(item => combined.set(item.path, item)); const all = [...combined.values()];
    if (all.length > 200 || all.reduce((sum, item) => sum + item.file.size, 0) > 30 * 1024 * 1024) { setError('Choose up to 200 files totalling no more than 30 MB.'); return; }
    setFiles(all); const htmlFiles = all.filter(item => /\.html?$/i.test(item.path)), selected = chosen || (htmlFiles.length === 1 ? htmlFiles[0].path : '');
    setChosen(selected); if (selected) await process(all, selected); else setStatus(htmlFiles.length ? 'Choose the HTML email below.' : 'Add the HTML file to continue.');
  };
  const drop = async (items: DataTransferItemList, fallback: FileList) => {
    setDragging(false); const result: AssetFile[] = [];
    const walk = async (entry: Entry, prefix = ''): Promise<void> => {
      if (result.length >= 200) throw Error('Choose a folder with no more than 200 files.');
      if (entry.isFile) { const file = await new Promise<File>((ok, fail) => entry.file(ok, fail)); result.push({ file, path: prefix + entry.name }); }
      else if (entry.isDirectory) { const reader = entry.createReader(); for (;;) { const children = await new Promise<Entry[]>((ok, fail) => reader.readEntries(ok, fail)); if (!children.length) break; for (const child of children) await walk(child, prefix + entry.name + '/'); } }
    };
    try { const entries = Array.from(items).map(item => item.webkitGetAsEntry?.()).filter(Boolean) as unknown as Entry[]; if (entries.length) for (const entry of entries) await walk(entry); else result.push(...Array.from(fallback).map(file => ({ file, path: file.name }))); await accept(result); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not read the folder.'); }
  };
  return <div className={`rounded-xl border-2 border-dashed p-6 text-center ${dragging ? 'border-purple-500 bg-purple-500/10' : 'border-[var(--border-input)]'}`} onDragOver={event => { event.preventDefault(); if (!busy) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); if (!busy) void drop(event.dataTransfer.items, event.dataTransfer.files); }}>
    <Upload size={28} className="mx-auto mb-3 text-[var(--text-secondary)]"/><p className="font-semibold">Drop your email folder or HTML file here</p><p className="text-sm text-[var(--text-muted)] mt-2">Include the images and stylesheets. We’ll check the links and prepare the images for sending.</p>
    <div className="flex flex-wrap justify-center gap-3 mt-4"><Button variant="outline" disabled={busy} className="gap-2" onClick={() => filesInput.current?.click()}><Upload size={16}/>Choose Files</Button><Button variant="outline" disabled={busy} className="gap-2" onClick={() => folderInput.current?.click()}><FolderOpen size={16}/>Choose Folder</Button></div>
    <input ref={filesInput} type="file" multiple accept=".html,.htm,.css,.png,.jpg,.jpeg,.gif,.webp" className="sr-only" aria-label="Choose email files" onChange={event => { void accept(Array.from(event.target.files || []).map(file => ({ file, path: file.webkitRelativePath || file.name }))); event.target.value = ''; }}/>
    <input ref={folderInput} type="file" multiple {...{ webkitdirectory: '' }} className="sr-only" aria-label="Choose email folder" onChange={event => { void accept(Array.from(event.target.files || []).map(file => ({ file, path: file.webkitRelativePath || file.name }))); event.target.value = ''; }}/>
    {files.filter(item => /\.html?$/i.test(item.path)).length > 1 && <div className="mt-4 text-left"><Select label="Email HTML file" value={chosen} onChange={value => { setChosen(value); void process(files, value); }} options={[{ value: '', label: 'Choose an email' }, ...files.filter(item => /\.html?$/i.test(item.path)).map(item => ({ value: item.path, label: item.path }))]}/></div>}
    {status && <p role="status" className="mt-4 text-sm flex justify-center items-center gap-2">{!busy && chosen && <CheckCircle size={16} className="text-emerald-600"/>}{status}</p>}{error && <p role="alert" className="mt-4 text-sm text-red-600 flex justify-center items-start gap-2"><AlertTriangle size={16} className="shrink-0"/>{error}</p>}
  </div>;
}
