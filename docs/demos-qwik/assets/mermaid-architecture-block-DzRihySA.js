import{_ as t}from"./preload-helper-D57DdDQb.js";import{y as s,L as i}from"./core.min-C7M5tFMw.js";import"./index-YJHSr4jy.js";import{w as l}from"./create-diagram-BM1CvY1Y.js";import"./preloader-D7tuiBjF.js";import"./index-B7GSxwA6.js";import"./default-dark-theme-CK9ZvHhX.js";import"./LinkModel-CNp_BZcH.js";import"./disposable-CKHTf1hZ.js";const h={arch:`architecture-beta
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
    class authn,authz,valid,crypto,audit guard`},w=[["arch","architecture-beta"],["block","block-beta"],["tiers","3-tier app"]],x="Real Mermaid syntax, laid out by Grafloria. Edit it — the drawing follows.",k=`
#mb-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 8px 12px; border-bottom: 1px solid var(--gf-line, #e5e7eb); background: #fff; font: 500 12.5px ui-sans-serif, system-ui, sans-serif; color: var(--gf-ink, #111827); }
#mb-bar .seg { display: inline-flex; border: 1px solid var(--gf-line, #e5e7eb); border-radius: 7px; overflow: hidden; }
#mb-bar .seg button { border: 0; background: none; padding: 4px 11px; cursor: pointer; white-space: nowrap; font: 600 12px ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--gf-mut, #6b7280); }
#mb-bar .seg button + button { border-left: 1px solid var(--gf-line, #e5e7eb); }
#mb-bar .seg button.on { background: var(--gf-ink, #111827); color: #fff; }
#mb-bar .seg button:focus-visible { outline: 2px solid var(--gf-accent, #2563eb); outline-offset: 2px; }
#mb-note { color: var(--gf-mut, #6b7280); }
#mb-note.err { color: #b42318; }
#mb-canvas { height: 540px; background: #fff; }
#mb-code { height: 460px; border-top: 1px solid var(--gf-line, #e5e7eb); background: #fff; }
#mb-src { display: block; box-sizing: border-box; width: 100%; height: 100%; margin: 0; padding: 14px 18px; border: 0; background: #f8fafc; color: #1f2937; font: 12px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre; overflow: auto; resize: none; tab-size: 4; }
#mb-src:focus-visible { outline: 2px solid var(--gf-accent, #2563eb); outline-offset: -2px; }
`;function v(e,a){let o;try{o=l(a).diagram}catch(r){return`That text does not parse yet (${r&&r.message?r.message:r}) — the last drawing stays.`}return e.setEdges([]),e.setGroups([]),e.setNodes([]),e.setNodes(o.getNodes()),e.setGroups(o.getGroups()),e.setEdges(o.getLinks()),e.renderNow(),e.fitView(32),e.renderNow(),null}const y=s(i(()=>t(()=>import("./mermaid-architecture-block.tsx_mermaid_architecture_block_component_i425TwFjWfw-DZBWbEWf.js"),[],import.meta.url),"s_i425TwFjWfw"));export{k as _auto_CSS,x as _auto_NOTE,h as _auto_SOURCES,w as _auto_TYPES,v as _auto_draw,y as default};
