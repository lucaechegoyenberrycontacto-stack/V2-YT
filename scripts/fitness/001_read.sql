-- Antes de ejecutar: SET fitness.owner_id = '<UUID verificado del dueño>';
begin;
do $$
begin
  if not exists(select 1 from auth.users where id=current_setting('fitness.owner_id')::uuid) then
    raise exception 'Revisá el propietario de este dashboard';
  end if;
end $$;
create schema fitness;
revoke all on schema fitness from public;
create role fitness_reader nologin;
grant fitness_reader to authenticator;
grant usage on schema fitness to fitness_reader, authenticated;
create table fitness.owner_account(id uuid primary key);
insert into fitness.owner_account values(current_setting('fitness.owner_id')::uuid);
alter table fitness.owner_account enable row level security;
create policy own_identity on fitness.owner_account for select to authenticated, fitness_reader using(id=(select auth.uid()));
grant select on fitness.owner_account to authenticated,fitness_reader;
create function fitness.is_owner() returns boolean language sql stable security invoker
set search_path='' as $$ select exists(select from fitness.owner_account where id=(select auth.uid())) $$;
revoke all on function fitness.is_owner() from public;
grant execute on function fitness.is_owner() to authenticated,fitness_reader;
alter table public.records enable row level security;
create policy fitness_personal_guard on public.records as restrictive for all to authenticated,fitness_reader
using(collection not in ('gym_workouts','gym_body_weight','gym_lyfta_sync') or (select fitness.is_owner()))
with check(collection not in ('gym_workouts','gym_body_weight','gym_lyfta_sync') or (select fitness.is_owner()));
create policy fitness_anon_guard on public.records as restrictive for all to anon
using(collection not in ('gym_workouts','gym_body_weight','gym_lyfta_sync'))
with check(collection not in ('gym_workouts','gym_body_weight','gym_lyfta_sync'));
grant select(collection,id,data) on public.records to fitness_reader;
create policy fitness_reader_scope on public.records as restrictive for select to fitness_reader
using(collection in ('gym_workouts','gym_body_weight') and (select fitness.is_owner()));
create policy fitness_reader_select on public.records for select to fitness_reader using((select fitness.is_owner()));
-- El blob archivado conserva los originales y también necesita aislamiento.
alter table public.workout_history enable row level security;
create policy fitness_archive_anon on public.workout_history as restrictive for all to anon
using(key <> 'lyfta_data') with check(key <> 'lyfta_data');
create policy fitness_archive_owner on public.workout_history as restrictive for all to authenticated
using(key <> 'lyfta_data' or (select fitness.is_owner()))
with check(key <> 'lyfta_data' or (select fitness.is_owner()));
create index fitness_workout_day on public.records ((data->>'date'), id) where collection='gym_workouts';

create view fitness.sessions with(security_invoker=true) as
select id, (data->>'date')::date local_date, (data->>'startedAt')::timestamptz started_at,
coalesce(data->>'discipline','desconocida') discipline,data->>'title' title, data->>'lyftaId' lyfta_id, (data->>'bodyWeightReference')::numeric lyfta_body_weight_reference,
coalesce(data->>'quality','registrada') quality,
coalesce(data#>>'{cardio,duration}',data#>>'{sessionMetrics,durationMin}')::numeric duration_min,
coalesce(data->>'source','desconocida') source, data->>'notes' notes,coalesce(data->'sources',jsonb_build_array(data->>'source')) sources,
case when data->>'startedAt' is null then 'día' else 'instante' end temporal_quality
from public.records where collection='gym_workouts' and coalesce(data->>'completed','true') <> 'false' and coalesce(data->>'quality','') <> 'ambigua' and (select fitness.is_owner());

create view fitness.sets with(security_invoker=true) as
select r.id session_id,(r.data->>'date')::date local_date, e.pos exercise_position,s.pos set_position,
e.item->>'exerciseId' exercise_id,e.item->>'name' original_name,
lower(regexp_replace(trim(coalesce(nullif(e.item->>'name',''),case e.item->>'exerciseId'
when '2' then 'Bench Press' when '6' then 'Barbell Curl' when '7' then 'Deadlift'
when '18' then 'Full Squat' when '382' then 'full Zercher Squat' end)),'\s+',' ','g')) exercise_key,
s.item->>'id' source_set_id,(s.item->>'reps')::numeric reps,(s.item->>'weight')::numeric load,
coalesce(s.item->>'unit',case when r.data->>'source' in ('manual','lyfta') then 'kg' end) unit,
case when lower(s.item->>'rir')='fallo' then 0 when s.item->>'rir' ~ '^RIR[0-9]+$' then substring(s.item->>'rir' from 4)::numeric when s.item->>'rir' ~ '^[0-9]+([.][0-9]+)?$' then (s.item->>'rir')::numeric end rir,s.item->>'rir' rir_original,s.item->>'duration' duration_original,s.item->>'distance' distance_original,
case when s.item->>'duration' ~ '^[0-9]+([.][0-9]+)?$' then (s.item->>'duration')::numeric end duration,
case when s.item->>'distance' ~ '^[0-9]+([.][0-9]+)?$' then (s.item->>'distance')::numeric end distance,
s.item->>'setType' set_type,case when s.item ? 'completed' then (s.item->>'completed')::boolean else true end completed
from public.records r cross join lateral jsonb_array_elements(r.data->'exercises') with ordinality e(item,pos)
cross join lateral jsonb_array_elements(e.item->'sets') with ordinality s(item,pos)
where collection='gym_workouts' and coalesce(data->>'completed','true') <> 'false' and coalesce(data->>'quality','') <> 'ambigua' and (select fitness.is_owner());

create view fitness.body_weight with(security_invoker=true) as
select id::date local_date,(data->>'weight')::numeric weight,data->>'unit' unit,
coalesce(data->>'source','manual') source from public.records
where collection='gym_body_weight' and (select fitness.is_owner());

create view fitness.weekly with(security_invoker=true) as
with d as (select date_trunc('week',local_date)::date week,discipline,count(*) n
from fitness.sessions group by 1,2), totals as (
select date_trunc('week',local_date)::date week,count(*) sessions,count(distinct local_date) active_days
from fitness.sessions group by 1)
select totals.*,jsonb_object_agg(d.discipline,d.n) disciplines from totals join d using(week) group by totals.week,sessions,active_days;

create view fitness.personal_records with(security_invoker=true) as
select lifts.position,lifts.name,winner.* from (values (1,'bench press'),(2,'full squat'),(3,'deadlift'),
(4,'barbell standing military press'),(5,'full zercher squat'),(6,'barbell curl')) lifts(position,name)
left join lateral(select s.*,case unit when 'kg' then load when 'lb' then load*0.45359237 end kg
from fitness.sets s join fitness.sessions w on w.id=s.session_id where s.exercise_key=lifts.name
and s.completed and reps>=1 and load>0 and unit in ('kg','lb')
order by kg desc,reps desc,s.local_date,w.started_at nulls first,session_id,exercise_position,set_position limit 1) winner on true
where (select fitness.is_owner());
-- Proyecciones limitadas de las tablas antiguas que guardan configuración del dashboard.
create view fitness.model_config with(security_barrier=true) as
select data->'muscleFatigueConfig' config,data->'exerciseOverrides' overrides
from public.gym_pesas_store where key='pesas_store' and (select fitness.is_owner());
create view fitness.exercise_muscles with(security_invoker=true) as
with maps as (select $catalog${"Barbell Curl": {"primaryMuscle": "Bíceps", "secondaryMuscles": []}, "Barbell Standing Military Press": {"primaryMuscle": "Hombros", "secondaryMuscles": ["Tríceps"]}, "Behind Back Finger Curl": {"primaryMuscle": "Antebrazos", "secondaryMuscles": []}, "Bench Press": {"primaryMuscle": "Pecho", "secondaryMuscles": ["Tríceps", "Hombros"]}, "Bent Over Row": {"primaryMuscle": "Espalda alta", "secondaryMuscles": ["Bíceps"]}, "Biceps Curl": {"primaryMuscle": "Bíceps", "secondaryMuscles": []}, "Cable High Row": {"primaryMuscle": "Espalda alta", "secondaryMuscles": ["Bíceps"]}, "Cable Kneeling High Low Anti Rotation Chop (male)": {"primaryMuscle": "Abdominales/Core", "secondaryMuscles": []}, "Cable Lateral Pulldown with V-bar": {"primaryMuscle": "Espalda alta", "secondaryMuscles": ["Bíceps"]}, "Cable One Arm Lateral Raise": {"primaryMuscle": "Hombros", "secondaryMuscles": []}, "Cable One Arm Wrist Curl": {"primaryMuscle": "Antebrazos", "secondaryMuscles": []}, "Cable Seated One Arm Alternate Row": {"primaryMuscle": "Espalda alta", "secondaryMuscles": ["Bíceps"]}, "Cable Standing Face Pull (with rope)": {"primaryMuscle": "Hombros", "secondaryMuscles": ["Espalda alta"]}, "Cable Standing Fly": {"primaryMuscle": "Pecho", "secondaryMuscles": []}, "Cable horizontal Pallof Press": {"primaryMuscle": "Abdominales/Core", "secondaryMuscles": []}, "Chin-Up": {"primaryMuscle": "Espalda alta", "secondaryMuscles": ["Bíceps"]}, "Crunch Floor": {"primaryMuscle": "Abdominales/Core", "secondaryMuscles": []}, "Deadlift": {"primaryMuscle": "Espalda baja", "secondaryMuscles": ["Isquiotibiales", "Glúteos"]}, "Dumbbell Incline Bench Press": {"primaryMuscle": "Pecho", "secondaryMuscles": ["Hombros", "Tríceps"]}, "Dumbbell Preacher Curl": {"primaryMuscle": "Bíceps", "secondaryMuscles": []}, "Dumbbell Shrug": {"primaryMuscle": "Espalda alta", "secondaryMuscles": ["Cuello"]}, "Full Squat": {"primaryMuscle": "Cuádriceps", "secondaryMuscles": ["Glúteos", "Isquiotibiales"]}, "Hack Calf Raise": {"primaryMuscle": "Gemelos", "secondaryMuscles": []}, "Hammer Curl": {"primaryMuscle": "Bíceps", "secondaryMuscles": ["Antebrazos"]}, "Kettlebell Russian Twist": {"primaryMuscle": "Abdominales/Core", "secondaryMuscles": []}, "Kneeling Hip Flexor Stretch": {"primaryMuscle": null, "secondaryMuscles": []}, "Landmine 180": {"primaryMuscle": "Abdominales/Core", "secondaryMuscles": ["Hombros"]}, "Lateral Raise": {"primaryMuscle": "Hombros", "secondaryMuscles": []}, "Leg Raise Dragon Flag": {"primaryMuscle": "Abdominales/Core", "secondaryMuscles": []}, "Lever Bent-over Row with V-bar": {"primaryMuscle": "Espalda alta", "secondaryMuscles": ["Bíceps"]}, "Lever Leg Extension": {"primaryMuscle": "Cuádriceps", "secondaryMuscles": []}, "Lever Lying Leg Curl": {"primaryMuscle": "Isquiotibiales", "secondaryMuscles": []}, "Lever Seated Row": {"primaryMuscle": "Espalda alta", "secondaryMuscles": ["Bíceps"]}, "Lever Seated Shoulder Press": {"primaryMuscle": "Hombros", "secondaryMuscles": ["Tríceps"]}, "Lying Neck Extension": {"primaryMuscle": "Cuello", "secondaryMuscles": []}, "Lying Neck Flexion": {"primaryMuscle": "Cuello", "secondaryMuscles": []}, "Medicine Ball Rotary Throw": {"primaryMuscle": "Abdominales/Core", "secondaryMuscles": []}, "Neck Bridge Prone": {"primaryMuscle": "Cuello", "secondaryMuscles": []}, "Neck Extensor And Rotational Stretch": {"primaryMuscle": null, "secondaryMuscles": []}, "Rear Fly": {"primaryMuscle": "Hombros", "secondaryMuscles": ["Espalda alta"]}, "Reverse Curl": {"primaryMuscle": "Antebrazos", "secondaryMuscles": ["Bíceps"]}, "Rowing": {"primaryMuscle": "Espalda alta", "secondaryMuscles": ["Bíceps"]}, "Seated Single Leg Hamstring Stretch": {"primaryMuscle": null, "secondaryMuscles": []}, "Shrug": {"primaryMuscle": "Espalda alta", "secondaryMuscles": ["Cuello"]}, "Sitting Rotational Hip Stretch": {"primaryMuscle": null, "secondaryMuscles": []}, "Sled Hack Squat": {"primaryMuscle": "Cuádriceps", "secondaryMuscles": ["Glúteos"]}, "Smith Calf Raise": {"primaryMuscle": "Gemelos", "secondaryMuscles": []}, "Smith Incline Bench Press": {"primaryMuscle": "Pecho", "secondaryMuscles": ["Hombros", "Tríceps"]}, "Smith Shrug": {"primaryMuscle": "Espalda alta", "secondaryMuscles": ["Cuello"]}, "Standing Bent Knee Hip Adductor Stretch": {"primaryMuscle": null, "secondaryMuscles": []}, "Standing Reach Down Hamstring Stretch": {"primaryMuscle": null, "secondaryMuscles": []}, "Straight Leg Deadlift": {"primaryMuscle": "Isquiotibiales", "secondaryMuscles": ["Glúteos", "Espalda baja"]}, "Triceps Dip": {"primaryMuscle": "Tríceps", "secondaryMuscles": ["Pecho"]}, "Triceps Pushdown": {"primaryMuscle": "Tríceps", "secondaryMuscles": []}, "Weighted Chin-Up": {"primaryMuscle": "Espalda alta", "secondaryMuscles": ["Bíceps"]}, "Weighted Side Lying Side Neck Raise": {"primaryMuscle": "Cuello", "secondaryMuscles": []}, "Weighted Tricep Dips": {"primaryMuscle": "Tríceps", "secondaryMuscles": ["Pecho"]}, "Wheel Rollout": {"primaryMuscle": "Abdominales/Core", "secondaryMuscles": []}, "full Zercher Squat": {"primaryMuscle": "Cuádriceps", "secondaryMuscles": ["Espalda baja", "Glúteos"]}}$catalog$::jsonb ||
coalesce((select overrides from fitness.model_config),'{}'::jsonb) as value),
assoc as (select entries.key original_name,entries.value mapping from maps cross join lateral jsonb_each(maps.value) entries(key,value))
select original_name,role,muscle,case when coalesce((select overrides from fitness.model_config),'{}') ? original_name
then 'personalizada' else 'catálogo' end source
from assoc cross join lateral (
select 'principal' role,mapping->>'primaryMuscle' muscle union all
select 'secundario',jsonb_array_elements_text(case when jsonb_typeof(mapping->'secondaryMuscles')='array' then mapping->'secondaryMuscles' else '[]'::jsonb end)) m
where muscle is not null and (select fitness.is_owner());

create view fitness.model_sessions with(security_invoker=true) as
select id,data - 'historicalOriginal' as workout from public.records
where collection='gym_workouts' and coalesce(data->>'completed','true') <> 'false' and coalesce(data->>'quality','') <> 'ambigua' and (select fitness.is_owner());

create view fitness.daily_signals with(security_barrier=true) as
with inputs as (
select (select data from public.app_state where key='health') h,
(select data from public.app_state where key='nutrition') n,
(select data from public.app_state where key='habits') b where (select fitness.is_owner())
), days as (select distinct local_date d from fitness.sessions),
sleep as (select distinct on (e->>'date') e->>'date' d,
(e->>'wakeTime')::time-(e->>'bedTime')::time duration
from inputs cross join lateral jsonb_array_elements(case when jsonb_typeof(h->'sleepEntries')='array' then h->'sleepEntries' else '[]'::jsonb end) e
where e->>'bedTime' ~ '^([01]?[0-9]|2[0-3]):[0-5][0-9]$' and e->>'wakeTime' ~ '^([01]?[0-9]|2[0-3]):[0-5][0-9]$'),
protein as (select (to_timestamp((l->>'ts')::numeric/1000) at time zone 'America/Argentina/Cordoba')::date d,
sum(coalesce((f->>'protein')::numeric,0)*(i->>'qty')::numeric /
case when f->>'unit'='unit' then 1 else 100 end) grams
from inputs cross join lateral jsonb_array_elements(case when jsonb_typeof(n->'nut:log')='array' then n->'nut:log' else '[]'::jsonb end) l
cross join lateral jsonb_array_elements(case when jsonb_typeof(l->'items')='array' then l->'items' else '[]'::jsonb end) i
left join lateral (select f from jsonb_array_elements(case when jsonb_typeof(n->'nut:foods')='array' then n->'nut:foods' else '[]'::jsonb end) f where f->>'id'=i->>'foodId' limit 1) food on true
group by 1)
select days.d local_date,extract(epoch from (case when duration<=interval '0' then interval '24 hours'+duration else duration end))/3600 sleep_hours,
grams/nullif((n#>>'{nut:goals,protein}')::numeric,0) protein_ratio,
(b#>>array['po_habits_v1','screenTime','logs',days.d::text])::numeric/nullif((b#>>'{po_habits_v1,screenTime,goalHours}')::numeric,0) screen_ratio
from days cross join inputs left join sleep on sleep.d=days.d::text left join protein on protein.d=days.d;

grant select on all tables in schema fitness to authenticated, fitness_reader;
commit;
