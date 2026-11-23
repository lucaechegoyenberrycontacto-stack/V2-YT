// Proyección personal de solo lectura. La clave del agente solo sirve en esta ruta.
import { createHash, timingSafeEqual } from 'node:crypto';
import '../gymExerciseMuscleSeed.js';
import '../fitnessHistory.js';
import '../gymMuscleEnum.js';
import '../gymEcosystem.js';
import '../gymMuscleFatigue.js';

const orders = {
  sessions:'local_date.desc,started_at.desc.nullslast,id.asc',
  sets:'local_date.desc,session_id.asc,exercise_position.asc,set_position.asc',
  weekly:'week.desc', body_weight:'local_date.desc', personal_records:'position.asc',
  exercise_muscles:'original_name.asc,role.asc,muscle.asc'
};
const hash = value => createHash('sha256').update(value).digest();
async function read(table, params) {
  const url = new URL('/rest/v1/'+table,process.env.SUPABASE_URL);
  url.search = params.toString();
  const response = await fetch(url,{redirect:'error',signal:AbortSignal.timeout(12000),headers:{
    'Accept-Profile':'fitness',apikey:process.env.SUPABASE_ANON_KEY,
    Authorization:'Bearer '+process.env.FITNESS_READER_JWT
  }});
  if(!response.ok)throw Error('Falló la lectura de Fitness');
  return response.json();
}
async function all(table,order) {
  const result=[];
  for(let offset=0;;offset+=250){
    const page=await read(table,new URLSearchParams({order,limit:'250',offset:String(offset)}));
    result.push(...page);
    if(page.length<250)return result;
  }
}
async function fatigue(now) {
  const [sessions,settings,signals]=await Promise.all([
    all('model_sessions','id.asc'), read('model_config',new URLSearchParams({limit:'1'})),
    all('daily_signals','local_date.asc')
  ]);
  const config=settings[0]?.config;
  const mappings={...EXERCISE_MUSCLE_SEED.exercises,...settings[0]?.overrides};
  const resolver=name=>mappings[name] && {...mappings[name],inMap:true};
  const daily=Object.fromEntries(signals.map(s=>[s.local_date,s]));
  return computeMuscleFatigue(sessions.map(r=>({...r.workout,id:r.id})),
    config?.isPlaceholder===false?config:DEFAULT_MUSCLE_FATIGUE_CONFIG,now,{daily},resolver);
}
export default async function handler(req,res) {
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).end();}
  const secret=process.env.FITNESS_READ_TOKEN;
  if(!secret || !process.env.FITNESS_READER_JWT)return res.status(503).end();
  if(!timingSafeEqual(hash(req.headers.authorization || ''),hash('Bearer '+secret)))return res.status(401).end();
  try {
    const claims=JSON.parse(Buffer.from(process.env.FITNESS_READER_JWT.split('.')[1],'base64url'));
    if(claims.role!=='fitness_reader')return res.status(503).end();
    const q=new URL(req.url,'http://localhost').searchParams;
    const table=q.get('resource')||'sessions';
    if(table==='fatigue'){
      const now=q.has('at')?new Date(q.get('at')):new Date();
      if(!Number.isFinite(now.getTime()))return res.status(400).end();
      return res.json(await fatigue(now));
    }
    if(!Object.hasOwn(orders,table))return res.status(404).end();
    const limit=Number(q.get('limit')??50),offset=Number(q.get('offset')??0);
    if(!Number.isSafeInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>100)return res.status(400).end();
    const params=new URLSearchParams({order:orders[table],limit:String(limit),offset:String(offset)});
    for(const field of ['from','to']){
      if(!q.has(field))continue;
      if(!['sessions','sets','weekly','body_weight'].includes(table)||!/^\d{4}-\d{2}-\d{2}$/.test(q.get(field)))return res.status(400).end();
      params.append(table==='weekly'?'week':'local_date',(field==='from'?'gte.':'lte.')+q.get(field));
    }
    for(const [filter,column,allowed] of [['exercise','exercise_key',['sets']],['discipline','discipline',['sessions']],['session_id','session_id',['sets']]]){
      if(!q.has(filter))continue;
      if(!allowed.includes(table))return res.status(400).end();
      params.set(column,'eq.'+q.get(filter));
    }
    return res.json(await read(table,params));
  } catch {return res.status(502).json({error:'No se pudo verificar la lectura de Fitness.'});}
}
