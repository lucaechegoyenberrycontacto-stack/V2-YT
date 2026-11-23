// Ejecuta DataLayer real con almacenamiento, red y reloj de reintentos aislados.
import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const storage=new Map(), weights=new Map();
const workouts=Array.from({length:1003},(_,i)=>({id:String(i).padStart(4,'0'),data:{}}));
let offline=false,owner='a';
async function start(){
  const events={},dot={setAttribute(){},classList:{add(){},remove(){}}};
  const db={
    auth:{getSession:async()=>({data:{session:{user:{id:owner}}}})},
    from(){
      let col,after,limit=1000;
      const query={select(){return this;},eq(k,v){col=v;return this;},order(){return this;},
        gt(k,v){after=v;return this;},limit(v){limit=v;return this;},
        upsert:async row=>{if(offline)return {error:Error('Sin red')};weights.set(row.id,row);return {};},
        then(resolve){const rows=col==='gym_workouts'?workouts:[...weights.values()];
          resolve(offline?{error:Error('Sin red')}:{data:rows.filter(r=>!after || r.id>after).slice(0,limit)});}
      };return query;
    }
  };
  const win={addEventListener:(name,cb)=>events[name]=cb,supabase:{createClient:()=>db}};
  vm.runInNewContext(fs.readFileSync('dataLayer.js','utf8'),{window:win,
    document:{getElementById:()=>dot},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},
    setInterval(){},setTimeout:queueMicrotask,console:{warn(){}}});
  await win.DataLayer.init({requireAuth:true});return [win.DataLayer,events];
}
let [dl]=await start();
const result=await dl.list('gym_workouts');
assert.equal(new Set(result.map(r=>r.id)).size,1003);
offline=true;
await dl.put('gym_body_weight','2026-11-23',{weight:78.4});
assert(dl.weightPending('2026-11-23'));
await dl.put('gym_body_weight','2026-11-23',{weight:78.6});
let events;[dl,events]=await start();
assert.equal((await dl.list('gym_body_weight'))[0].weight,78.6);
offline=false;await events.online();
assert.equal(weights.size,1);assert.equal([...weights.values()][0].data.weight,78.6);
assert(!dl.weightPending('2026-11-23'));
owner='b';offline=true;[dl]=await start();
assert.equal((await dl.list('gym_body_weight')).length,0);
console.log('OK 1003 sesiones, guardado sin red, corrección, recarga, reintento y caché por usuario.');
