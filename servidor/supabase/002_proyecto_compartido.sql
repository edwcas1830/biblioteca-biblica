-- Solo para el proyecto compartido kingdomtech-invest (también lo usa el Centro de Mando).
-- Autorizado por Edward en el chat el 11-oct-2026 («sí, aplica los tres cambios en kingdomtech-invest»).
-- 1) Cada alta crea un perfil con correo obligatorio; los dispositivos anónimos de la Biblioteca no tienen
--    correo y su alta fallaba. Se los salta: no son usuarios del Centro de Mando. Lo demás queda igual.
-- 2) Un anónimo tampoco puede crearse un perfil a mano por la API (política restrictiva).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path to 'public' as $function$
begin
  if new.is_anonymous then return new; end if;
  insert into public.profiles (id, email, role, status) values (new.id, new.email, 'user', 'pending')
  on conflict (id) do nothing;
  return new;
end;
$function$;

drop policy if exists sin_anonimos_bb on public.profiles;
create policy sin_anonimos_bb on public.profiles as restrictive for insert to authenticated
  with check (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);
