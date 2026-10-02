import{C as ee,P as te,L as ne}from"./create-diagram-BoGZBrMu.js";const P=".axk-row, .axk-member",S="axk-row-selected",N=new WeakMap;function D(e,t){const n=window.CSS&&CSS.escape?CSS.escape(t):t.replace(/"/g,'\\"'),o=e.querySelector(`[data-node-id="${n}"]`);return o?Array.from(o.querySelectorAll(P)):[]}function $(e,t,n){const o=n.closest("[data-node-id]");if(!o)return null;const a=o.getAttribute("data-node-id"),s=Array.from(o.querySelectorAll(P)).indexOf(n);if(s===-1)return null;const l=n.classList.contains("axk-member")?"uml":"er",d=t.getModel?.().getNode?.(a),r=p=>d?.getMetadata?.(p);if(l==="er"){const g=r("kitEntity")?.columns?.[s]?.name??n.querySelector(".axk-col")?.textContent??void 0;return{nodeId:a,rowIndex:s,name:g??void 0,kind:l}}const c=r("kitClass"),m=c?.attributes?.length??oe(n),u=s<m?"attributes":"methods",f=(u==="attributes"?c?.attributes?.[s]:c?.methods?.[s-m])??n.textContent?.trim()??void 0;return{nodeId:a,rowIndex:s,name:f,kind:l,section:u}}function oe(e){const n=e.closest(".axk-uml")?.querySelector(".axk-uml-comp");return n?n.querySelectorAll(".axk-member").length:Number.MAX_SAFE_INTEGER}function Fe(e){const t=e.container;N.get(t)?.dispose();let n=null;const o=()=>{for(const r of Array.from(t.querySelectorAll(`.${S}`)))r.classList.remove(S);n&&D(t,n.nodeId)[n.rowIndex]?.classList.add(S)},a=()=>{t.dispatchEvent(new CustomEvent("axk:row-select",{bubbles:!0,detail:{selected:n}}))},i=r=>{r===null&&n===null||r!==null&&n!==null&&r.nodeId===n.nodeId&&r.rowIndex===n.rowIndex||(n=r,o(),a())},s=r=>{const m=(r.target instanceof Element?r.target:null)?.closest?.(P);if(!m||!t.contains(m)){i(null);return}const u=$(t,e,m);if(!u)return;t.dispatchEvent(new CustomEvent("axk:row-click",{bubbles:!0,detail:{...u}}));const f=n&&n.nodeId===u.nodeId&&n.rowIndex===u.rowIndex;i(f?null:u)},l=new MutationObserver(()=>{if(!n)return;const r=D(t,n.nodeId)[n.rowIndex];r&&!r.classList.contains(S)?o():r||i(null)});t.addEventListener("click",s),l.observe(t,{childList:!0,subtree:!0});const d={getSelected:()=>n?{...n}:null,select:r=>{if(r===null){i(null);return}const c=D(t,r.nodeId)[r.rowIndex];if(!c)return;const m=$(t,e,c);m&&i(m)},dispose:()=>{t.removeEventListener("click",s),l.disconnect(),N.get(t)===d&&N.delete(t)}};return N.set(t,d),d}const _=25,H=28,se=9,ae=26,ie=19,re=30,le=14,ce=8;function de(e){return H+e*_+_/2+1}function ue(e){return Math.round((e-H-_/2-1)/_)}function me(e,t=!1){const n=e.columns.map(i=>{const s=[{tag:"span",className:"axk-key"+(i.fk?" axk-fk":""),text:i.pk?"PK":i.fk?"FK":""},{tag:"span",className:"axk-col",text:i.name},{tag:"span",className:"axk-ty",text:i.type??""}];return t&&s.push({tag:"span",className:"axk-col-del",text:"×"}),{tag:"div",className:"axk-row"+(i.pk?" axk-pk":""),children:s}}),o={tag:"div",className:e.height!=null?"axk-entity-body axk-scroll":"axk-entity-body",children:n},a=[{tag:"div",className:"axk-entity-head",text:e.name??e.id},o];return t&&a.push({tag:"div",className:"axk-entity-add",text:"＋ add column"}),{tag:"div",className:"axk-entity",children:a}}function he(e,t=!1){return e.height!=null?e.height:H+e.columns.length*_+se+(t?ae:0)}const y=20,T=8,fe=22,xe=52,B=14,G=10,pe=190,ke=200,j=420,ge="12px system-ui, sans-serif",be="600 12px system-ui, sans-serif",we="11px system-ui, sans-serif",ye="600 11px system-ui, sans-serif",X="600 11px system-ui, sans-serif",ve="11px ui-monospace, Menlo, monospace",Ee="700 12px system-ui, sans-serif",Me="500 10px system-ui, sans-serif",Ce=.3;let w;const q=new Map;function b(e,t,n=0){if(!e)return 0;const o=`${t}\0${n}\0${e}`,a=q.get(o);if(a!==void 0)return a;if(w===void 0&&(w=null,typeof document<"u"&&typeof CanvasRenderingContext2D<"u"))try{w=document.createElement("canvas").getContext("2d")}catch{w=null}let i;if(w)w.font=t,i=w.measureText(e).width+n*e.length;else{const s=Number.parseFloat(/(\d+(?:\.\d+)?)px/.exec(t)?.[1]??"12");i=e.length*(s*.55+n)}return q.set(o,i),i}function Ie(e,t=!1){if(e.width!=null)return e.width;const n=(e.name??e.id).toUpperCase();let o=y+b(n,ye,Ce);for(const a of e.columns){const i=b(a.name,a.pk?be:ge),s=Math.max(xe,b(a.type??"",we));o=Math.max(o,y+fe+T+i+T+s+(t?T+B:0))}return t&&(o=Math.max(o,y+b("＋ add column",X))),Math.min(j,Math.max(pe,Math.ceil(o+G)))}function _e(e,t=!1){const n=e.attributes??[],o=e.methods??[],a=e.abstract||e.stereotype==="abstract"||e.stereotype==="interface",i=d=>t?{tag:"div",className:"axk-member",children:[{tag:"span",className:"axk-mtext",text:d},{tag:"span",className:"axk-col-del",text:"×"}]}:{tag:"div",className:"axk-member",text:d},s=(d,r)=>{const c=d.map(i);return t&&c.push({tag:"div",className:"axk-uml-add",text:r==="attributes"?"＋ attribute":"＋ method"}),{tag:"div",className:"axk-uml-comp"+(d.length?"":" axk-empty"),children:c}};return{tag:"div",className:"axk-uml",children:[{tag:"div",className:"axk-uml-name"+(a?" axk-abstract":""),children:[...e.stereotype?[{tag:"span",className:"axk-uml-stereo",text:`«${e.stereotype}»`}]:[],{tag:"span",text:e.name??e.id}]},{tag:"div",className:e.height!=null?"axk-uml-body axk-scroll":"axk-uml-body",children:[s(n,"attributes"),s(o,"methods")]}]}}function Ae(e,t=!1){if(e.height!=null)return e.height;const n=e.attributes??[],o=e.methods??[],a=t?2:0;return re+(e.stereotype?le:0)+(n.length+o.length+a)*ie+ce*2+12}function Se(e,t=!1){if(e.width!=null)return e.width;const n=t?B:0;let o=y+b(e.name??e.id,Ee);e.stereotype&&(o=Math.max(o,y+b(`«${e.stereotype}»`,Me)));for(const a of[...e.attributes??[],...e.methods??[]])o=Math.max(o,y+b(a,ve)+n);if(t)for(const a of["＋ attribute","＋ method"])o=Math.max(o,y+b(a,X));return Math.min(j,Math.max(ke,Math.ceil(o+G)))}function Ne(e,t){const n=new Map,o=new Set,a=new Set,i=(r,c)=>{n.set(r,c),o.add(c),a.add(r)};e.forEach((r,c)=>{const m=t.indexOf(r);m!==-1&&!o.has(m)&&i(c,m)}),e.forEach((r,c)=>{if(a.has(c))return;const m=t.findIndex((u,f)=>!o.has(f)&&u.name===r.name);m!==-1&&i(c,m)});const s=e.map((r,c)=>c).filter(r=>!a.has(r)),l=t.map((r,c)=>c).filter(r=>!o.has(r)),d=Math.min(s.length,l.length);for(let r=0;r<d;r++)i(s[r],l[r]);return n}class Le extends ee{constructor(t,n,o){super(n==="er"?"Edit table":"Edit class"),this.nodeId=t,this.kind=n,this.build=o,this.captured=!1}execute(t){const n=t.diagram,o=n.getNode(this.nodeId);if(!o)return;const a=this.kind==="er"?"kitEntity":"kitClass",i=o.getMetadata(a)??{};this.captured||(this.captured=!0,this.before={html:o.getMetadata("html"),kit:i,size:{...o.size},ports:o.getPorts().map(r=>r.serialize()),links:[]});const s=this.build(i),l=s.width??o.size.width,d=[];if(this.kind==="er"){const r=i.columns??[],c=s.newKit.columns??[],m=Ne(r,c);for(const u of[...o.getPorts()]){const f=u.layout?.args;if(u.layout?.strategy!=="absolute"||!f||f.units!=="px"||f.y==null)continue;const p=ue(f.y);if(p<0||p>=r.length)continue;const g=m.get(p);if(g===void 0){for(const k of n.getLinks())(k.sourcePortId===u.id||k.targetPortId===u.id)&&d.push(k.serialize());for(const k of n.getLinks().filter(v=>v.sourcePortId===u.id||v.targetPortId===u.id))n.removeLink(k.id);o.removePort(u.id)}else{f.y=de(g);const k=u.alignment?.side;f.x=k==="left"?0:k==="right"?l:l/2,u.setOffset({...u.offset??{x:0,y:0}})}}}o.setMetadata("html",{content:s.content,interactive:!0}),o.setMetadata(a,s.newKit),o.setSize(l,s.height),this.before&&(this.before.links=d)}undo(t){const n=t.diagram,o=n.getNode(this.nodeId);if(!o||!this.before)return;o.setMetadata("html",this.before.html),o.setMetadata(this.kind==="er"?"kitEntity":"kitClass",this.before.kit),o.setSize(this.before.size.width,this.before.size.height);const a=new Set(this.before.ports.map(i=>i.id));for(const i of[...o.getPorts()])a.has(i.id)||o.removePort(i.id);for(const i of this.before.ports){const s=o.getPort(i.id);s?(s.layout=i.layout,s.setOffset({...i.offset??{x:0,y:0}})):o.addPort(te.fromJSON(i))}for(const i of this.before.links)n.getLink(i.id)||n.addLink(ne.fromJSON(i))}canExecute(t){return!!t.diagram?.getNode(this.nodeId)}serialize(){return{id:this.id,name:this.name,timestamp:this.timestamp,data:{nodeId:this.nodeId,kind:this.kind}}}}async function J(e,t,n,o){const a=e.getModel?.(),i=a?.getNode?.(t);if(!a||!i)return!1;const s=new Le(t,n,o),l=e.getEngine?.()?.commandManager;return l?.execute?await l.execute(s):s.execute({diagram:a}),e.renderNow?.(),!0}const V=e=>e?.getMetadata("kitEditable")===!0;function M(e,t,n){const o=V(e.getModel?.()?.getNode?.(t));return J(e,t,"er",i=>{const s={...i};return n.name!==void 0&&(s.name=n.name),n.width!==void 0&&(s.width=n.width),n.height!==void 0&&(s.height=n.height),n.columns!==void 0&&(s.columns=n.columns),{newKit:s,content:me(s,o),height:he(s,o),width:Ie(s,o)}})}function R(e,t,n){const o=V(e.getModel?.()?.getNode?.(t));return J(e,t,"uml",i=>{const s={...i};return n.name!==void 0&&(s.name=n.name),n.stereotype!==void 0&&(s.stereotype=n.stereotype),n.abstract!==void 0&&(s.abstract=n.abstract),n.width!==void 0&&(s.width=n.width),n.height!==void 0&&(s.height=n.height),n.attributes!==void 0&&(s.attributes=n.attributes),n.methods!==void 0&&(s.methods=n.methods),{newKit:s,content:_e(s,o),height:Ae(s,o),width:Se(s,o)}})}function Re(e,t,n=e.length){const o=e.slice();return o.splice(Math.max(0,Math.min(n,o.length)),0,t),o}function Oe(e,t){const n=e.slice();return n.splice(t,1),n}function De(e,t,n){return e.map((o,a)=>a===t?{...o,name:n}:o)}const L=new WeakMap,K=".axk-row, .axk-member";function A(e){const t=e.closest("[data-node-id]");if(!t)return null;const n=t.getAttribute("data-node-id");if(!n)return null;const o=e.closest(K),a=Array.from(t.querySelectorAll(K)),i=o?a.indexOf(o):-1;return{nodeId:n,rowIndex:i,group:t}}const C=(e,t)=>e.getModel().getNode(t)?.getMetadata("kitEntity"),O=(e,t)=>e.getModel().getNode(t)?.getMetadata("kitClass");function Q(e,t){const n=e.attributes??[];return t<n.length?{section:"attributes",local:t}:{section:"methods",local:t-n.length}}let I=null;function F(){const e=I;I=null,e?.cancel()}function Te(e){const t=A(e);if(!t||t.rowIndex<0)return null;const n=e.closest(".axk-ty")?"type":"name";return{nodeId:t.nodeId,rowIndex:t.rowIndex,kind:n}}function Pe(e,t){const n=Te(e);return n?t===1?n.kind==="name"?{...n,kind:"type"}:{...n,rowIndex:n.rowIndex+1,kind:"name"}:n.kind==="type"?{...n,kind:"name"}:{...n,rowIndex:n.rowIndex-1,kind:"type"}:null}function He(e,t){const a=e.container.querySelector(`[data-node-id="${Z(t.nodeId)}"]`)?.querySelectorAll(".axk-row, .axk-member")[t.rowIndex]?.querySelector(t.kind==="type"?".axk-ty":".axk-col");a&&z(e,a)}function ze(e){return[...new Set(e)]}const We=["uuid","int","bigint","smallint","serial","decimal","numeric","real","double","varchar","text","char","boolean","date","time","timestamp","timestamptz","json","jsonb","bytea","enum"];function E(e,t,n,o,a){const i=e.container,s=i.ownerDocument,l=s.createElement("input");l.className="axk-edit-input",l.value=n,l.spellcheck=!1,l.setAttribute("autocomplete","off");let d=null;if(a?.length){d=s.createElement("datalist"),d.id=`axk-types-${Math.random().toString(36).slice(2,8)}`;for(const h of a){const x=s.createElement("option");x.value=h,d.appendChild(x)}s.body.appendChild(d),l.setAttribute("list",d.id)}const r=t.getBoundingClientRect();i.getBoundingClientRect();const c=a?.length?132:72;let m=Math.max(r.width,c),u=r.left;const f=t.closest(".axk-entity, .axk-uml");if(f){const h=f.getBoundingClientRect(),x=4;m>h.width-x*2&&(m=h.width-x*2);const U=u+m-(h.right-x);U>0&&(u-=U),u<h.left+x&&(u=h.left+x)}l.style.cssText=`position:fixed;left:${Math.round(u)}px;top:${Math.round(r.top)}px;width:${Math.round(m)}px;height:${Math.round(r.height)}px;z-index:2147483000;`,i.appendChild(l);let p=!1;const g={cancel:()=>{}},k=()=>{I===g&&(I=null),d?.remove(),l.remove()},v=()=>{if(p)return;p=!0;const h=l.value.trim();k(),h.length&&o(h)},W=()=>{p||(p=!0,k())};l.addEventListener("keydown",h=>{if(h.key==="Tab"){const x=Pe(t,h.shiftKey?-1:1);if(x){h.preventDefault(),v(),setTimeout(()=>He(e,x),0);return}}h.key==="Enter"?(h.preventDefault(),v()):h.key==="Escape"&&(h.preventDefault(),W()),h.stopPropagation()}),g.cancel=W,I=g,l.addEventListener("blur",v);for(const h of["pointerdown","pointerup","mousedown","mouseup","click","dblclick"])l.addEventListener(h,x=>x.stopPropagation());return setTimeout(()=>{l.focus(),l.select()},0),l}function z(e,t){const n=A(t);if(!n)return;const{nodeId:o,rowIndex:a}=n;if(t.closest(".axk-entity-head")){const r=C(e,o);E(e,t.closest(".axk-entity-head"),r?.name??o,c=>void M(e,o,{name:c}));return}if(t.closest(".axk-uml-name")){const r=O(e,o);E(e,t.closest(".axk-uml-name"),r?.name??o,c=>void R(e,o,{name:c}));return}const i=t.closest(".axk-ty");if(i&&a>=0){const r=C(e,o);if(!r)return;E(e,i,r.columns[a]?.type??"",c=>{const m=r.columns.map((u,f)=>f===a?{...u,type:c}:u);M(e,o,{columns:m})},ze([...r.columns.map(c=>c.type).filter(Boolean),...We]));return}const s=t.closest(".axk-row"),l=t.closest(".axk-col")??s?.querySelector(".axk-col")??null;if(l&&a>=0){const r=C(e,o);if(!r)return;E(e,l,r.columns[a]?.name??"",c=>void M(e,o,{columns:De(r.columns,a,c)}));return}const d=t.closest(".axk-member");if(d&&a>=0){const r=O(e,o);if(!r)return;const{section:c,local:m}=Q(r,a),u=(r[c]??[]).slice();E(e,d.querySelector(".axk-mtext")??d,u[m]??"",f=>{u[m]=f,R(e,o,{[c]:u})})}}function Ue(e,t){const n=t.closest(".axk-entity-add");if(n){const a=A(n);if(!a)return!0;const i=C(e,a.nodeId);if(!i)return!0;const s=Re(i.columns,{name:"new_column",type:""});return M(e,a.nodeId,{columns:s}).then(()=>{const d=e.container.querySelectorAll(`[data-node-id="${Z(a.nodeId)}"] .axk-row`)[s.length-1]?.querySelector(".axk-col");d&&z(e,d)}),!0}const o=t.closest(".axk-uml-add");if(o){const a=A(o);if(!a)return!0;const i=O(e,a.nodeId);if(!i)return!0;const l=Array.from(a.group.querySelectorAll(".axk-uml-comp")).indexOf(o.closest(".axk-uml-comp"))===0?"attributes":"methods",d=[...i[l]??[],l==="attributes"?"+ field: type":"+ method(): void"];return R(e,a.nodeId,{[l]:d}),!0}return!1}function $e(e,t){const n=t.closest(".axk-col-del");if(!n)return!1;const o=A(n);if(!o||o.rowIndex<0)return!0;const a=C(e,o.nodeId);if(a)return M(e,o.nodeId,{columns:Oe(a.columns,o.rowIndex)}),!0;const i=O(e,o.nodeId);if(i){const{section:s,local:l}=Q(i,o.rowIndex),d=(i[s]??[]).slice();d.splice(l,1),R(e,o.nodeId,{[s]:d})}return!0}function Z(e){return typeof CSS<"u"&&CSS.escape?CSS.escape(e):e.replace(/"/g,'\\"')}function Ye(e){const t=e.container;L.get(t)?.dispose();const n=s=>{const l=s.target instanceof Element?s.target:null;l&&((l.closest(".axk-col-del")||l.closest(".axk-entity-add")||l.closest(".axk-uml-add"))&&F(),($e(e,l)||Ue(e,l))&&(s.preventDefault(),s.stopPropagation()))},o=s=>{const l=s.target instanceof Element?s.target:null;l&&(l.closest(".axk-edit-input")||(l.closest(".axk-entity-head")||l.closest(".axk-uml-name")||l.closest(".axk-col")||l.closest(".axk-ty")||l.closest(".axk-row")||l.closest(".axk-member"))&&(s.preventDefault(),s.stopPropagation(),z(e,l)))},a=s=>{const l=s.target instanceof Element?s.target:null;l&&(l.closest(".axk-col-del")||l.closest(".axk-entity-add")||l.closest(".axk-uml-add"))&&(F(),s.preventDefault())};t.addEventListener("mousedown",a,!0),t.addEventListener("click",n,!0),t.addEventListener("dblclick",o,!0);const i={dispose(){t.removeEventListener("mousedown",a,!0),t.removeEventListener("click",n,!0),t.removeEventListener("dblclick",o,!0),L.get(t)===i&&L.delete(t)}};return L.set(t,i),i}const Y="grafloria-diagram-kit-styles",qe=`
/* ===== ER entity (table) cards ===== */
.axk-entity { font: 12px/1.5 system-ui, sans-serif; border: 1px solid #64748b;
  border-radius: 6px; overflow: hidden; background: #fff;
  width: 100%; height: 100%; box-sizing: border-box;
  display: flex; flex-direction: column; }
.axk-entity-body { flex: 1; min-height: 0; overflow-y: hidden; }
.axk-entity-body.axk-scroll { overflow-y: auto; scrollbar-width: thin; }
/* The head is sized by entityAutoWidth, but a title past the auto-width ceiling
   still has to degrade VISIBLY: this rule used to be absent entirely, so a long
   table name ran off the card and was cut by .axk-entity's overflow:hidden with
   nothing to show for it (measured: 305px of name in a 180px head — 125px gone,
   no ellipsis, no hint). nowrap also keeps the head exactly ER_HEAD_H tall,
   which entityAutoHeight's row math depends on. */
.axk-entity-head { background: #334155; color: #fff; font-weight: 600;
  letter-spacing: .3px; padding: 5px 10px; text-transform: uppercase; font-size: 11px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.axk-row { display: flex; align-items: center; gap: 8px; padding: 3px 10px;
  border-top: 1px solid #e2e8f0; }
.axk-key { width: 22px; font-size: 9px; font-weight: 700; color: #b45309; }
.axk-key.axk-fk { color: #6d28d9; }
/* ONE LINE PER COLUMN, ALWAYS — this rule is load-bearing for the card's HEIGHT.
   entityAutoHeight allocates exactly ER_ROW_H per column, and .axk-entity-body is
   overflow-y:hidden, so a name that wrapped to a second line pushed the last row
   past the card's bottom edge and it silently vanished (measured: a 40px row
   against the 25px the height math had reserved — 14px of the final column gone,
   with no scrollbar to hint at it). Long identifiers ellipsis instead, so the
   ROW always survives even when the text does not fit; an author who needs the
   whole identifier visible sets an explicit width on the entity. (No title
   attribute: the HTML-node contract deliberately passes text through
   textContent and no attributes, and a tooltip is not worth widening it.)
   min-width:0 is what lets a flex child shrink below its content. */
.axk-col { flex: 1; min-width: 0; color: #0f172a;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.axk-ty {
  color: #64748b; font-size: 11px;
  /* A new column starts with an EMPTY type, which collapsed the cell to zero
     width — there was nothing to double-click, so a type could never be set on
     a field you just added. Reserve a target and hint that it is editable. */
  min-width: 52px; text-align: right; cursor: text;
  /* Same contract as .axk-col: a long type must not wrap the row either.
     It keeps its reserved width and never shrinks away. */
  flex: 0 0 auto; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  max-width: 45%;
}
.axk-ty:empty::before { content: 'type'; color: #cbd5e1; font-style: italic; }
.axk-ty:hover { color: #0f172a; }
.axk-row.axk-pk .axk-col { font-weight: 600; }

/* ===== UML class cards ===== */
.axk-uml { font: 12px/1.5 system-ui, sans-serif; border: 1px solid #475569;
  border-radius: 4px; overflow: hidden; background: #fff;
  width: 100%; height: 100%; box-sizing: border-box;
  display: flex; flex-direction: column; }
.axk-uml-body { flex: 1; min-height: 0; overflow-y: hidden; }
.axk-uml-body.axk-scroll { overflow-y: auto; scrollbar-width: thin; }
/* Same one-line contract as .axk-entity-head: UML_NAME_H is what
   classAutoHeight reserves, so a wrapped class name would push the first
   compartment past the card's bottom edge. */
.axk-uml-name { text-align: center; font-weight: 700; padding: 5px 10px;
  background: #eef2ff; color: #1e1b4b;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.axk-uml-name.axk-abstract { font-style: italic; }
.axk-uml-stereo { display: block; font-size: 10px; font-weight: 500; opacity: .8; }
.axk-uml-comp { border-top: 1px solid #475569; padding: 3px 0; }
.axk-uml-comp.axk-empty { min-height: 8px; }
/* Members already refused to wrap, but with no ellipsis they were cut
   MID-GLYPH by the card's overflow:hidden — a method signature needing 487px
   in a 190px card lost 297px of itself silently, on the one line a class
   diagram exists to show. classAutoWidth now widens the card to fit; past its
   ceiling this ellipsis says so. min-width:0 lets the editable flex variant
   shrink. */
.axk-member { padding: 1px 10px; font: 11px/1.5 ui-monospace, Menlo, monospace;
  color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  min-width: 0; }

/* ===== Row interactivity (cards are interactive; drag stays geometric) ===== */
.axk-entity, .axk-uml { user-select: none; -webkit-user-select: none; }
.axk-row:hover { background: rgba(37, 99, 235, .07); }
.axk-member:hover { background: rgba(79, 70, 229, .07); }
.axk-row-selected, .axk-row-selected:hover { background: rgba(37, 99, 235, .16);
  box-shadow: inset 2px 0 0 #2563eb; }
.axk-member.axk-row-selected, .axk-member.axk-row-selected:hover {
  background: rgba(79, 70, 229, .16); box-shadow: inset 2px 0 0 #4f46e5; }

/* ===== Selection: ring the CARD, never a detached rectangle ===== */
g.node-group:has(.axk-entity) .selection-highlight,
g.node-group:has(.axk-uml) .selection-highlight { display: none; }
g.node-group[data-selected="true"] .axk-entity {
  border-color: #2563eb; box-shadow: 0 0 0 2px rgba(37, 99, 235, .45); }
g.node-group[data-selected="true"] .axk-uml {
  border-color: #4f46e5; box-shadow: 0 0 0 2px rgba(79, 70, 229, .45); }
g.node-group[data-selected="true"]:has(.axk-entity) rect.diagram-node,
g.node-group[data-selected="true"]:has(.axk-uml) rect.diagram-node {
  stroke: transparent !important; fill: none !important; }

/* ===== In-canvas editing chrome (only present when editable) ===== */
.axk-col-del { width: 14px; text-align: center; color: #94a3b8; cursor: pointer;
  font-weight: 700; opacity: 0; transition: opacity .1s; flex: 0 0 auto; }
.axk-row:hover .axk-col-del, .axk-member:hover .axk-col-del { opacity: 1; }
.axk-col-del:hover { color: #dc2626; }
/* Only editable members (which wrap their text in .axk-mtext) go flex — a
   read-only member stays a plain text div, so its golden never shifts. */
.axk-member:has(.axk-mtext) { display: flex; align-items: center; }
.axk-member .axk-mtext { flex: 1; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.axk-entity-add, .axk-uml-add { padding: 3px 10px; font-size: 11px; font-weight: 600;
  color: #2563eb; cursor: pointer; border-top: 1px dashed #cbd5e1; user-select: none; }
.axk-uml-add { color: #4f46e5; border-top: 1px dashed #c7d2fe; text-align: left; }
.axk-entity-add:hover, .axk-uml-add:hover { background: rgba(37, 99, 235, .08); }
.axk-edit-input { font: 12px/1.4 system-ui, sans-serif; box-sizing: border-box;
  border: 1px solid #2563eb; border-radius: 3px; padding: 1px 6px; margin: 0;
  background: #fff; color: #0f172a; outline: none; box-shadow: 0 1px 4px rgba(0,0,0,.2); }

/* ===== Dark mode ===== */
@media (prefers-color-scheme: dark) {
  .axk-entity { background: #1e293b; border-color: #475569; }
  .axk-row { border-top-color: #334155; }
  .axk-col { color: #e2e8f0; }
  .axk-uml { background: #1e293b; border-color: #64748b; }
  .axk-uml-name { background: #312e81; color: #e0e7ff; }
  .axk-uml-comp { border-top-color: #64748b; }
  .axk-member { color: #e2e8f0; }
}
`;function Be(e=typeof document<"u"?document:void 0){if(!e||e.getElementById(Y))return;const t=e.createElement("style");t.id=Y,t.textContent=qe,e.head.appendChild(t)}export{Ae as a,Se as b,_e as c,Fe as d,Be as e,Ye as f,me as g,he as h,Ie as i,de as j};
