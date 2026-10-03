import { component$, $, noSerialize, useSignal, useVisibleTask$, type NoSerialize } from '@builder.io/qwik';
import { GrafloriaFlow, type DiagramInstance } from '@grafloria/qwik';
import { importDiagramText } from '@grafloria/element';
import { markReady } from '../ready';
import { mountCodeEditor } from '../code-editor';

/** Mermaid's architecture-beta and block-beta, read by Grafloria: groups as
 *  regions, services placed where their sided lines say, a block grid with
 *  spans and holes, a classic 3-tier application with security down every
 *  layer — laid out, editable, and written back as the same Mermaid.
 *  Pick a type, then edit the source: the drawing re-composes as you type. */
type Kind = 'arch' | 'block' | 'tiers';

const SOURCES: Record<Kind, string> = {
  arch: `architecture-beta
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
    db:R -- L:cache`,
  block: `block-beta
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
    style m fill:#d6d,stroke:#333,stroke-width:4px`,
  tiers: `block-beta
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
    class authn,authz,valid,crypto,audit guard`,
};
const TYPES: [Kind, string][] = [['arch', 'architecture-beta'], ['block', 'block-beta'], ['tiers', '3-tier app']];
const NOTE = 'Real Mermaid syntax, laid out by Grafloria. Edit it — the drawing follows.';

const CSS = `
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
`;

/** Re-compose the canvas from Mermaid text. Returns null when it drew, or the
 *  note to show when the text does not parse (the last drawing then stays). */
function draw(api: DiagramInstance, text: string): string | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let d: any;
  try {
    d = importDiagramText(text).diagram;
  } catch (e: any) {
    return `That text does not parse yet (${e && e.message ? e.message : e}) — the last drawing stays.`;
  }
  api.setEdges([]); api.setGroups([]); api.setNodes([]);
  api.setNodes(d.getNodes()); api.setGroups(d.getGroups()); api.setEdges(d.getLinks());
  api.renderNow();
  api.fitView(32);
  api.renderNow();
  return null;
}

export default component$(() => {
  const type = useSignal<Kind>('arch');
  const text = useSignal(SOURCES.arch.trim());
  const note = useSignal<string | null>(null);
  // The live instance is not data: noSerialize keeps it out of Qwik's state.
  const api = useSignal<NoSerialize<DiagramInstance>>();
  const timer = useSignal(0);

  // The source reads as code — coloured by the gallery's Monaco editor,
  // mounted in an empty host (Qwik leaves a childless element's inside alone).
  // The textarea stays canonical underneath: every edit lands in it as an
  // `input` event (onInput$ below), so the drawing reads the textarea either way.
  const source = useSignal<HTMLTextAreaElement>();
  const editorHost = useSignal<HTMLDivElement>();
  useVisibleTask$(({ cleanup }) => {
    void mountCodeEditor(source.value, { language: 'mermaid', host: editorHost.value });
    cleanup(() => clearTimeout(timer.value));
  });

  /** A tab draws now, not after the typing pause. */
  const show = $((next: Kind) => {
    const src = SOURCES[next].trim();
    type.value = next;
    text.value = src;
    clearTimeout(timer.value);
    if (api.value) note.value = draw(api.value, src);
  });

  return (
    <div>
      <style dangerouslySetInnerHTML={CSS} />
      <div id="mb-bar">
        <span>Mermaid</span>
        <span class="seg" id="mb-type" role="group" aria-label="Mermaid diagram type">
          {TYPES.map(([t, label]) => (
            <button key={t} type="button" data-type={t} class={type.value === t ? 'on' : ''}
              aria-pressed={type.value === t ? 'true' : 'false'} onClick$={() => show(t)}>{label}</button>
          ))}
        </span>
        <span id="mb-note" role="status" class={note.value ? 'err' : ''}>{note.value ?? NOTE}</span>
      </div>
      <div id="mb-canvas">
        <GrafloriaFlow defaultNodes={[]} defaultEdges={[]} onInit$={$((instance: DiagramInstance) => {
          api.value = noSerialize(instance);
          instance.getEngine().setInteractionConfig({ portVisibility: 'hidden' as never });
          note.value = draw(instance, text.value);
          markReady();
        })} />
      </div>
      <div id="mb-code">
        <div ref={editorHost} style={{ display: 'none', height: '100%' }} />
        <textarea id="mb-src" ref={source} value={text.value} spellcheck={false} aria-label="Mermaid source"
          onInput$={(_, el) => {
            // An edit re-draws after a 300 ms typing pause.
            text.value = el.value;
            clearTimeout(timer.value);
            timer.value = window.setTimeout(() => {
              if (api.value) note.value = draw(api.value, source.value?.value ?? el.value);
            }, 300);
          }} />
      </div>
    </div>
  );
});
