-- Comparación por contención del original completo. Excluye claves locales de identidad.
with legacy as (
  select w, pos from public.workout_history
  cross join lateral jsonb_array_elements(data->'workouts') with ordinality a(w,pos)
  where key='lyfta_data'
), candidates as (
  select w,pos,count(r.id) n from legacy left join public.records r
  on r.collection='gym_workouts' and r.data->>'date'=w->>'date'
  and (w-'id') <@ (r.data-'id')
  group by pos,w
)
select w->>'source' source,count(*) leidas,count(*) filter(where n=1) coincidentes,
count(*) filter(where n=0) pendientes,count(*) filter(where n>1) ambiguas
from candidates group by 1;
