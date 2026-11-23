import assert from 'node:assert/strict';
import handler from '../../api/fitness.js';
process.env.FITNESS_READ_TOKEN='fixture';
process.env.FITNESS_READER_JWT='fixture.'+Buffer.from('{"role":"fitness_reader"}').toString('base64url')+'.fixture';
process.env.SUPABASE_URL='https://fixture.invalid';
process.env.SUPABASE_ANON_KEY='fixture';
const day='2026-11-23';
let calls=[];
globalThis.fetch=async raw=>{
  const url=new URL(raw);
  assert.equal(url.hostname,'fixture.invalid');
  calls.push(url);
  const table=url.pathname.split('/').at(-1);
  const offset=Number(url.searchParams.get('offset'));
  const limit=Number(url.searchParams.get('limit')||1);
  const rows=table==='model_sessions' || table==='sessions'?Array.from({length:Math.max(0,Math.min(limit,251-offset))},(_,i)=>({
    id:String(i+offset),workout:{date:day,title:'Prueba',source:'manual',exercises:[{name:'Bench Press',sets:[{reps:4,weight:50}]}]}
  })):[];
  return new Response(JSON.stringify(rows),{status:200});
};
async function request(url,token='fixture',method='GET'){
  const response={code:200,setHeader(){},status(code){this.code=code;return this;},end(){return this;},json(data){this.data=data;return this;}};
  return handler({method,url,headers:{authorization:'Bearer '+token}},response);
}
assert.equal((await request('/api/fitness','otro')).code,401);
assert.equal((await request('/api/fitness','fixture','POST')).code,405);
assert.equal((await request('/api/fitness?resource=secrets')).code,404);
assert.equal(calls.length,0);
const s=new Set();
for(let offset=0;offset<251;offset+=100){
  const response=await request('/api/fitness?resource=sessions&limit=100&offset='+offset);
  response.data.forEach(row=>s.add(row.id));
}
assert.equal(s.size,251);
const result=await request('/api/fitness?resource=fatigue&at=2026-11-23T17:00:00Z');
assert.equal(result.data.modelVersion,2);
assert.equal(result.data.muscles.Pecho.evidence.length,251);
assert(calls.some(url=>url.searchParams.get('offset')==='250'));
console.log('OK autorización GET, lista permitida, paginación y fatiga rastreable.');
