const fs=require('fs'),path=require('path'),esbuild=require('../frontend/node_modules/esbuild');
const root=__dirname;
async function main(){
 await esbuild.build({entryPoints:[path.join(root,'dashboard-invoice-entry.jsx')],outfile:path.join(root,'dist/dashboard-invoice.js'),bundle:true,jsx:'automatic',define:{'import.meta.env.VITE_API_URL':'""','process.env.NODE_ENV':'"production"'},nodePaths:[path.resolve(root,'../frontend/node_modules')],plugins:[{name:'local-ui-fixture',setup(build){build.onResolve({filter:/(hooks\/useApi|context\/AuthContext|context\/NotificationContext|components\/Layout)$/},()=>({path:path.join(root,'dashboard-invoice-shim.jsx')}));}}]});
 const css=fs.readdirSync(path.resolve(root,'../frontend/dist/assets')).find(f=>/^index-.*\.css$/.test(f));
 fs.copyFileSync(path.resolve(root,'../frontend/dist/assets',css),path.join(root,'dist/dashboard-invoice.css'));
 fs.copyFileSync(path.resolve(root,'../tmp/pdfs/test-rent_invoice.pdf'),path.join(root,'dist/assets/invoice-ui-sample.pdf'));
 fs.writeFileSync(path.join(root,'dist/dashboard-invoice.html'),`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dashboard and invoices · Test preview</title><link rel="stylesheet" href="/dashboard-invoice.css"><style>:root{--user-font:Arial,sans-serif}body{font-family:Arial,sans-serif;background:#f5f5f5;color:#171717;margin:0}.test-banner{padding:14px;background:#fff3cd;text-align:center;font-size:14px}.test-banner a{margin-left:18px;text-decoration:underline}</style></head><body><div class="test-banner">TEST PREVIEW · Sample records only<a href="?view=invoice">Invoice example</a><a href="?view=dashboard">Dashboard filters</a></div><div id="root"></div><script src="/dashboard-invoice.js"></script></body></html>`);
 console.log('Preview: http://127.0.0.1:5188/dashboard-invoice.html');
}main().catch(e=>{console.error(e);process.exitCode=1});
