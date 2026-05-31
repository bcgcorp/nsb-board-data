/*
 * NSB Apartment Finder — Cloudflare Worker (v2)
 * Listings come from a public GitHub repo (daily task writes them via connector).
 * User state (decisions, score overrides, photos) lives in Workers KV.
 *
 * Bindings: KV namespace NSB_KV; vars VIEW_KEY (share-link key), WRITE_TOKEN (unused now, kept).
 * Share link: https://<worker>.workers.dev/?k=<VIEW_KEY>
 */
const GH_RAW = "https://raw.githubusercontent.com/bcgcorp/nsb-board-data/main/listings.json";

async function loadListings() {
  try {
    const r = await fetch(GH_RAW + "?t=" + Date.now(), { cf: { cacheTtl: 60 } });
    if (!r.ok) return [];
    return await r.json();
  } catch (e) { return []; }
}
async function loadKV(env) {
  const raw = await env.NSB_KV.get("state");
  const s = raw ? JSON.parse(raw) : {};
  return { decisions: s.decisions || {}, decisionTs: s.decisionTs || {}, overrides: s.overrides || {}, photos: s.photos || {} };
}
async function saveKV(env, kv) { kv.updatedAt = new Date().toISOString(); await env.NSB_KV.put("state", JSON.stringify(kv)); }
function json(d, s = 200) { return new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json" } }); }
function today() { return new Date().toISOString().slice(0, 10); }

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const viewKey = env.VIEW_KEY || "nsb";
    if ((url.searchParams.get("k") || "") !== viewKey) {
      return new Response("Forbidden — append ?k=<your key> to the URL.", { status: 403 });
    }
    if (path === "/api/data" && request.method === "GET") {
      const [listings, kv] = await Promise.all([loadListings(), loadKV(env)]);
      return json({ listings, kv });
    }
    if (path === "/api/decision" && request.method === "POST") {
      const { id, decision } = await request.json().catch(() => ({}));
      if (!id || !["new", "watched", "rejected", "notavailable"].includes(decision)) return json({ error: "bad request" }, 400);
      const kv = await loadKV(env);
      kv.decisions[id] = decision;
      if (decision === "notavailable") kv.decisionTs[id] = new Date().toISOString();
      await saveKV(env, kv);
      return json({ ok: true });
    }
    if (path === "/api/score" && request.method === "POST") {
      const { id, field, value } = await request.json().catch(() => ({}));
      const fields = ["preferred", "oceanView", "balcony", "screened", "pool", "petFriendly", "bigSqft"];
      if (!id || !fields.includes(field)) return json({ error: "bad request" }, 400);
      const kv = await loadKV(env);
      kv.overrides[id] = kv.overrides[id] || {};
      kv.overrides[id][field] = !!value;
      await saveKV(env, kv);
      return json({ ok: true });
    }
    if (path === "/api/photo" && request.method === "POST") {
      const { id, image } = await request.json().catch(() => ({}));
      if (!id) return json({ error: "bad request" }, 400);
      const kv = await loadKV(env);
      kv.photos[id] = image || "";
      await saveKV(env, kv);
      return json({ ok: true });
    }
    if (path === "/" || path === "") {
      return new Response(PAGE_HTML.replace("__VIEW_KEY__", viewKey), { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    return new Response("Not found", { status: 404 });
  }
};

const PAGE_HTML = `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>NSB Apartment Finder</title>
<style>
:root{color-scheme:light}*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f8f9fa;color:#1a1a2e;padding:16px;line-height:1.45}
h1{font-size:20px;font-weight:700}.subtitle{font-size:13px;color:#6b7280;margin-bottom:12px}
.stats{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:#6b7280;margin-bottom:14px}
.dot{width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:4px}
.d-new{background:#6366f1}.d-watched{background:#f59e0b}.d-rejected{background:#9ca3af}.d-na{background:#ef4444}.d-gone{background:#6b7280}
.sec-title{font-size:15px;font-weight:700;margin:16px 0 8px;display:flex;align-items:center;gap:8px;cursor:pointer}
.count{background:#6366f1;color:#fff;font-size:11px;padding:1px 7px;border-radius:10px}
.watched .count{background:#f59e0b}.rejected .count{background:#9ca3af}.na .count{background:#ef4444}.gone .count{background:#6b7280}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px}
.card{background:#fff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden}
.card[open]{border-color:#c7d2fe}
.head{list-style:none;display:flex;align-items:center;gap:10px;padding:10px 12px;cursor:pointer}
.head::-webkit-details-marker{display:none}
.thumb{width:46px;height:46px;border-radius:8px;background:#eef2ff center/cover no-repeat;flex-shrink:0;display:flex;align-items:center;justify-content:center;color:#9aa3d0;font-size:9px}
.h-main{flex:1;min-width:0}
.h-title{font-size:13px;font-weight:600;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.h-sub{display:flex;align-items:center;gap:8px;margin-top:2px}
.h-price{font-size:13px;font-weight:700;color:#059669}.was{font-size:11px;color:#9ca3af;text-decoration:line-through;margin-left:4px}
.badge{font-size:11px;font-weight:700;background:#eef2ff;color:#4338ca;border-radius:10px;padding:1px 7px}
.pill{font-size:10px;font-weight:600;border-radius:10px;padding:1px 7px;white-space:nowrap}
.p-new{background:#eef2ff;color:#4338ca}.p-watched{background:#fef3c7;color:#92400e}.p-rejected{background:#f3f4f6;color:#6b7280}.p-na{background:#fee2e2;color:#991b1b}.p-gone{background:#f3f4f6;color:#6b7280}
.body{padding:0 12px 12px;border-top:1px solid #f1f1f4}
.photo{aspect-ratio:16/9;background:#eef2ff center/cover no-repeat;border-radius:8px;margin:10px 0;display:flex;align-items:center;justify-content:center;color:#9aa3d0;font-size:12px;cursor:pointer;position:relative}
.photo .hint{position:absolute;bottom:6px;right:8px;background:rgba(0,0,0,.55);color:#fff;font-size:10px;padding:2px 6px;border-radius:6px}
.meta{font-size:12px;color:#6b7280}.desc{font-size:12px;color:#4b5563;margin-top:6px}
.src{font-size:11px;color:#9ca3af;margin-top:6px}
.lnk{display:inline-flex;gap:4px;font-size:12px;color:#4f46e5;text-decoration:none;margin-top:6px}.lnk:hover{text-decoration:underline}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.chip{font-size:11px;border:1px solid #e5e7eb;border-radius:14px;padding:3px 9px;cursor:pointer;user-select:none;color:#6b7280;background:#fff}
.chip.on{background:#1d9e75;border-color:#1d9e75;color:#fff}
.actions{display:flex;gap:6px;margin-top:10px;flex-wrap:wrap}
.btn{border:none;border-radius:6px;padding:5px 10px;font-size:12px;font-weight:600;cursor:pointer}
.b-watch{background:#fef3c7;color:#92400e}.b-reject{background:#fee2e2;color:#991b1b}.b-restore{background:#e0e7ff;color:#3730a3}.b-unwatch{background:#f3f4f6;color:#374151}.b-na{background:#fde8e8;color:#991b1b}
.empty{color:#9ca3af;font-style:italic;font-size:13px;padding:6px 2px}
.toast{position:fixed;bottom:14px;left:50%;transform:translateX(-50%);background:#1a1a2e;color:#fff;font-size:12px;padding:8px 14px;border-radius:8px;opacity:0;transition:opacity .2s}.toast.show{opacity:1}
.collapsed{display:none}
</style></head><body>
<h1>New Smyrna Beach Apartment Finder</h1>
<p class="subtitle">3BR · Ocean View · Porch · Max $5,500/mo · shared with Stephanie · tap a card for details</p>
<div class="stats" id="stats"></div>
<div id="secs"></div>
<div class="toast" id="toast"></div>
<script>
const KEY="__VIEW_KEY__";
const FIELDS=[["preferred","Preferred"],["oceanView","Ocean View"],["balcony","Balcony/Porch"],["screened","Screened"],["pool","Pool"],["petFriendly","Pet Friendly"],["bigSqft",">2100 sqft"]];
let DATA={listings:[],kv:{decisions:{},decisionTs:{},overrides:{},photos:{}}};
let collapsed={rejected:true,gone:true,notavailable:false};
const q=(u,o)=>fetch(u+(u.includes('?')?'&':'?')+'k='+encodeURIComponent(KEY),o);
function toast(m){const t=document.getElementById('toast');t.textContent=m;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),1500);}
async function load(){const r=await q('/api/data');DATA=await r.json();render();}
function chk(l,f){const o=(DATA.kv.overrides||{})[l.id]||{};if(f in o)return !!o[f];if(f==='preferred')return false;return !!(l.auto&&l.auto[f]);}
function score(l){return FIELDS.reduce((n,[f])=>n+(chk(l,f)?1:0),0);}
function statusOf(l){const id=l.id;const base=(DATA.kv.decisions||{})[id]||'new';
  if(base==='watched')return 'watched';if(base==='rejected')return 'rejected';
  if(base==='notavailable'){const ts=(DATA.kv.decisionTs||{})[id];if(l.availableSince&&ts&&l.availableSince>ts)return 'watched';return 'notavailable';}
  if(l.available===false)return 'gone';return 'new';}
async function setDecision(id,d,e){if(e)e.stopPropagation();DATA.kv.decisions[id]=d;if(d==='notavailable')DATA.kv.decisionTs[id]=new Date().toISOString();render();toast('Saved');await q('/api/decision',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id,decision:d})});}
async function toggleChip(id,f,e){if(e)e.stopPropagation();const l=DATA.listings.find(x=>x.id===id);const cur=chk(l,f);DATA.kv.overrides[id]=DATA.kv.overrides[id]||{};DATA.kv.overrides[id][f]=!cur;render();await q('/api/score',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id,field:f,value:!cur})});}
async function setPhoto(id,e){if(e)e.stopPropagation();const cur=(DATA.kv.photos||{})[id]||'';const u=prompt('Paste an image URL for this listing (blank to clear):',cur);if(u===null)return;DATA.kv.photos[id]=u.trim();render();toast('Photo saved');await q('/api/photo',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id,image:u.trim()})});}
function esc(s){return (s||'').replace(/'/g,"%27").replace(/"/g,'&quot;');}
function card(l){const img=(DATA.kv.photos||{})[l.id]||'';const sc=score(l);const st=statusOf(l);
 const pill={new:['p-new','New'],watched:['p-watched','Watched'],rejected:['p-rejected','Rejected'],notavailable:['p-na','Not Available'],gone:['p-gone','Gone']}[st];
 const thumb=img?'style="background-image:url(\\''+esc(img)+'\\')"':'';
 const was=l.priceWas?'<span class="was">'+l.priceWas+'</span>':'';
 const chips=FIELDS.map(([f,lab])=>'<span class="chip '+(chk(l,f)?'on':'')+'" onclick="toggleChip(\\''+l.id+'\\',\\''+f+'\\',event)">'+(chk(l,f)?'✓ ':'')+lab+'</span>').join('');
 let acts='';
 if(st==='watched')acts='<button class="btn b-unwatch" onclick="setDecision(\\''+l.id+'\\',\\'new\\',event)">Unwatch</button><button class="btn b-na" onclick="setDecision(\\''+l.id+'\\',\\'notavailable\\',event)">Not avail</button><button class="btn b-reject" onclick="setDecision(\\''+l.id+'\\',\\'rejected\\',event)">✕ Pass</button>';
 else if(st==='rejected')acts='<button class="btn b-restore" onclick="setDecision(\\''+l.id+'\\',\\'new\\',event)">↺ Restore</button>';
 else if(st==='notavailable')acts='<button class="btn b-watch" onclick="setDecision(\\''+l.id+'\\',\\'watched\\',event)">★ Re-watch</button><button class="btn b-reject" onclick="setDecision(\\''+l.id+'\\',\\'rejected\\',event)">✕ Pass</button>';
 else if(st==='gone')acts='<button class="btn b-watch" onclick="setDecision(\\''+l.id+'\\',\\'watched\\',event)">★ Watch</button><button class="btn b-reject" onclick="setDecision(\\''+l.id+'\\',\\'rejected\\',event)">✕ Pass</button>';
 else acts='<button class="btn b-watch" onclick="setDecision(\\''+l.id+'\\',\\'watched\\',event)">★ Watch</button><button class="btn b-na" onclick="setDecision(\\''+l.id+'\\',\\'notavailable\\',event)">Not avail</button><button class="btn b-reject" onclick="setDecision(\\''+l.id+'\\',\\'rejected\\',event)">✕ Pass</button>';
 return '<details class="card"><summary class="head"><div class="thumb" '+thumb+'>'+(img?'':'no photo')+'</div><div class="h-main"><div class="h-title">'+l.title+'</div><div class="h-sub"><span class="h-price">'+l.price+was+'</span><span class="pill '+pill[0]+'">'+pill[1]+'</span></div></div><span class="badge">'+sc+'/7</span></summary>'+
  '<div class="body"><div class="photo" '+thumb+' onclick="setPhoto(\\''+l.id+'\\',event)">'+(img?'':'＋ add photo')+'<span class="hint">edit photo</span></div>'+
  '<div class="meta">'+l.meta+'</div><div class="desc">'+(l.description||'')+'</div><div class="src">via '+l.source+' · found '+l.dateFound+(l.sqft?' · '+l.sqft+' sqft':'')+'</div>'+
  '<a class="lnk" href="'+l.url+'" target="_blank" rel="noopener">Open listing ↗</a>'+
  '<div class="chips">'+chips+'</div><div class="actions">'+acts+'</div></div></details>';}
function sec(key,title,cls,items){if(!items.length&&(cls==='rejected'||cls==='gone'||cls==='na'))return '';
 const open=!collapsed[key];
 return '<div class="sec-title '+cls+'" onclick="collapsed[\\''+key+'\\']=!collapsed[\\''+key+'\\'];render()">'+(open?'▾':'▸')+' '+title+' <span class="count">'+items.length+'</span></div>'+
   '<div class="grid '+(open?'':'collapsed')+'">'+(items.length?items.map(card).join(''):'<div class="empty">Nothing here yet</div>')+'</div>';}
function render(){const g={new:[],watched:[],notavailable:[],rejected:[],gone:[]};
 DATA.listings.forEach(l=>{g[statusOf(l)].push(l);});
 g.watched.sort((a,b)=>score(b)-score(a));g.new.sort((a,b)=>score(b)-score(a));
 document.getElementById('stats').innerHTML='<span><span class="dot d-new"></span>'+g.new.length+' new</span><span><span class="dot d-watched"></span>'+g.watched.length+' watched</span><span><span class="dot d-na"></span>'+g.notavailable.length+' not avail</span><span><span class="dot d-rejected"></span>'+g.rejected.length+' rejected</span>'+(g.gone.length?'<span><span class="dot d-gone"></span>'+g.gone.length+' gone</span>':'');
 document.getElementById('secs').innerHTML=
   sec('new','🆕 New Listings','',g.new)+
   sec('watched','⭐ Watched','watched',g.watched)+
   sec('notavailable','🚧 Not Available','na',g.notavailable)+
   sec('rejected','🚫 Rejected','rejected',g.rejected)+
   sec('gone','📦 Gone','gone',g.gone);}
load();
</script></body></html>`;
