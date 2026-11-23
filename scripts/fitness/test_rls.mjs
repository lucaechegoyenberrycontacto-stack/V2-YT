import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite(), owner='11111111-1111-4111-a111-111111111111', other='22222222-2222-4222-a222-222222222222';
await db.exec(`create schema auth;create table auth.users(id uuid);insert into auth.users values ('${owner}'),('${other}');create role authenticated;create role anon;create role authenticator;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to public;create table public.records(collection text,id text,data jsonb,primary key(collection,id));grant all on public.records to authenticated,anon;
create policy old_policy on public.records for all to authenticated using(true) with check(true);
create table public.gym_pesas_store(key text,data jsonb);
create table public.workout_history(key text,data jsonb);create table public.app_state(key text,data jsonb);
set fitness.owner_id='${owner}';
insert into records values('gym_workouts','a','{"date":"2026-11-23","source":"lyfta","exercises":[{"name":"Bench Press","sets":[{"reps":5,"weight":80,"rir":"RIR2"}]}]}');
insert into records values('secrets','b','{}');`);
await db.exec(fs.readFileSync('scripts/fitness/001_read.sql','utf8'));
for(const role of ['authenticated','fitness_reader']){
 await db.exec(`set role ${role};set request.jwt.claim.sub='${owner}'`);
 assert.equal((await db.query('select count(*) n from fitness.sessions')).rows[0].n,1);
 assert.equal(+(await db.query('select kg from fitness.personal_records where position=1')).rows[0].kg,80);
 if(role==='fitness_reader'){
  assert.equal((await db.query("select id from records where collection='secrets'")).rows.length,0);
  await assert.rejects(db.exec("update records set data='{}'"));
 }
 await db.exec(`set request.jwt.claim.sub='${other}'`);
 assert.equal((await db.query('select count(*) n from fitness.sessions')).rows[0].n,0);
 await db.exec('reset role');
}
await db.exec('set role anon');await assert.rejects(db.query('select * from fitness.sessions'));console.log('OK propietario, segundo usuario, lector limitado y anónimo');await db.exec('reset role');await db.exec(`set role fitness_reader;set request.jwt.claim.sub='${owner}'`);
assert.equal((await db.query("select count(*) n from fitness.exercise_muscles where original_name='Bench Press'")).rows[0].n,3);
assert.equal((await db.query("select count(*) n from fitness.daily_signals")).rows[0].n,1);
await db.exec('reset role');await db.exec(fs.readFileSync('scripts/fitness/001_down.sql','utf8'));
assert.equal((await db.query('select count(*) n from records')).rows[0].n,2);
console.log('OK asociaciones, señales y reversión');await db.close();
