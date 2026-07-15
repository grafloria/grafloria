// what svg root does renderStatic emit? run in chromium against the bundle
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { createServer } from 'http';
import { extname, join } from 'path';
const root = process.cwd() + '/demos';
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css' };
const server = createServer((req,res)=>{ const u=decodeURIComponent(req.url.split('?')[0]); try{ res.writeHead(200,{'Content-Type':MIME[extname(u)]??'application/octet-stream'}).end(readFileSync(join(root, u==='/'?'index.html':u))); }catch{ res.writeHead(404).end(); }});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const b = await chromium.launch(); const p = await b.newPage();
await p.goto(`http://127.0.0.1:${server.address().port}/misc/server-side-export.html`);
await p.waitForFunction(()=>window.__demoReady===true,{timeout:15000});
const info = await p.evaluate(()=>{
  const svg = document.querySelector('#preview svg');
  const pr = document.getElementById('preview').getBoundingClientRect();
  return { svgTag: svg ? svg.outerHTML.slice(0, 220) : null, previewRect: {w:pr.width,h:pr.height},
           svgRect: svg ? (r=>({w:r.width,h:r.height}))(svg.getBoundingClientRect()) : null };
});
console.log(JSON.stringify(info,null,1));
await b.close(); server.close();
