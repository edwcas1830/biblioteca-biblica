-- Lo mínimo de Supabase para probar las migraciones _bb en un Postgres desechable de CI.
-- No es el proyecto real: roles, auth.users, auth.uid()/auth.jwt(), el esquema extensions con pgcrypto,
-- y una tabla profiles con el disparador del Centro de Mando (correo obligatorio), como estaba antes de 002.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create schema extensions;
create extension pgcrypto with schema extensions;
grant usage on schema public, auth, extensions to anon, authenticated, service_role;

create table auth.users (
  id uuid primary key,
  instance_id uuid, aud text, role text, email text,
  is_anonymous boolean not null default false,
  created_at timestamptz, updated_at timestamptz,
  raw_app_meta_data jsonb, raw_user_meta_data jsonb
);

create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;
grant execute on function auth.jwt(), auth.uid() to anon, authenticated, service_role;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null, role text, status text
);
alter table public.profiles enable row level security;
create policy profiles_propio on public.profiles for insert to authenticated with check (id = auth.uid());

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  insert into public.profiles (id, email, role, status) values (new.id, new.email, 'user', 'pending')
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Como en Supabase: lo nuevo en public queda concedido a los roles de la API (001 lo revoca y concede a mano).
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
