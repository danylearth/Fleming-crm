#!/usr/bin/env python3
"""Scoped access to the Fleming feedback queue. Never prints the API credential."""
import argparse, hashlib, json, os, pathlib, sys, urllib.request, urllib.error

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--credentials',default=str(pathlib.Path.home()/'.codex/private/fleming-feedback-agent.json'))
sub=parser.add_subparsers(dest='action',required=True)
sub.add_parser('queue')
for action in ['get','claim','update','download']:
 p=sub.add_parser(action);p.add_argument('id',type=int)
 if action in ['claim','update']:p.add_argument('--body-file',required=True)
 if action=='download':p.add_argument('--directory',required=True)
sub.add_parser('notify')
a=parser.parse_args()
p=pathlib.Path(a.credentials)
if p.stat().st_mode & 0o077:parser.error('Credential file must be readable only by its owner (chmod 600).')
credentials=json.loads(p.read_text())
base=credentials.get('api_url','https://fleming-crm-api.fly.dev').rstrip('/')+'/api/feedback-agent'

def request(route,body=None,binary=False):
 req=urllib.request.Request(base+route,data=json.dumps(body).encode() if body is not None else None,headers={'Authorization':'Bearer '+credentials['token'],**({'Content-Type':'application/json'} if body is not None else {})})
 try:
  with urllib.request.urlopen(req,timeout=90) as r:return r.read() if binary else json.load(r)
 except urllib.error.HTTPError as e:
  print(json.dumps({'status':e.code,'response':e.read().decode(errors='replace')}),file=sys.stderr);raise SystemExit(1)

if a.action=='queue':result=request('/queue')
elif a.action=='get':result=request('/'+str(a.id))
elif a.action in ['claim','update']:
 result=request(f'/{a.id}/{a.action}',json.loads(pathlib.Path(a.body_file).read_text()))
elif a.action=='notify':result=request('/notifications/send',{})
else:
 ticket=request('/'+str(a.id));directory=pathlib.Path(a.directory);directory.mkdir(parents=True,exist_ok=True,mode=0o700);os.chmod(directory,0o700)
 result=[]
 for f in ticket['files']:
  data=request(f'/{a.id}/files/{f["id"]}',binary=True)
  if hashlib.sha256(data).hexdigest()!=f['sha256']:raise RuntimeError('Attachment checksum mismatch')
  suffix=pathlib.Path(f['original_name']).suffix.lower()
  if not suffix.isascii() or len(suffix)>10:suffix='.bin'
  out=directory/f'attachment-{f["id"]}{suffix}';out.write_bytes(data);os.chmod(out,0o600)
  result.append({'path':str(out.resolve()),'original_name':f['original_name'],'sha256':f['sha256']})
print(json.dumps(result,indent=2))
