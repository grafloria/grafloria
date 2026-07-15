import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { createServer } from 'http';
import { extname, join } from 'path';
const root = process.cwd() + '/demos';
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css' };
const server = createServer((req,res)=>{ const u=decodeURIComponent(req.url.split('?')[0]); try{ res.writeHead(200,{'Content-Type':MIME[extname(u)]??'application/octet-stream'}).end(readFileSync(join(root,u))); }catch{ res.writeHead(404).end(); }});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const b = await chromium.launch(); const p = await b.newPage();
p.on('pageerror', e=>console.log('PAGEERR', String(e).slice(0,120)));
await p.goto(`http://127.0.0.1:${server.address().port}/ports/typed-ports.html`);
await p.waitForFunction(()=>window.__demoReady===true,{timeout:15000});
const info = await p.evaluate(()=>{
  const els = [...document.querySelectorAll('[data-port-id="out"], [data-port-id="sin"]')];
  return els.map(e=>({ id: e.getAttribute('data-port-id'), tag: e.tagName, cls: e.getAttribute('class'),
    stroke: e.getAttribute('stroke'), fill: e.getAttribute('fill'),
    kids: [...e.children].map(k=>({tag:k.tagName, cls:k.getAttribute('class'), stroke:k.getAttribute('stroke'), fill:k.getAttribute('fill')})) }));
});
console.log(JSON.stringify(info,null,1));
await b.close(); server.close();
