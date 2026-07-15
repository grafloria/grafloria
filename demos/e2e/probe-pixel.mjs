import { chromium } from 'playwright';
import { readFileSync } from 'fs';
const png = readFileSync(process.argv[2]);
const b = await chromium.launch(); const p = await b.newPage();
await p.goto('data:text/html,<html></html>');
const out = await p.evaluate(async ({ b64, points }) => {
  const img = new Image();
  await new Promise(r => { img.onload = r; img.src = 'data:image/png;base64,' + b64; });
  const c = new OffscreenCanvas(img.width, img.height).getContext('2d');
  c.drawImage(img, 0, 0);
  return points.map(([x,y]) => {
    // scan a small box for the most saturated pixel (the ring stroke)
    let best = null, bestSat = -1;
    for (let dx=-8; dx<=8; dx++) for (let dy=-8; dy<=8; dy++) {
      const d = c.getImageData(x+dx, y+dy, 1, 1).data;
      const mx = Math.max(d[0],d[1],d[2]), mn = Math.min(d[0],d[1],d[2]);
      const sat = mx - mn;
      if (sat > bestSat) { bestSat = sat; best = [d[0],d[1],d[2]]; }
    }
    return { at:[x,y], rgb: best, sat: bestSat };
  });
}, { b64: png.toString('base64'), points: [[250,445],[640,325],[640,585]] });
console.log(JSON.stringify(out));
await b.close();
