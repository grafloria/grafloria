import{_ as B}from"./preload-helper-D57DdDQb.js";import{y as H,L as q}from"./core.min-C7M5tFMw.js";const _={trigger:{glyph:"▶",sub:"Trigger"},http:{glyph:"🌐",sub:"HTTP Request"},set:{glyph:"✏️",sub:"Edit Fields"},code:{glyph:"{}",sub:"Code",mono:!0},merge:{glyph:"🔀",sub:"Merge"},if:{glyph:"⋔",sub:"If"},ai:{glyph:"🤖",sub:"AI Agent"},sheet:{glyph:"📊",sub:"Spreadsheet File"},notify:{glyph:"🔔",sub:"Send Message"}},V=(d,e,t,n,s={})=>({tag:"div",className:"n8n-card cat-"+d+(s.dangling?" dangling":"")+(s.status&&s.status!=="idle"?" st-"+s.status:"")+(s.flash?" st-flash":""),children:[{tag:"div",className:"n8n-badge"+(s.mono?" mono":""),text:e},{tag:"div",className:"n8n-body",children:[{tag:"div",className:"n8n-title",text:t},{tag:"div",className:"n8n-sub",text:n}]},...s.status==="completed"?[{tag:"div",className:"n8n-status ok",text:"✓"}]:s.status==="error"?[{tag:"div",className:"n8n-status err",text:"!"}]:s.status==="running"?[{tag:"div",className:"n8n-spin"}]:[]]}),g=(d,e,t,n,s,o,i,a,c,u,r={})=>({id:d,position:{x:e,y:t},size:{width:n,height:s},metadata:{html:{content:V(o,i,a,c,r),padding:0}},shape:{type:"rect",fill:"none",stroke:"none"},style:{fill:"transparent",stroke:"transparent",strokeWidth:0},ports:u}),P={shape:"circle",size:10},f=d=>({id:d+"_in",side:"left",type:"input",shape:P}),b=d=>({id:d+"_out",side:"right",type:"output",shape:P}),m=(d,e,t,n,s,o)=>({id:d,side:e,type:s,shape:P,layout:{strategy:"absolute",args:{units:"px",x:t,y:n}},...o?{label:{text:o,layout:"outside",offset:8,fontSize:11,fontWeight:600,noNudge:!0,className:"ai-port-label"}}:{}}),W="#9aa2b1",C="#8b5cf6",z="#16a34a",D="#dc2626",F=()=>({stroke:W,strokeWidth:2,arrowHead:{type:"arrow",size:8,filled:!0}}),M=()=>({stroke:C,strokeWidth:2,strokeDasharray:"2 5",arrowHead:{type:"none"}}),x=(d,e,t,n,s)=>({id:d,source:e,target:n,sourceHandle:t,targetHandle:s,type:"bezier",style:F()}),A=(d,e,t,n,s)=>({id:d,source:e,target:n,sourceHandle:t,targetHandle:s,type:"bezier",style:M()}),R=(d,e,t,n,s,o)=>({id:d,source:"ifNode",target:t,sourceHandle:e,targetHandle:n,type:"bezier",label:o,style:{stroke:s,strokeWidth:2,arrowHead:{type:"arrow",size:8,filled:!0}}}),G=()=>({nodes:[g("start",40,180,180,64,"trigger","▶","On Start","Trigger",[b("start")]),g("login",280,180,200,64,"http","🌐","Login to PAMS","HTTP Request",[f("login"),b("login")]),g("setToken",540,180,200,64,"set","✏️","Set Bearer Token","Edit Fields",[f("setToken"),b("setToken")]),g("getBranches",800,80,200,64,"http","🌐","Get Branches","HTTP Request",[f("getBranches"),b("getBranches")]),g("getVendors",800,290,200,64,"http","🌐","Get Vendors","HTTP Request",[f("getVendors"),b("getVendors")]),g("merge",1070,180,180,64,"merge","🔀","Merge Lookups","Merge",[m("merge_in1","left",0,20,"input"),m("merge_in2","left",0,44,"input"),b("merge")]),g("store",1310,180,200,64,"code","{}","Store Lookup Data","Code",[f("store"),b("store")],{mono:!0}),g("agent",1570,168,210,88,"ai","🤖","AI Quality Agent","AI Agent",[f("agent"),b("agent"),m("agent_model","bottom",46,88,"input","Model"),m("agent_memory","bottom",105,88,"input","Memory"),m("agent_tool","bottom",164,88,"input","Tool")]),g("model",1450,390,168,58,"ai","🧠","Azure OpenAI","Chat Model",[m("model_aiout","top",84,0,"output")]),g("memory",1628,390,168,58,"ai","💾","MongoDB Memory","Memory",[m("memory_aiout","top",84,0,"output")]),g("tool",1806,390,168,58,"ai","🔧","Calendar Tool","Tool",[m("tool_aiout","top",84,0,"output")]),g("ifNode",1840,180,180,64,"if","⋔","All Inquiries Done?","If",[f("ifNode"),m("if_true","right",180,20,"output"),m("if_false","right",180,44,"output")]),g("excel",2090,80,200,64,"sheet","📊","Write Summary","Spreadsheet File",[f("excel"),b("excel")]),g("wait",2090,290,200,64,"set","⏳","Wait & Retry","No-Op",[f("wait")]),g("slack",2350,80,200,64,"notify","🔔","Send Slack Alert","drag a wire to me",[f("slack"),b("slack")],{dangling:!0})],edges:[x("e_start_login","start","start_out","login","login_in"),x("e_login_set","login","login_out","setToken","setToken_in"),x("e_set_branches","setToken","setToken_out","getBranches","getBranches_in"),x("e_set_vendors","setToken","setToken_out","getVendors","getVendors_in"),x("e_branches_merge","getBranches","getBranches_out","merge","merge_in1"),x("e_vendors_merge","getVendors","getVendors_out","merge","merge_in2"),x("e_merge_store","merge","merge_out","store","store_in"),x("e_store_agent","store","store_out","agent","agent_in"),x("e_agent_if","agent","agent_out","ifNode","ifNode_in"),R("if_true_excel","if_true","excel","excel_in",z,"true"),R("if_false_wait","if_false","wait","wait_in",D,"false"),A("ai_model","model","model_aiout","agent","agent_model"),A("ai_memory","memory","memory_aiout","agent","agent_memory"),A("ai_tool","tool","tool_aiout","agent","agent_tool")]}),v={start:"trigger",login:"http",setToken:"set",getBranches:"http",getVendors:"http",merge:"merge",store:"code",agent:"ai",model:"ai-model",memory:"ai-memory",tool:"ai-tool",ifNode:"if",excel:"sheet",wait:"noop",slack:"notify"},y={start:{cat:"trigger",glyph:"▶",sub:"Trigger"},login:{cat:"http",glyph:"🌐",sub:"HTTP Request"},setToken:{cat:"set",glyph:"✏️",sub:"Edit Fields"},getBranches:{cat:"http",glyph:"🌐",sub:"HTTP Request"},getVendors:{cat:"http",glyph:"🌐",sub:"HTTP Request"},merge:{cat:"merge",glyph:"🔀",sub:"Merge"},store:{cat:"code",glyph:"{}",sub:"Code",mono:!0},agent:{cat:"ai",glyph:"🤖",sub:"AI Agent"},model:{cat:"ai",glyph:"🧠",sub:"Chat Model"},memory:{cat:"ai",glyph:"💾",sub:"Memory"},tool:{cat:"ai",glyph:"🔧",sub:"Tool"},ifNode:{cat:"if",glyph:"⋔",sub:"If"},excel:{cat:"sheet",glyph:"📊",sub:"Spreadsheet File"},wait:{cat:"set",glyph:"⏳",sub:"No-Op"},slack:{cat:"notify",glyph:"🔔",sub:"Send Message"}},$={start:"On Start",login:"Login to PAMS",setToken:"Set Bearer Token",getBranches:"Get Branches",getVendors:"Get Vendors",merge:"Merge Lookups",store:"Store Lookup Data",agent:"AI Quality Agent",model:"Azure OpenAI",memory:"MongoDB Memory",tool:"Calendar Tool",ifNode:"All Inquiries Done?",excel:"Write Summary",wait:"Wait & Retry",slack:"Send Slack Alert"},L={trigger:()=>({}),http:d=>d==="login"?{method:"POST",url:"https://pams.example/api/login",auth:"None"}:d==="getBranches"?{method:"GET",url:"https://pams.example/api/branches",auth:"Bearer Token"}:d==="getVendors"?{method:"GET",url:"https://pams.example/api/vendors?state=all",auth:"Bearer Token"}:{method:"GET",url:"https://api.example.com/data",auth:"None"},set:d=>d==="wait"?{fields:[{name:"retryAfter",value:"600"}]}:{fields:[{name:"authorization",value:"Bearer {{ $json.token }}"},{name:"source",value:"pams"}]},code:()=>({mode:"Run Once for All Items",code:`// annotate each merged lookup row
return items.map((it) => ({
  ...it.json,
  storedAt: "lookup_cache",
}));`}),merge:()=>({mode:"Append",inputs:2}),if:()=>({value1:"{{ $json.allDone }}",operation:"is true",value2:""}),ai:()=>({prompt:"Review the merged branch + vendor lookups and decide whether every inquiry is resolved.",model:"gpt-5.5",temperature:.2}),"ai-model":()=>({deployment:"gpt-5.5",apiVersion:"v1"}),"ai-memory":()=>({collection:"agent_memory",contextWindow:10}),"ai-tool":()=>({description:"Look up the on-call calendar for a branch."}),sheet:()=>({operation:"Write to file",file:"quality-summary.xlsx"}),noop:()=>({amount:10,unit:"seconds"}),notify:()=>({channel:"#it-ops",text:"Quality run finished: {{ $json.verdict }}"})},j={start:3,login:341,setToken:12,getBranches:512,getVendors:387,merge:24,store:56,agent:1240,ifNode:9,excel:96,wait:11,slack:74},U={trigger:"Trigger",http:"HTTP Request",set:"Edit Fields",code:"Code",merge:"Merge",if:"If",ai:"AI Agent","ai-model":"Chat Model","ai-memory":"Memory","ai-tool":"Tool",sheet:"Spreadsheet File",noop:"No-Op",notify:"Send Message"},E={trigger:"#10b981",http:"#0ea5e9",set:"#6366f1",code:"#475569",merge:"#06b6d4",if:"#f97316",ai:"#8b5cf6",sheet:"#22a565",notify:"#ec4899"},K=(d,e)=>{const t=(/\$json\.(\w+)/.exec(e.value1||"")||[])[1],n=a=>t?a[t]:e.value1,s=a=>{switch(e.operation){case"is true":return a===!0;case"is false":return a===!1;case"equals":return String(a)===String(e.value2);case"not equals":return String(a)!==String(e.value2);case"larger":return Number(a)>Number(e.value2);default:return!!a}},o=[],i=[];for(const a of d)(s(n(a))?o:i).push(a);return{t:o,f:i}};class Q{constructor(){this.titles={...$},this.PARAMS={},this.SETTINGS={},this.flash=new Set,this.RS={seq:0,status:new Map,data:new Map,branchOut:new Map,executed:[],log:[],running:null},this.hudText="",this.readout="idle",this.logsOpen=!1,this.logRows=[],this.logStatusText="idle",this.logStatusCls="",this.failArmed=!1,this.runActive=!1,this.paused=!1,this.ndvOpen=!1,this.ndvOpenId=null,this.ndvBadge="⚙",this.ndvBadgeBg="#667",this.ndvName="",this.ndvKind="",this.ndvTab="params",this.ndvFields=[],this.ndvInput={count:""},this.ndvOutput={count:""},this.palItems=["http","set","code","if","merge","ai"].map(e=>({kind:e,glyph:_[e].glyph,sub:_[e].sub,mono:!!_[e].mono,bg:E[e]})),this.runToken=0,this.pauseWaiters=[],this.pendingSteps=0,this.wakeSleep=null,this.added=0,this.DARK_MQ=window.matchMedia("(prefers-color-scheme: dark)"),this.bump=()=>{},this.PILL="wire-pill"}init(e){if(this.api=e,this.engine=e.getEngine?.(),this.model=e.getModel?.()??this.engine?.getDiagram?.(),!this.model)return!1;this.engine?.setInteractionConfig?.({portVisibility:"always"});try{const t=this.model.getLODConfig(),n=new Set;for(const s of t.tiers)for(const o of s.features)n.add(o);for(const s of t.tiers)for(const o of n)s.features.add(o);this.model.setLODConfig(t)}catch{}for(const t of Object.keys(v))this.PARAMS[t]=L[v[t]](t),this.SETTINGS[t]=this.defSettings();for(const t of this.model.getLinks())this.clearPill(t);return this.updateHud(),this.api.fitView?.(46),this.DARK_MQ.addEventListener?.("change",()=>{for(const t of this.model.getLinks()){const n=t.labels.findIndex(s=>s.id===this.PILL);n!==-1&&t.updateLabel(n,{style:this.pillStyle()})}}),this.model.on?.("link:added",()=>setTimeout(()=>{this.restyleLinks(),this.updateHud()},0)),!0}defSettings(){return{notes:"",retryOnFail:!1,continueOnFail:!1,executeOnce:!1}}isMain(e){return!/agent_(model|memory|tool)|_aiout/.test(`${e.sourcePortId} ${e.targetPortId}`)}srcOf(e){return this.model.getNodeByPortId(e.sourcePortId)?.id}tgtOf(e){return this.model.getNodeByPortId(e.targetPortId)?.id}styleFor(e){return e.sourcePortId==="if_true"?{stroke:z,strokeWidth:2,arrowHead:{type:"arrow",size:8,filled:!0}}:e.sourcePortId==="if_false"?{stroke:D,strokeWidth:2,arrowHead:{type:"arrow",size:8,filled:!0}}:this.isMain(e)?F():M()}baseLabel(e){return e.sourcePortId==="if_true"?"true":e.sourcePortId==="if_false"?"false":""}pillStyle(){return this.DARK_MQ.matches?{fontSize:11,fontWeight:"600",color:"#e7e9f0",background:"#262733",border:"#3a3c49",padding:5,borderRadius:9}:{fontSize:11,fontWeight:"600",color:"#3c4254",background:"#ffffff",border:"#d6dae4",padding:5,borderRadius:9}}setWirePill(e,t){const n=e.labels.findIndex(s=>s.id===this.PILL);if(!t){n!==-1&&e.removeLabel(this.PILL);return}n!==-1?e.updateLabel(n,{text:t,style:this.pillStyle()}):e.addLabel({id:this.PILL,text:t,position:.5,offset:{x:0,y:0},style:this.pillStyle()})}setPill(e,t){const n=this.baseLabel(e);this.setWirePill(e,t>0?(n?n+" · ":"")+t+(t===1?" item":" items"):n)}clearPill(e){this.setWirePill(e,this.baseLabel(e))}pillsFrom(e){const t=this.RS.data.get(e);if(!t)return;const n=this.RS.branchOut.get(e);for(const s of this.model.getLinks())!this.isMain(s)||this.srcOf(s)!==e||this.setPill(s,n?(n[s.sourcePortId]??[]).length:t.output.length)}setEdgesRun(e,t){for(const n of this.model.getLinks())!this.isMain(n)||this.tgtOf(n)!==e||n.updateStyle({...this.styleFor(n),animation:t?{type:"flow",speed:"fast",direction:"forward"}:{type:"none"}})}setAgentFlash(e,t){if(/^agent$/.test(e)){for(const n of["model","memory","tool"])t?this.flash.add(n):this.flash.delete(n),this.paintNode(n);for(const n of this.model.getLinks())this.isMain(n)||n.updateStyle({...M(),animation:t?{type:"dash-flow",speed:"fast",direction:"forward"}:{type:"none"}})}}paintNode(e){const t=this.model.getNode(e),n=y[e];if(!t||!n)return;const s=this.RS.status.get(e)||"idle",o=e==="slack"&&!this.model.getLinks().some(i=>this.isMain(i)&&this.tgtOf(i)==="slack");t.setMetadata("html",{content:V(n.cat,n.glyph,this.titles[e]??e,o?"drag a wire to me":n.sub,{mono:n.mono,dangling:o,status:s,flash:this.flash.has(e)}),padding:0})}paintStatus(e,t){this.RS.status.set(e,t),this.paintNode(e)}restyleLinks(){for(const e of this.model.getLinks())e.updateStyle(this.styleFor(e));this.paintNode("slack")}updateHud(){this.hudText=`${this.model.getNodes().length} nodes · ${this.model.getLinks().length} wires`,this.bump()}setLogsOpen(e){this.logsOpen=e,this.bump()}setLogStatus(e,t=""){this.logStatusText=e,this.logStatusCls=t,this.bump()}pushLog(e,t,n,s,o,i=""){this.RS.log.push({title:this.titles[e]??e,sub:(y[e]||{}).sub||"",status:t,ms:n,nIn:s,nOut:o,note:i}),this.logRows=[...this.RS.log],this.bump()}buildWalk(e=null,t=!1){const n=this.model.getLinks().filter(l=>this.isMain(l)),s=new Map,o=new Map;for(const l of n){const p=this.srcOf(l),h=this.tgtOf(l);!p||!h||((s.get(p)??s.set(p,[]).get(p)).push(h),(o.get(h)??o.set(h,[]).get(h)).push(p))}const i=new Set,a=this.model.getNode("start")?["start"]:[];for(;a.length;){const l=a.shift();if(!i.has(l)){i.add(l);for(const p of s.get(l)||[])a.push(p)}}let c=i;if(e){c=new Set;const l=[e];for(;l.length;){const p=l.shift();if(!(c.has(p)||!i.has(p))){c.add(p);for(const h of o.get(p)||[])l.push(h)}}t&&c.delete(e)}const u=new Map;for(const l of c)u.set(l,0);for(const l of n){const p=this.srcOf(l),h=this.tgtOf(l);c.has(p)&&c.has(h)&&u.set(h,(u.get(h)||0)+1)}const r=[],k=[...c].filter(l=>u.get(l)===0);for(;k.length;){const l=k.shift();r.push(l);for(const p of s.get(l)||[])c.has(p)&&(u.set(p,u.get(p)-1),u.get(p)===0&&k.push(p))}return r}gatherInputs(e){const t=[];for(const n of this.model.getLinks()){if(!this.isMain(n)||this.tgtOf(n)!==e)continue;const s=this.srcOf(n);if(!s||!this.RS.data.has(s))continue;const o=this.RS.branchOut.get(s);t.push(...o?o[n.sourcePortId]??[]:this.RS.data.get(s).output)}return t}simOutput(e,t){const n=this.PARAMS[e]||{};switch(e){case"start":return[{trigger:"manual",run:this.RS.seq}];case"login":return[{token:"pams.7f3d1c",expiresIn:3600}];case"setToken":return t.map(s=>({...s,authorization:"Bearer pams.7f3d1c"}));case"getBranches":return["Cairo HQ","Alexandria","Giza Plant","Mansoura"].map((s,o)=>({branchId:101+o,name:s}));case"getVendors":{const s=this.RS.seq%2===1?0:2;return[{vendorId:"V-201",vendor:"Nile Supplies",pendingInquiries:0},{vendorId:"V-202",vendor:"Delta Tools",pendingInquiries:s},{vendorId:"V-203",vendor:"Suez Freight",pendingInquiries:0}]}case"store":return t.map(s=>({...s,storedAt:"lookup_cache"}));case"agent":{const s=t.reduce((o,i)=>o+(i.pendingInquiries||0),0);return[{verdict:s===0?"all inquiries resolved":`${s} inquiries still open`,openInquiries:s,allDone:s===0}]}case"excel":return[{file:n.file||"summary.xlsx",rows:t.length,written:!0}];case"slack":return[{channel:n.channel||"#it-ops",sent:!0}]}switch(v[e]){case"http":return[{status:200,url:n.url},{status:200,page:2}];case"ai":return[{response:"ok"}];default:return t.length?t:[{}]}}gateSleep(e){return new Promise(t=>{const n=setTimeout(()=>{this.wakeSleep=null,t()},e);this.wakeSleep=()=>{clearTimeout(n),this.wakeSleep=null,t()}})}pokeGate(){this.wakeSleep&&this.wakeSleep()}releaseGate(e){if(e){this.pendingSteps=0;for(const n of this.pauseWaiters.splice(0))n();return}const t=this.pauseWaiters.splice(0,1);t.length?t[0]():(this.pendingSteps+=1,this.pokeGate())}async stepGate(e){if(this.paused||await this.gateSleep(e),!!this.paused){if(this.pendingSteps>0){this.pendingSteps-=1;return}await new Promise(t=>this.pauseWaiters.push(t))}}setPaused(e){if(!this.runActive)return;this.paused=e;const t=this.RS.running;e?this.readout=`paused at: ${t?this.titles[t]:"—"} — ▶ continue or step ▸`:(t&&(this.readout=`running: ${this.titles[t]}`),this.releaseGate(!0)),this.bump()}reset(){this.runToken+=1,this.paused=!1,this.runActive=!1,this.releaseGate(!0),this.pokeGate(),this.RS.status.clear(),this.RS.data.clear(),this.RS.branchOut.clear(),this.RS.executed=[],this.RS.log=[],this.RS.running=null,this.flash.clear(),this.logRows=[];for(const e of Object.keys(y))this.paintNode(e);for(const e of this.model.getLinks())this.clearPill(e),e.updateStyle({...this.styleFor(e),animation:{type:"none"}});this.setLogStatus("idle",""),this.readout="idle",this.ndvOpenId&&this.refreshNDVData(),this.api.renderNow?.(),this.bump()}async execute({stepMs:e=480,upTo:t=null,exclusive:n=!1,startPaused:s=!1}={}){this.reset();const o=this.runToken;this.RS.seq+=1,this.runActive=!0,this.paused=!!s,this.setLogsOpen(!0),this.setLogStatus("Running…","");try{const i=this.buildWalk(t,n);if(!i.length)return this.readout=t?"not connected to the trigger":"no trigger node",this.setLogStatus(this.readout,"err"),{executed:[],failed:null,aborted:!1};for(const r of i)this.model.getNode(r)&&this.paintStatus(r,"pending");this.api.renderNow?.(),this.bump();let a=null,c=0;for(const r of i){if(!this.model.getNode(r))continue;const k=this.model.getLinks().some(T=>this.isMain(T)&&this.tgtOf(T)===r),l=this.gatherInputs(r);if(k&&l.length===0)continue;if(this.RS.running=r,this.paintStatus(r,"running"),this.setEdgesRun(r,!0),this.setAgentFlash(r,!0),this.readout=this.paused?`paused at: ${this.titles[r]} — ▶ continue or step ▸`:`running: ${this.titles[r]}`,this.api.renderNow?.(),this.bump(),await this.stepGate(e),o!==this.runToken)return{executed:[],failed:null,aborted:!0};this.paused&&(this.readout=`paused at: ${this.titles[r]} — ▶ continue or step ▸`);const p=this.SETTINGS[r]||this.defSettings(),h=p.executeOnce?l.slice(0,1):l;let O=this.failArmed&&r==="getVendors",w=j[r]??45,N="",I="completed",S;if(O&&p.retryOnFail&&(O=!1,w=w*2+210,N=" · retried ×1"),O?(I="error",S=p.continueOnFail?[{error:"PAMS vendor API: 502 Bad Gateway"}]:[],p.continueOnFail?N=" · continued":a=r):S=this.simOutput(r,h),r==="ifNode"&&I==="completed"){const T=K(S,this.PARAMS.ifNode||{});this.RS.branchOut.set(r,{if_true:T.t,if_false:T.f})}if(this.RS.data.set(r,{input:h,output:S,ms:w}),this.RS.executed.push(r),c+=w,this.setEdgesRun(r,!1),this.setAgentFlash(r,!1),this.paintStatus(r,I),this.pillsFrom(r),this.pushLog(r,I,w,h.length,S.length,N),this.api.renderNow?.(),a)break}this.RS.running=null;for(const r of i)this.RS.status.get(r)==="pending"&&this.paintStatus(r,"idle");const u=(c/1e3).toFixed(2);return a?(this.readout=`✗ failed at: ${this.titles[a]} — downstream never ran`,this.setLogStatus(`Error after ${u}s — halted at ${this.titles[a]}`,"err")):(this.readout=t?`✓ ran up to: ${this.titles[t]??t}`:"✓ workflow ran successfully",this.setLogStatus(`Success in ${u}s · ${this.RS.executed.length} nodes`,"ok")),this.ndvOpenId&&this.refreshNDVData(),this.api.renderNow?.(),{executed:[...this.RS.executed],failed:a,aborted:!1}}finally{o===this.runToken&&(this.runActive=!1,this.paused=!1,this.RS.running=null),this.bump()}}onRun(){this.runActive||this.execute()}onPause(){this.setPaused(!this.paused)}onStep(){this.runActive&&this.paused?this.releaseGate(!1):this.runActive||this.execute({startPaused:!0,stepMs:250})}onReset(){this.reset()}onToggleLogs(){this.setLogsOpen(!this.logsOpen)}onCloseLogs(){this.setLogsOpen(!1)}onToggleFail(){this.failArmed=!this.failArmed,this.bump()}get stepDisabled(){return this.runActive&&!this.paused}paramFields(e){switch(v[e]){case"trigger":return[{type:"note",text:'When you press "▶ Test workflow", this trigger emits one item and the run begins. Triggers have no parameters here.'}];case"http":return[{type:"select",key:"method",label:"Method",options:["GET","POST","PUT","DELETE"]},{type:"text",key:"url",label:"URL"},{type:"select",key:"auth",label:"Authentication",options:["None","Basic Auth","Header Auth","Bearer Token"]}];case"set":return[{type:"set-fields"}];case"code":return[{type:"select",key:"mode",label:"Mode",options:["Run Once for All Items","Run Once for Each Item"]},{type:"textarea",key:"code",label:"JavaScript",code:!0}];case"merge":return[{type:"select",key:"mode",label:"Mode",options:["Append","Combine","Choose Branch"]},{type:"number",key:"inputs",label:"Number of inputs"}];case"if":return[{type:"text",key:"value1",label:"Value 1"},{type:"select",key:"operation",label:"Operation",options:["is true","is false","equals","not equals","larger"]},{type:"text",key:"value2",label:"Value 2"}];case"ai":return[{type:"textarea",key:"prompt",label:"Prompt (system message)"},{type:"select",key:"model",label:"Model",options:["gpt-5.5","gpt-4.1","o4-mini"]},{type:"number",key:"temperature",label:"Temperature"}];case"ai-model":return[{type:"text",key:"deployment",label:"Deployment"},{type:"text",key:"apiVersion",label:"API version"}];case"ai-memory":return[{type:"text",key:"collection",label:"Collection"},{type:"number",key:"contextWindow",label:"Context window"}];case"ai-tool":return[{type:"textarea",key:"description",label:"Tool description"}];case"sheet":return[{type:"select",key:"operation",label:"Operation",options:["Write to file","Append to file"]},{type:"text",key:"file",label:"File name"}];case"noop":return[{type:"number",key:"amount",label:"Wait amount"},{type:"select",key:"unit",label:"Unit",options:["seconds","minutes","hours"]}];case"notify":return[{type:"text",key:"channel",label:"Channel"},{type:"textarea",key:"text",label:"Message"}];default:return[{type:"note",text:"This node has no parameters."}]}}paramVal(e){return this.ndvOpenId?this.PARAMS[this.ndvOpenId]?.[e]??"":""}onParamInput(e,t,n=!1){this.ndvOpenId&&(this.PARAMS[this.ndvOpenId][e]=n?Number(t):t,this.bump())}get setFields(){return this.ndvOpenId?this.PARAMS[this.ndvOpenId]?.fields??[]:[]}onSetFieldName(e,t){this.setFields[e].name=t,this.bump()}onSetFieldValue(e,t){this.setFields[e].value=t,this.bump()}addSetField(){const e=this.setFields;e.push({name:"field_"+(e.length+1),value:""}),this.ndvFields=[...this.ndvFields],this.bump()}settingVal(e){return this.ndvOpenId?!!this.SETTINGS[this.ndvOpenId]?.[e]:!1}get notesVal(){return this.ndvOpenId?this.SETTINGS[this.ndvOpenId]?.notes??"":""}onSettingToggle(e,t){this.ndvOpenId&&(this.SETTINGS[this.ndvOpenId][e]=t),this.bump()}onNotesInput(e){this.ndvOpenId&&(this.SETTINGS[this.ndvOpenId].notes=e),this.bump()}renderPaneView(e){const t=this.ndvOpenId,n={count:""};if(!t)return n;if(["ai-model","ai-memory","ai-tool"].includes(v[t]))return{count:"",hint:e==="input"?"This sub-node is invoked BY its AI Agent while the agent step runs — it takes no items of its own.":"Sub-nodes produce no items; they answer the agent's calls."};const s=this.RS.data.get(t);let o=s?s[e]:null;if(!o&&e==="input"){const i=this.gatherInputs(t);i.length&&(o=i)}return o?{items:o,count:`${o.length} item${o.length===1?"":"s"}`}:e==="output"?{count:"",hint:'No output data yet — press "▶ Execute step" above to run up to this node.'}:v[t]==="trigger"?{count:"",hint:"The trigger starts the run — it consumes no input items."}:this.model.getLinks().some(i=>this.isMain(i)&&this.tgtOf(i)===t)?{count:"",hint:"No input data yet.",prevBtn:!0}:{count:"",hint:"Wire an input into this node first — it has no incoming connection."}}refreshNDVData(){this.ndvInput=this.renderPaneView("input"),this.ndvOutput=this.renderPaneView("output")}json(e){return JSON.stringify(e,null,1)}openNDV(e){if(!y[e]||!this.model.getNode(e))return;this.ndvOpenId=e;const t=y[e];this.ndvBadge=t.glyph,this.ndvBadgeBg=E[t.cat]||"#667",this.ndvName=this.titles[e]??e,this.ndvKind=U[v[e]]||t.sub,this.ndvTab="params",this.ndvFields=this.paramFields(e),this.refreshNDVData(),this.ndvOpen=!0,this.bump()}closeNDV(){this.ndvOpenId=null,this.ndvOpen=!1,this.bump()}onNdvName(e){this.ndvOpenId&&(this.ndvName=e,this.titles[this.ndvOpenId]=e,this.paintNode(this.ndvOpenId),this.api.renderNow?.(),this.bump())}onNdvExec(){this.ndvOpenId&&!this.runActive&&this.execute({upTo:this.ndvOpenId,stepMs:140})}onExecutePrev(){this.ndvOpenId&&!this.runActive&&this.execute({upTo:this.ndvOpenId,exclusive:!0,stepMs:140})}setTab(e){this.ndvTab=e,this.bump()}onKeydown(e){e.key==="Escape"&&this.ndvOpen&&this.closeNDV()}onDblClick(e,t,n){let s=null,o=1/0;for(const i of Array.from(n.querySelectorAll(".n8n-card"))){const a=i.getBoundingClientRect();if(e<a.left||e>a.right||t<a.top||t>a.bottom)continue;const c=a.width*a.height;if(c>=o)continue;const u=i.closest("[data-node-id]");u&&(s=u.getAttribute("data-node-id"),o=c)}s&&this.openNDV(s)}async addNode(e){const t=_[e],n=60+this.added%3*46,s=470+Math.floor(this.added/3)*24;this.added++;const o=await this.engine.addNode({type:"rect",position:{x:n,y:s},size:{width:200,height:64}});return o.setMetadata("shape",{type:"rect",fill:"none",stroke:"none"}),v[o.id]=e,y[o.id]={cat:e,glyph:t.glyph,sub:t.sub,mono:t.mono},this.titles[o.id]=t.sub,this.PARAMS[o.id]=(L[e]||(()=>({})))(o.id),this.SETTINGS[o.id]=this.defSettings(),this.paintNode(o.id),this.updateHud(),this.api.renderNow?.(),o}static spec(){return G()}}const J=Q.spec(),X=`
#n8n-stage { display: grid; grid-template-columns: 188px 1fr; height: 100vh; min-height: 460px; }
#n8n-palette { border-right: 1px solid rgba(127,127,127,.2); padding: 12px 12px 16px; overflow-y: auto;
  background: #fafbfd; }
#n8n-palette .pal-title { font: 600 10px/1.4 system-ui, sans-serif; letter-spacing: .8px; text-transform: uppercase;
  color: #8a91a2; margin: 2px 2px 10px; }
#n8n-palette .pal-item { display: flex; align-items: center; gap: 9px; width: 100%; margin: 0 0 8px; padding: 7px 9px;
  border: 1px solid #e4e7ee; border-radius: 9px; background: #fff; cursor: pointer; text-align: left;
  font: 500 12.5px/1.2 system-ui, sans-serif; color: #2d2e3a; box-shadow: 0 1px 1px rgba(16,24,40,.04); }
#n8n-palette .pal-item:hover { border-color: #c7ccd8; background: #f7f8fb; }
#n8n-palette .pal-dot { width: 24px; height: 24px; border-radius: 6px; flex: none; display: flex; align-items: center;
  justify-content: center; font-size: 14px; color: #fff; }
#n8n-palette .pal-dot.mono { font: 700 12px/1 ui-monospace, monospace; }
#n8n-canvas { height: 100%; position: relative; overflow: hidden;
  background-color: #f4f5f8;
  background-image: radial-gradient(circle, #d5d9e2 1.1px, transparent 1.1px);
  background-size: 22px 22px; }
/* Only the flow fills the canvas. (The React port's extra "#n8n-canvas > div"
   also matched the HUD, legend, run bar and log — it outranks their own id
   rules and stretched each to 100% height, a white panel over the graph.) */
#n8n-canvas > .grafloria-flow { display: block; height: 100%; }
/* Status badges sit half-out of the card's top-right corner, n8n-style. */
#n8n-canvas foreignObject { overflow: visible; }

/* ---- the node card painted inside each node's foreignObject ------------- */
#n8n-canvas .n8n-card { display: flex; align-items: center; gap: 10px; width: 100%; height: 100%;
  box-sizing: border-box; padding: 0 12px; background: #fff; color: #2d2e3a; position: relative;
  border: 1px solid #dfe2ea; border-left-width: 3px; border-radius: 9px;
  box-shadow: 0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.05); font-family: system-ui, sans-serif; }
#n8n-canvas .n8n-badge { width: 34px; height: 34px; border-radius: 8px; flex: none; display: flex;
  align-items: center; justify-content: center; font-size: 19px; line-height: 1; color: #fff; background: #667; }
#n8n-canvas .n8n-badge.mono { font: 700 15px/1 ui-monospace, monospace; }
#n8n-canvas .n8n-body { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
#n8n-canvas .n8n-title { font-weight: 600; font-size: 13.5px; line-height: 1.15; color: #262a35;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#n8n-canvas .n8n-sub { font-size: 10px; letter-spacing: .4px; text-transform: uppercase; color: #8a91a2;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* Trigger nodes: the signature n8n left-rounded "start" pill. */
#n8n-canvas .n8n-card.cat-trigger { border-radius: 28px 9px 9px 28px; padding-left: 15px; }

/* A half-wired "next step" node — dashed, inviting you to connect it. */
#n8n-canvas .n8n-card.dangling { border-style: dashed; border-color: #b794f4; background: #fbf8ff; }
#n8n-canvas .n8n-card.dangling .n8n-sub { color: #9b6bd6; }

/* Category accents: coloured icon badge + left border, n8n-style. */
#n8n-canvas .cat-trigger .n8n-badge { background: #10b981; } #n8n-canvas .cat-trigger { border-left-color: #10b981; }
#n8n-canvas .cat-http    .n8n-badge { background: #0ea5e9; } #n8n-canvas .cat-http    { border-left-color: #0ea5e9; }
#n8n-canvas .cat-set     .n8n-badge { background: #6366f1; } #n8n-canvas .cat-set     { border-left-color: #6366f1; }
#n8n-canvas .cat-code    .n8n-badge { background: #475569; } #n8n-canvas .cat-code    { border-left-color: #475569; }
#n8n-canvas .cat-merge   .n8n-badge { background: #06b6d4; } #n8n-canvas .cat-merge   { border-left-color: #06b6d4; }
#n8n-canvas .cat-if      .n8n-badge { background: #f97316; } #n8n-canvas .cat-if      { border-left-color: #f97316; }
#n8n-canvas .cat-ai      .n8n-badge { background: #8b5cf6; } #n8n-canvas .cat-ai      { border-left-color: #8b5cf6; }
#n8n-canvas .cat-sheet   .n8n-badge { background: #22a565; } #n8n-canvas .cat-sheet   { border-left-color: #22a565; }
#n8n-canvas .cat-notify  .n8n-badge { background: #ec4899; } #n8n-canvas .cat-notify  { border-left-color: #ec4899; }

/* ---- EXECUTION affordances (the n8n run language) ----------------------- */
#n8n-canvas .n8n-card.st-pending { opacity: .42; }
#n8n-canvas .n8n-card.st-running { border-color: #ff6d5a; border-left-color: #ff6d5a;
  box-shadow: 0 0 0 2.5px rgba(255,109,90,.28), 0 2px 8px rgba(255,109,90,.18); }
#n8n-canvas .n8n-card.st-error { border-color: #ea1f30; border-left-color: #ea1f30;
  box-shadow: 0 0 0 2px rgba(234,31,48,.18); }
#n8n-canvas .n8n-card.st-flash { border-color: #8b5cf6;
  box-shadow: 0 0 0 2.5px rgba(139,92,246,.3), 0 2px 10px rgba(139,92,246,.25); }
#n8n-canvas .n8n-status { position: absolute; top: -8px; right: -8px; width: 17px; height: 17px;
  border-radius: 50%; display: flex; align-items: center; justify-content: center;
  font: 700 10.5px/1 system-ui, sans-serif; color: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.28); }
#n8n-canvas .n8n-status.ok  { background: #2ea56e; }
#n8n-canvas .n8n-status.err { background: #ea1f30; }
#n8n-canvas .n8n-spin { position: absolute; top: -9px; right: -9px; width: 18px; height: 18px;
  box-sizing: border-box; border-radius: 50%; background: #fff;
  border: 3px solid rgba(255,109,90,.25); border-top-color: #ff6d5a;
  animation: n8nspin .7s linear infinite; }
@keyframes n8nspin { to { transform: rotate(360deg); } }

/* ---- the floating run bar (n8n's bottom-centre "Test workflow") --------- */
#n8n-runbar { position: absolute; left: 50%; transform: translateX(-50%); bottom: 14px; z-index: 6;
  display: flex; gap: 7px; align-items: center; background: rgba(255,255,255,.96);
  border: 1px solid #dfe2ea; border-radius: 12px; padding: 8px 10px;
  box-shadow: 0 6px 22px rgba(15,23,42,.16); }
#n8n-canvas.logs-open #n8n-runbar { bottom: 200px; }
#n8n-runbar #btn-run { background: #ff6d5a; color: #fff; border: none; font: 600 13px/1.2 system-ui, sans-serif;
  padding: 8px 14px; border-radius: 8px; cursor: pointer; }
#n8n-runbar #btn-run:hover { background: #f75e4a; }
#n8n-runbar #btn-run:disabled { opacity: .55; cursor: default; }
#n8n-runbar .rb { padding: 7px 10px; border: 1px solid #d6dae4; background: #fff; border-radius: 8px;
  cursor: pointer; font: 500 12px/1.2 system-ui, sans-serif; color: #3c4254; }
#n8n-runbar .rb:hover { border-color: #b9bfce; }
#n8n-runbar .rb:disabled { opacity: .45; cursor: default; }
#n8n-runbar .rb[aria-pressed="true"] { background: #fdece9; border-color: #ff6d5a; color: #c2402f; }
#n8n-runbar #run-readout { font: 11px/1.3 ui-monospace, monospace; color: #6a7183; min-width: 76px; max-width: 200px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* ---- the execution log panel (n8n's bottom Logs view) ------------------- */
#n8n-runlog { position: absolute; left: 0; right: 0; bottom: 0; height: 186px; z-index: 5;
  background: rgba(255,255,255,.97); border-top: 1px solid #dfe2ea; display: flex;
  flex-direction: column; box-shadow: 0 -8px 24px rgba(15,23,42,.09); }
#n8n-runlog[hidden] { display: none; }
#n8n-runlog .rl-head { display: flex; gap: 10px; align-items: center; padding: 7px 14px;
  border-bottom: 1px solid #eceef4; font: 600 10px/1.4 system-ui, sans-serif;
  letter-spacing: .7px; text-transform: uppercase; color: #7c8296; }
#n8n-runlog #rl-status { text-transform: none; letter-spacing: 0; font: 500 11.5px/1.3 system-ui, sans-serif; color: #6a7183; }
#n8n-runlog #rl-status.ok { color: #218358; } #n8n-runlog #rl-status.err { color: #c11626; }
#n8n-runlog #rl-close { margin-left: auto; border: none; background: transparent; color: #8a91a2;
  font-size: 15px; cursor: pointer; padding: 0 2px; }
#n8n-runlog .rl-rows { overflow: auto; flex: 1; }
#n8n-runlog .rl-row { display: grid; grid-template-columns: 14px minmax(140px,1.2fr) minmax(90px,1fr) 110px 110px;
  gap: 10px; align-items: center; padding: 4px 14px; border-bottom: 1px dashed #eef0f5;
  font: 11.5px/1.5 ui-monospace, monospace; color: #3c4254; }
#n8n-runlog .rl-dot { width: 8px; height: 8px; border-radius: 50%; background: #2ea56e; }
#n8n-runlog .rl-dot.err { background: #ea1f30; }
#n8n-runlog .rl-name { font-family: system-ui, sans-serif; font-weight: 600; font-size: 12px; color: #2d2e3a;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#n8n-runlog .rl-sub { color: #8a91a2; font-size: 10px; text-transform: uppercase; letter-spacing: .4px;
  font-family: system-ui, sans-serif; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#n8n-runlog .rl-ms { text-align: right; color: #6a7183; }

/* ---- the NDV (Node Details View) — n8n's input | parameters | output ---- */
#n8n-ndv { position: fixed; inset: 0; z-index: 40; display: flex; align-items: center; justify-content: center; }
#n8n-ndv[hidden] { display: none; }
#n8n-ndv .ndv-back { position: absolute; inset: 0; background: rgba(22,23,32,.62); }
#n8n-ndv .ndv-modal { position: relative; width: min(1150px, 94vw); height: min(660px, 88vh); background: #f4f5f9;
  border-radius: 12px; overflow: hidden; display: flex; flex-direction: column;
  box-shadow: 0 24px 80px rgba(0,0,0,.45); font-family: system-ui, sans-serif; }
#n8n-ndv .ndv-head { display: flex; align-items: center; gap: 10px; background: #2b2c39; color: #eceef4;
  padding: 9px 14px; flex: none; }
#n8n-ndv .ndv-head .hd-badge { width: 30px; height: 30px; border-radius: 7px; flex: none; display: flex;
  align-items: center; justify-content: center; font-size: 16px; color: #fff; background: #667; }
#n8n-ndv #ndv-name { background: transparent; border: 1px solid transparent; color: inherit;
  font: 600 15px/1.3 system-ui, sans-serif; padding: 4px 8px; border-radius: 6px; min-width: 240px; }
#n8n-ndv #ndv-name:hover, #n8n-ndv #ndv-name:focus { border-color: #4a4c5e; background: #232430; outline: none; }
#n8n-ndv .ndv-head .hd-kind { font-size: 10.5px; letter-spacing: .5px; text-transform: uppercase; color: #8a90a6; }
#n8n-ndv #ndv-exec { margin-left: auto; background: #ff6d5a; color: #fff; border: none; border-radius: 8px;
  padding: 8px 14px; font: 600 12.5px/1.2 system-ui, sans-serif; cursor: pointer; }
#n8n-ndv #ndv-exec:hover { background: #f75e4a; }
#n8n-ndv #ndv-exec:disabled { opacity: .5; cursor: default; }
#n8n-ndv #ndv-close { background: transparent; color: #9aa0b4; border: none; font-size: 20px; cursor: pointer; padding: 0 4px; }
#n8n-ndv #ndv-close:hover { color: #fff; }
#n8n-ndv .ndv-body { flex: 1; display: grid; grid-template-columns: 1fr 1.18fr 1fr; min-height: 0; }
#n8n-ndv .ndv-pane { display: flex; flex-direction: column; min-height: 0; background: #eef0f6; border-right: 1px solid #e0e3ec; }
#n8n-ndv .ndv-pane.out { border-right: none; border-left: 1px solid #e0e3ec; }
#n8n-ndv .ndv-pane-head { font: 600 10px/1.4 system-ui, sans-serif; letter-spacing: .7px; text-transform: uppercase;
  padding: 10px 12px 8px; color: #7c8296; display: flex; justify-content: space-between; }
#n8n-ndv .ndv-items { overflow: auto; padding: 0 10px 12px; flex: 1; display: flex; flex-direction: column; }
#n8n-ndv .ndv-item { background: #fff; border: 1px solid #e2e5ee; border-radius: 8px; margin: 0 0 8px; flex: none; }
#n8n-ndv .ndv-item pre { margin: 0; padding: 7px 10px; font: 10.5px/1.55 ui-monospace, monospace;
  white-space: pre-wrap; word-break: break-word; color: #34394a; }
#n8n-ndv .ndv-hint { margin: auto; text-align: center; color: #8a91a2; font: 12.5px/1.6 system-ui, sans-serif; padding: 18px; }
#n8n-ndv .ndv-hint button { display: block; margin: 10px auto 0; border: 1px solid #ff6d5a; color: #d34a36;
  background: #fff; border-radius: 8px; padding: 7px 12px; font: 600 12px/1.2 system-ui, sans-serif; cursor: pointer; }
#n8n-ndv .ndv-hint button:hover { background: #fdece9; }
#n8n-ndv .ndv-main { background: #fff; display: flex; flex-direction: column; min-height: 0; }
#n8n-ndv .ndv-tabs { display: flex; gap: 2px; padding: 6px 12px 0; border-bottom: 1px solid #eceef4; flex: none; }
#n8n-ndv .ndv-tab { border: none; background: transparent; font: 600 12.5px/1.3 system-ui, sans-serif; color: #7c8296;
  padding: 8px 10px; cursor: pointer; border-bottom: 2px solid transparent; }
#n8n-ndv .ndv-tab.on { color: #ff6d5a; border-bottom-color: #ff6d5a; }
#n8n-ndv #ndv-params, #n8n-ndv #ndv-settings { overflow: auto; padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }
#n8n-ndv .ndv-field label { display: block; font: 600 11px/1.4 system-ui, sans-serif; color: #5b6273; margin-bottom: 4px; }
#n8n-ndv .ndv-field input[type="text"], #n8n-ndv .ndv-field input[type="number"], #n8n-ndv .ndv-field select, #n8n-ndv .ndv-field textarea {
  width: 100%; box-sizing: border-box; font: 12.5px/1.4 system-ui, sans-serif; padding: 7px 9px;
  border: 1px solid #d9dde7; border-radius: 7px; background: #fbfcfe; color: #2d2e3a; }
#n8n-ndv .ndv-field textarea { min-height: 74px; resize: vertical; }
#n8n-ndv .ndv-field textarea.code { font: 11.5px/1.5 ui-monospace, monospace; min-height: 130px; }
#n8n-ndv .ndv-kv { display: grid; grid-template-columns: 1fr 1.4fr; gap: 6px; margin-bottom: 6px; }
#n8n-ndv .ndv-add { align-self: flex-start; border: 1px dashed #c3c9d6; background: transparent; color: #5b6273;
  border-radius: 7px; padding: 6px 10px; font: 600 11.5px/1.2 system-ui, sans-serif; cursor: pointer; }
#n8n-ndv .ndv-check { display: flex; gap: 8px; align-items: center; font: 12.5px/1.4 system-ui, sans-serif; color: #3c4254; }
#n8n-ndv .ndv-note { font: 12px/1.6 system-ui, sans-serif; color: #7c8296; }

/* HUD + legend — plain chrome, overlaid on the canvas (no model entities). */
#n8n-hud { position: absolute; right: 12px; top: 10px; z-index: 4; font: 12px/1.3 ui-monospace, monospace;
  color: #5b6273; background: rgba(255,255,255,.86); border: 1px solid #dfe2ea; border-radius: 8px;
  padding: 5px 10px; pointer-events: none; }
#n8n-legend { position: absolute; left: 12px; bottom: 12px; z-index: 4; pointer-events: none;
  font: 11px/1.5 system-ui, sans-serif; color: #4b5162; background: rgba(255,255,255,.92);
  border: 1px solid #dfe2ea; border-radius: 9px; padding: 9px 12px; box-shadow: 0 4px 14px rgba(15,23,42,.1); }
#n8n-legend b { display: block; font: 600 9.5px/1.4 system-ui; letter-spacing: .6px; text-transform: uppercase;
  color: #8a91a2; margin-bottom: 5px; }
#n8n-legend .row { display: flex; align-items: center; gap: 8px; margin: 2px 0; }
#n8n-legend .swatch { width: 30px; height: 0; flex: none; }
#n8n-legend .main  { border-top: 2.5px solid #9aa2b1; }
#n8n-legend .ai    { border-top: 2.5px dashed #8b5cf6; }
#n8n-legend .yes   { border-top: 2.5px solid #16a34a; }
#n8n-legend .no    { border-top: 2.5px solid #dc2626; }

/* The AI port labels (Model / Memory / Tool) sit exactly where their dashed
   wires dive into the agent's bottom ports — a canvas-coloured text HALO. */
#n8n-canvas text.ai-port-label { fill: #4b5162; paint-order: stroke; stroke: #f4f5f8;
  stroke-width: 5px; stroke-linejoin: round; }

@media (prefers-color-scheme: dark) {
  #n8n-canvas text.ai-port-label { fill: #b9becd; stroke: #16171d; }
  #n8n-palette { background: #191a22; border-right-color: rgba(255,255,255,.08); }
  #n8n-palette .pal-item { background: #23242f; border-color: #33353f; color: #e7e9f0; }
  #n8n-palette .pal-item:hover { background: #2b2c39; border-color: #45485a; }
  #n8n-palette .pal-title { color: #7b8194; }
  #n8n-canvas { background-color: #16171d; background-image: radial-gradient(circle, #2a2c38 1.1px, transparent 1.1px); }
  #n8n-canvas .n8n-card { background: #262733; color: #e7e9f0; border-color: #363845; }
  #n8n-canvas .n8n-title { color: #eceef4; }
  #n8n-canvas .n8n-sub { color: #9298ab; }
  #n8n-canvas .n8n-card.dangling { background: #241d33; border-color: #6d4fa0; }
  #n8n-canvas .n8n-spin { background: #262733; }
  #n8n-hud, #n8n-legend { background: rgba(30,31,42,.9); border-color: #363845; color: #b9becd; }
  #n8n-legend b { color: #838aa0; }
  #n8n-runbar { background: rgba(30,31,42,.95); border-color: #363845; }
  #n8n-runbar .rb { background: #23242f; border-color: #3a3c49; color: #c9cdda; }
  #n8n-runbar .rb[aria-pressed="true"] { background: #3a2320; border-color: #ff6d5a; color: #ff8d7d; }
  #n8n-runbar #run-readout { color: #9298ab; }
  #n8n-runlog { background: rgba(24,25,33,.97); border-top-color: #363845; }
  #n8n-runlog .rl-head { border-bottom-color: #2c2e3a; color: #838aa0; }
  #n8n-runlog .rl-row { border-bottom-color: #23242f; color: #c9cdda; }
  #n8n-runlog .rl-name { color: #e7e9f0; }
  #n8n-ndv .ndv-modal { background: #1d1e28; }
  #n8n-ndv .ndv-pane { background: #191a22; border-color: #2c2e3a; }
  #n8n-ndv .ndv-pane.out { border-left-color: #2c2e3a; }
  #n8n-ndv .ndv-main { background: #23242f; }
  #n8n-ndv .ndv-tabs { border-bottom-color: #2c2e3a; }
  #n8n-ndv .ndv-item { background: #262733; border-color: #363845; }
  #n8n-ndv .ndv-item pre { color: #c9cdda; }
  #n8n-ndv .ndv-field input[type="text"], #n8n-ndv .ndv-field input[type="number"], #n8n-ndv .ndv-field select, #n8n-ndv .ndv-field textarea {
    background: #1c1d26; border-color: #3a3c49; color: #e7e9f0; }
  #n8n-ndv .ndv-check { color: #c9cdda; }
  #n8n-ndv .ndv-hint button { background: #23242f; }
}
`;function Y(d,e){return d}const Z=H(q(()=>B(()=>import("./n8n-workflow.tsx_n8n_workflow_component_HSq3t0NEDH4-DFXx9GDx.js"),[],import.meta.url),"s_HSq3t0NEDH4")),ne=Object.freeze(Object.defineProperty({__proto__:null,_auto_HOST_CSS:X,_auto_SPEC:J,_auto_at:Y,default:Z},Symbol.toStringTag,{value:"Module"}));export{X as H,Q as N,J as S,Y as a,ne as n};
