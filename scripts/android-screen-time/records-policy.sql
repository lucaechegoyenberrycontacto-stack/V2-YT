begin;

-- The existing records policy grants access to all authenticated users.
-- A restrictive policy also applies when another permissive policy grants access.
create policy android_screen_time_owner_guard
on public.records as restrictive
for all to public
using (
  left(collection, length('habits_screen_time_android:')) <> 'habits_screen_time_android:'
  or collection = 'habits_screen_time_android:' || (select auth.uid())::text
)
with check (
  left(collection, length('habits_screen_time_android:')) <> 'habits_screen_time_android:'
  or collection = 'habits_screen_time_android:' || (select auth.uid())::text
);

create policy android_screen_time_owner
on public.records
for all to authenticated
using (collection = 'habits_screen_time_android:' || (select auth.uid())::text)
with check (collection = 'habits_screen_time_android:' || (select auth.uid())::text);

commit;
