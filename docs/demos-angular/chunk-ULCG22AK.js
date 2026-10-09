import{a as R}from"./chunk-Y27IVM25.js";import{a as E,b as T,c as D,g as A}from"./chunk-L5KG6PLN.js";import{a as S}from"./chunk-FOEU2B2W.js";import"./chunk-ZNWNIAK2.js";import{S as O,pb as B}from"./chunk-PO7RT2OU.js";import"./chunk-U3EUL5X4.js";import{$a as M,Ga as r,Na as C,Sa as v,X as c,Y as l,ab as b,cb as f,ib as x,jb as y,ka as g,kb as a,lb as s,ob as h,pb as d,qb as _,vb as k,wb as P,yb as p,zb as w}from"./chunk-ZIFWXPMG.js";import"./chunk-WWX6BADO.js";var I=["source"],F=(i,m)=>m[0];function z(i,m){if(i&1){let t=h();a(0,"button",9),d("click",function(){let o=c(t).$implicit,n=_();return l(n.show(o[0]))}),p(1),s()}if(i&2){let t=m.$implicit,e=_();f("on",e.type()===t[0]),M("data-type",t[0])("aria-pressed",e.type()===t[0]),r(),w(t[1])}}var V={arch:`architecture-beta
    service internet(internet)[Internet]
    group cloud(cloud)[Cloud]
    service web(server)[Web app] in cloud
    service api(server)[API] in cloud
    group data(database)[Data tier] in cloud
    service db(database)[Postgres] in data
    service cache(disk)[Redis cache] in data
    junction j in cloud

    internet:R --> L:web
    web:R -[HTTPS]-> L:api
    api:B -- T:j
    j:B --> T:db
    db:R -- L:cache`,block:`block-beta
    columns 3
    doc>"Document"]:3
    space down1<[" "]>(down) space

    block:e:3
        l["left"]
        m("A wide one in the middle")
        r["right"]
    end
    space down2<[" "]>(down) space
    db[("DB")]:3
    space:3
    D space C
    db --> D
    C --> db
    D --> C
    style m fill:#d6d,stroke:#333,stroke-width:4px`,tiers:`block-beta
    columns 4
    block:app["Application"]:3
        columns 1
        block:ui["Presentation layer"]
            columns 3
            web["Web app"] mobile["Mobile app"] admin["Admin portal"]
        end
        block:bll["Business logic layer"]
            columns 4
            orders["Orders"] billing["Billing"] rules["Business rules"] flows["Workflows"]
        end
        block:dal["Data access layer"]
            columns 3
            repos["Repositories"] orm["ORM / unit of work"] agents["Service agents"]
        end
    end
    block:sec["Security"]
        columns 1
        authn["Authentication"] authz["Authorization"] valid["Input validation"] crypto["Encryption"] audit["Audit log"]
    end
    block:data["Data"]:4
        columns 4
        db[("SQL database")] cache[("Cache")] files[("File storage")] ext["External APIs"]
    end
    classDef front fill:#e0f2fe,stroke:#0284c7,color:#0c4a6e
    classDef logic fill:#dcfce7,stroke:#16a34a,color:#14532d
    classDef access fill:#ede9fe,stroke:#7c3aed,color:#3b0764
    classDef store fill:#f1f5f9,stroke:#475569,color:#1e293b
    classDef guard fill:#fef3c7,stroke:#d97706,color:#78350f
    class web,mobile,admin front
    class orders,billing,rules,flows logic
    class repos,orm,agents access
    class db,cache,files,ext store
    class authn,authz,valid,crypto,audit guard`},G=[["arch","architecture-beta"],["block","block-beta"],["tiers","3-tier app"]],L="Real Mermaid syntax, laid out by Grafloria. Edit it \u2014 the drawing follows.",K=(()=>{class i{constructor(){this.types=G,this.NOTE=L,this.spec={nodes:[],edges:[]},this.type=g("arch"),this.note=g(null),this.text=V.arch.trim(),this.source=C("source"),this.timer=0}onReady(t){this.api=t,t.getEngine().setInteractionConfig({portVisibility:"hidden"}),this.draw(this.text),B()}onEdit(t){this.text=t,clearTimeout(this.timer),this.timer=window.setTimeout(()=>this.draw(this.source()?.nativeElement.value??this.text),300)}show(t){this.type.set(t),this.text=V[t].trim(),clearTimeout(this.timer),this.draw(this.text)}draw(t){let e=this.api;if(!e)return;let o;try{o=O(t).diagram}catch(n){this.note.set(`That text does not parse yet (${n&&n.message?n.message:n}) \u2014 the last drawing stays.`);return}this.note.set(null),e.setEdges([]),e.setGroups([]),e.setNodes([]),e.setNodes(o.getNodes()),e.setGroups(o.getGroups()),e.setEdges(o.getLinks()),e.renderNow(),e.fitView(32),e.renderNow()}ngAfterViewInit(){R(this.source()?.nativeElement,{language:"mermaid"})}ngOnDestroy(){clearTimeout(this.timer)}static{this.\u0275fac=function(e){return new(e||i)}}static{this.\u0275cmp=v({type:i,selectors:[["ng-component"]],viewQuery:function(e,o){e&1&&k(o.source,I,5),e&2&&P()},decls:13,vars:5,consts:[["source",""],["id","mb-bar"],["id","mb-type","role","group","aria-label","Mermaid diagram type",1,"seg"],["type","button",3,"on"],["id","mb-note","role","status"],["id","mb-canvas"],[2,"display","block","height","100%",3,"ready","spec"],["id","mb-code"],["id","mb-src","spellcheck","false","aria-label","Mermaid source",3,"ngModelChange","ngModel"],["type","button",3,"click"]],template:function(e,o){if(e&1){let n=h();a(0,"div",1)(1,"span"),p(2,"Mermaid"),s(),a(3,"span",2),x(4,z,2,5,"button",3,F),s(),a(6,"span",4),p(7),s()(),a(8,"div",5)(9,"grafloria-diagram",6),d("ready",function(u){return c(n),l(o.onReady(u))}),s()(),a(10,"div",7)(11,"textarea",8,0),d("ngModelChange",function(u){return c(n),l(o.onEdit(u))}),s()()}if(e&2){let n;r(4),y(o.types),r(2),f("err",!!o.note()),r(),w((n=o.note())!==null&&n!==void 0?n:o.NOTE),r(2),b("spec",o.spec),r(2),b("ngModel",o.text)}},dependencies:[S,A,E,T,D],styles:["#mb-bar[_ngcontent-%COMP%]{display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:8px 12px;border-bottom:1px solid var(--gf-line, #e5e7eb);background:#fff;font:500 12.5px ui-sans-serif,system-ui,sans-serif;color:var(--gf-ink, #111827)}#mb-bar[_ngcontent-%COMP%]   .seg[_ngcontent-%COMP%]{display:inline-flex;border:1px solid var(--gf-line, #e5e7eb);border-radius:7px;overflow:hidden}#mb-bar[_ngcontent-%COMP%]   .seg[_ngcontent-%COMP%]   button[_ngcontent-%COMP%]{border:0;background:none;padding:4px 11px;cursor:pointer;white-space:nowrap;font:600 12px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--gf-mut, #6b7280)}#mb-bar[_ngcontent-%COMP%]   .seg[_ngcontent-%COMP%]   button[_ngcontent-%COMP%] + button[_ngcontent-%COMP%]{border-left:1px solid var(--gf-line, #e5e7eb)}#mb-bar[_ngcontent-%COMP%]   .seg[_ngcontent-%COMP%]   button.on[_ngcontent-%COMP%]{background:var(--gf-ink, #111827);color:#fff}#mb-bar[_ngcontent-%COMP%]   .seg[_ngcontent-%COMP%]   button[_ngcontent-%COMP%]:focus-visible{outline:2px solid var(--gf-accent, #2563eb);outline-offset:2px}#mb-note[_ngcontent-%COMP%]{color:var(--gf-mut, #6b7280)}#mb-note.err[_ngcontent-%COMP%]{color:#b42318}#mb-canvas[_ngcontent-%COMP%]{height:540px;background:#fff}#mb-code[_ngcontent-%COMP%]{height:460px;border-top:1px solid var(--gf-line, #e5e7eb);background:#fff}#mb-src[_ngcontent-%COMP%]{display:block;box-sizing:border-box;width:100%;height:100%;margin:0;padding:14px 18px;border:0;background:#f8fafc;color:#1f2937;font:12px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre;overflow:auto;resize:none;tab-size:4}#mb-src[_ngcontent-%COMP%]:focus-visible{outline:2px solid var(--gf-accent, #2563eb);outline-offset:-2px}"]})}}return i})();export{K as MermaidArchitectureBlockComponent};
