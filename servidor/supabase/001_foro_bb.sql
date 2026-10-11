-- Biblioteca Bíblica · Fase 1 «Laura primero» (CONSENSO-FORO.md, opción C modificada).
-- Vive dentro de un proyecto Supabase compartido: todo lleva el sufijo _bb y no toca nada más.
-- El servidor guarda pertenencias y sobres cifrados; nunca textos, títulos, referencias ni claves privadas.
-- Las cuentas son anónimas por dispositivo; sin invitación aprobada no se entra a ningún grupo.

create extension if not exists pgcrypto with schema extensions;

-- ── Tablas ──────────────────────────────────────────────────────────────────
create table public.personas_bb (
  id uuid primary key default gen_random_uuid(),
  creada timestamptz not null default now()
);

create table public.dispositivos_bb (
  id uuid primary key default gen_random_uuid(),
  persona_id uuid not null references public.personas_bb(id) on delete cascade,
  auth_uid uuid not null unique references auth.users(id) on delete cascade,
  nombre text not null check (char_length(nombre) between 1 and 40),
  clave_firma text not null check (char_length(clave_firma) between 40 and 400),   -- pública
  clave_acuerdo text not null check (char_length(clave_acuerdo) between 40 and 400), -- pública
  estado text not null default 'activo' check (estado in ('activo', 'bloqueado')),
  creado timestamptz not null default now()
);
create index dispositivos_bb_persona on public.dispositivos_bb (persona_id);

create table public.grupos_bb (
  id uuid primary key default gen_random_uuid(),
  creado_por uuid not null references public.personas_bb(id) on delete cascade,
  epoca int not null default 1 check (epoca >= 1),
  creado timestamptz not null default now()
);

create table public.miembros_bb (
  grupo_id uuid not null references public.grupos_bb(id) on delete cascade,
  persona_id uuid not null references public.personas_bb(id) on delete cascade,
  rol text not null default 'miembro' check (rol in ('admin', 'miembro')),
  alta timestamptz not null default now(),
  primary key (grupo_id, persona_id)
);
create index miembros_bb_persona on public.miembros_bb (persona_id);

-- La invitación guarda solo el hash del token (128 bits, 15 minutos, un uso).
create table public.invitaciones_bb (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null references public.grupos_bb(id) on delete cascade,
  token_hash bytea not null unique check (octet_length(token_hash) = 32),
  creada_por uuid not null references public.dispositivos_bb(id) on delete cascade,
  para_mi boolean not null default false, -- true: suma un dispositivo nuevo de la misma persona
  expira timestamptz not null,
  usada timestamptz
);
create index invitaciones_bb_grupo on public.invitaciones_bb (grupo_id);

-- Usar una invitación solo permite PEDIR entrar; el admin compara la huella y aprueba.
create table public.solicitudes_bb (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null references public.grupos_bb(id) on delete cascade,
  invitacion_id uuid not null unique references public.invitaciones_bb(id) on delete cascade,
  dispositivo_id uuid not null references public.dispositivos_bb(id) on delete cascade,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobada', 'rechazada')),
  creada timestamptz not null default now(),
  resuelta timestamptz
);
create index solicitudes_bb_grupo on public.solicitudes_bb (grupo_id, estado);

-- Clave del grupo envuelta para cada dispositivo (una por época).
create table public.claves_grupo_bb (
  grupo_id uuid not null references public.grupos_bb(id) on delete cascade,
  epoca int not null check (epoca >= 1),
  dispositivo_id uuid not null references public.dispositivos_bb(id) on delete cascade,
  envuelta_por uuid not null references public.dispositivos_bb(id) on delete cascade,
  clave_envuelta text not null check (char_length(clave_envuelta) between 40 and 2000),
  creada timestamptz not null default now(),
  primary key (grupo_id, epoca, dispositivo_id)
);
create index claves_grupo_bb_dispositivo on public.claves_grupo_bb (dispositivo_id);

create table public.hilos_bb (
  id uuid primary key, -- lo genera el cliente: reenviar no duplica
  grupo_id uuid not null references public.grupos_bb(id) on delete cascade,
  tipo text not null check (tipo in ('chat', 'versiculo', 'tema')),
  dispositivo_id uuid not null references public.dispositivos_bb(id) on delete cascade,
  sobre text not null check (char_length(sobre) between 1 and 4000), -- título cifrado
  creado timestamptz not null default now(),
  unique (id, grupo_id)
);
create index hilos_bb_grupo on public.hilos_bb (grupo_id);

create table public.mensajes_bb (
  seq bigint generated always as identity primary key, -- cursor durable
  id uuid not null unique,                             -- lo genera el cliente: cola idempotente
  grupo_id uuid not null,
  hilo_id uuid not null,
  dispositivo_id uuid not null references public.dispositivos_bb(id) on delete cascade,
  epoca int not null check (epoca >= 1),
  sobre text not null check (char_length(sobre) between 1 and 16000),
  creado timestamptz not null default now(),
  foreign key (hilo_id, grupo_id) references public.hilos_bb(id, grupo_id) on delete cascade
);
create index mensajes_bb_grupo_seq on public.mensajes_bb (grupo_id, seq);
create index mensajes_bb_dispositivo on public.mensajes_bb (dispositivo_id, creado);

-- ── Funciones de apoyo para RLS ─────────────────────────────────────────────
create function public.mi_dispositivo_bb() returns uuid
language sql stable security definer set search_path = '' as $$
  select d.id from public.dispositivos_bb d where d.auth_uid = auth.uid() and d.estado = 'activo'
$$;

create function public.mi_persona_bb() returns uuid
language sql stable security definer set search_path = '' as $$
  select d.persona_id from public.dispositivos_bb d where d.auth_uid = auth.uid() and d.estado = 'activo'
$$;

create function public.es_miembro_bb(g uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.miembros_bb m where m.grupo_id = g and m.persona_id = public.mi_persona_bb())
$$;

create function public.es_admin_bb(g uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.miembros_bb m where m.grupo_id = g and m.persona_id = public.mi_persona_bb() and m.rol = 'admin')
$$;

-- ¿Comparto algún grupo con esta persona? (para ver sus claves públicas)
create function public.comparto_grupo_bb(p uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.miembros_bb a join public.miembros_bb b on a.grupo_id = b.grupo_id
    where a.persona_id = public.mi_persona_bb() and b.persona_id = p)
$$;

-- ¿Este dispositivo pide entrar a un grupo que yo administro? (para comparar su huella)
create function public.solicita_en_mi_grupo_bb(d uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.solicitudes_bb s
    where s.dispositivo_id = d and s.estado = 'pendiente' and public.es_admin_bb(s.grupo_id))
$$;

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.personas_bb enable row level security;
alter table public.dispositivos_bb enable row level security;
alter table public.grupos_bb enable row level security;
alter table public.miembros_bb enable row level security;
alter table public.invitaciones_bb enable row level security;
alter table public.solicitudes_bb enable row level security;
alter table public.claves_grupo_bb enable row level security;
alter table public.hilos_bb enable row level security;
alter table public.mensajes_bb enable row level security;

-- Nadie sin sesión toca nada; con sesión, solo lo que dicen las políticas. Altas y cambios van por funciones.
revoke all on public.personas_bb, public.dispositivos_bb, public.grupos_bb, public.miembros_bb,
  public.invitaciones_bb, public.solicitudes_bb, public.claves_grupo_bb, public.hilos_bb, public.mensajes_bb
  from anon, authenticated;
grant select on public.personas_bb, public.dispositivos_bb, public.grupos_bb, public.miembros_bb,
  public.invitaciones_bb, public.solicitudes_bb, public.claves_grupo_bb, public.hilos_bb, public.mensajes_bb
  to authenticated;
grant insert on public.claves_grupo_bb, public.hilos_bb, public.mensajes_bb to authenticated;

create policy personas_bb_ver on public.personas_bb for select to authenticated
  using (id = public.mi_persona_bb() or public.comparto_grupo_bb(id));

create policy dispositivos_bb_ver on public.dispositivos_bb for select to authenticated
  using (auth_uid = auth.uid() or public.comparto_grupo_bb(persona_id) or public.solicita_en_mi_grupo_bb(id));

create policy grupos_bb_ver on public.grupos_bb for select to authenticated
  using (public.es_miembro_bb(id));

create policy miembros_bb_ver on public.miembros_bb for select to authenticated
  using (public.es_miembro_bb(grupo_id));

create policy invitaciones_bb_ver on public.invitaciones_bb for select to authenticated
  using (public.es_admin_bb(grupo_id));

create policy solicitudes_bb_ver on public.solicitudes_bb for select to authenticated
  using (public.es_admin_bb(grupo_id) or dispositivo_id = public.mi_dispositivo_bb());

create policy claves_grupo_bb_ver on public.claves_grupo_bb for select to authenticated
  using (dispositivo_id = public.mi_dispositivo_bb());

-- Un miembro entrega la clave de la época actual a un dispositivo activo de otro miembro (o al suyo).
create policy claves_grupo_bb_entregar on public.claves_grupo_bb for insert to authenticated
  with check (
    envuelta_por = public.mi_dispositivo_bb()
    and public.es_miembro_bb(grupo_id)
    and epoca = (select g.epoca from public.grupos_bb g where g.id = grupo_id)
    and exists (
      select 1 from public.dispositivos_bb d join public.miembros_bb m on m.persona_id = d.persona_id
      where d.id = dispositivo_id and d.estado = 'activo' and m.grupo_id = claves_grupo_bb.grupo_id));

create policy hilos_bb_ver on public.hilos_bb for select to authenticated
  using (public.es_miembro_bb(grupo_id));

create policy hilos_bb_crear on public.hilos_bb for insert to authenticated
  with check (dispositivo_id = public.mi_dispositivo_bb() and public.es_miembro_bb(grupo_id));

create policy mensajes_bb_ver on public.mensajes_bb for select to authenticated
  using (public.es_miembro_bb(grupo_id));

create policy mensajes_bb_enviar on public.mensajes_bb for insert to authenticated
  with check (
    dispositivo_id = public.mi_dispositivo_bb()
    and public.es_miembro_bb(grupo_id)
    and epoca = (select g.epoca from public.grupos_bb g where g.id = grupo_id));

-- Cuota de envío: 30 mensajes por minuto por dispositivo; 20 hilos por hora.
create function public.cuota_bb() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'mensajes_bb' and (select count(*) from public.mensajes_bb m
      where m.dispositivo_id = new.dispositivo_id and m.creado > now() - interval '1 minute') >= 30 then
    raise exception 'Demasiados mensajes seguidos; espera un minuto.' using errcode = 'P0001';
  end if;
  if tg_table_name = 'hilos_bb' and (select count(*) from public.hilos_bb h
      where h.dispositivo_id = new.dispositivo_id and h.creado > now() - interval '1 hour') >= 20 then
    raise exception 'Demasiados hilos nuevos; espera un rato.' using errcode = 'P0001';
  end if;
  new.creado := now();
  return new;
end $$;
create trigger mensajes_bb_cuota before insert on public.mensajes_bb for each row execute function public.cuota_bb();
create trigger hilos_bb_cuota before insert on public.hilos_bb for each row execute function public.cuota_bb();

-- ── Operaciones (RPC) ───────────────────────────────────────────────────────
-- Registra este dispositivo (idempotente: si ya existe, devuelve el mismo y no cambia sus claves).
create function public.registrar_dispositivo_bb(p_nombre text, p_clave_firma text, p_clave_acuerdo text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_dispositivo uuid; v_persona uuid;
begin
  if auth.uid() is null then raise exception 'Sin sesión.' using errcode = '42501'; end if;
  select id into v_dispositivo from public.dispositivos_bb where auth_uid = auth.uid();
  if v_dispositivo is not null then return v_dispositivo; end if;
  insert into public.personas_bb default values returning id into v_persona;
  insert into public.dispositivos_bb (persona_id, auth_uid, nombre, clave_firma, clave_acuerdo)
    values (v_persona, auth.uid(), p_nombre, p_clave_firma, p_clave_acuerdo) returning id into v_dispositivo;
  return v_dispositivo;
end $$;

create function public.crear_grupo_bb() returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_persona uuid := public.mi_persona_bb(); v_grupo uuid;
begin
  if v_persona is null then raise exception 'Registra este dispositivo primero.' using errcode = '42501'; end if;
  if (select count(*) from public.grupos_bb where creado_por = v_persona) >= 5 then
    raise exception 'Llegaste al máximo de grupos.' using errcode = 'P0001';
  end if;
  insert into public.grupos_bb (creado_por) values (v_persona) returning id into v_grupo;
  insert into public.miembros_bb (grupo_id, persona_id, rol) values (v_grupo, v_persona, 'admin');
  return v_grupo;
end $$;

-- El cliente genera el token y envía solo su SHA-256; el token viaja en el QR, nunca aquí.
create function public.crear_invitacion_bb(p_grupo uuid, p_token_hash bytea, p_para_mi boolean default false)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.es_admin_bb(p_grupo) then raise exception 'Solo quien administra el grupo invita.' using errcode = '42501'; end if;
  if (select count(*) from public.invitaciones_bb where grupo_id = p_grupo and usada is null and expira > now()) >= 5 then
    raise exception 'Hay demasiadas invitaciones abiertas.' using errcode = 'P0001';
  end if;
  insert into public.invitaciones_bb (grupo_id, token_hash, creada_por, para_mi, expira)
    values (p_grupo, p_token_hash, public.mi_dispositivo_bb(), p_para_mi, now() + interval '15 minutes')
    returning id into v_id;
  return v_id;
end $$;

-- Gasta la invitación y deja una solicitud pendiente. El mismo error para todo lo inválido.
create function public.usar_invitacion_bb(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_inv public.invitaciones_bb; v_dispositivo uuid := public.mi_dispositivo_bb(); v_id uuid;
begin
  if v_dispositivo is null then raise exception 'Registra este dispositivo primero.' using errcode = '42501'; end if;
  select * into v_inv from public.invitaciones_bb
    where token_hash = extensions.digest(convert_to(coalesce(p_token, ''), 'UTF8'), 'sha256')
      and usada is null and expira > now()
    for update;
  if v_inv.id is null or public.es_miembro_bb(v_inv.grupo_id) then
    raise exception 'La invitación no es válida o ya se usó.' using errcode = 'P0001';
  end if;
  update public.invitaciones_bb set usada = now() where id = v_inv.id;
  insert into public.solicitudes_bb (grupo_id, invitacion_id, dispositivo_id)
    values (v_inv.grupo_id, v_inv.id, v_dispositivo) returning id into v_id;
  return v_id;
end $$;

-- Tras comparar la huella en pantalla, el admin aprueba o rechaza.
-- Si la invitación era «para mí», el dispositivo nuevo pasa a ser de la misma persona del admin.
create function public.resolver_solicitud_bb(p_solicitud uuid, p_aprobar boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_sol public.solicitudes_bb; v_inv public.invitaciones_bb; v_persona_nueva uuid; v_mia uuid := public.mi_persona_bb();
begin
  select * into v_sol from public.solicitudes_bb where id = p_solicitud and estado = 'pendiente' for update;
  if v_sol.id is null or not public.es_admin_bb(v_sol.grupo_id) then
    raise exception 'Solicitud no encontrada.' using errcode = 'P0001';
  end if;
  update public.solicitudes_bb set estado = case when p_aprobar then 'aprobada' else 'rechazada' end, resuelta = now()
    where id = v_sol.id;
  if not p_aprobar then return; end if;
  select * into v_inv from public.invitaciones_bb where id = v_sol.invitacion_id;
  select persona_id into v_persona_nueva from public.dispositivos_bb where id = v_sol.dispositivo_id;
  if v_inv.para_mi then
    if (select persona_id from public.dispositivos_bb where id = v_inv.creada_por) is distinct from v_mia then
      raise exception 'Solo quien creó la invitación puede sumar su propio dispositivo.' using errcode = '42501';
    end if;
    update public.dispositivos_bb set persona_id = v_mia where id = v_sol.dispositivo_id;
    delete from public.personas_bb p where p.id = v_persona_nueva
      and not exists (select 1 from public.dispositivos_bb d where d.persona_id = p.id)
      and not exists (select 1 from public.miembros_bb m where m.persona_id = p.id);
  else
    insert into public.miembros_bb (grupo_id, persona_id) values (v_sol.grupo_id, v_persona_nueva)
      on conflict do nothing;
  end if;
end $$;

-- Bloquear un dispositivo propio (perdido) o, si soy admin, el de otro miembro. Rota la época de sus grupos:
-- desde ahí los mensajes nuevos van con una clave que ese dispositivo nunca recibe.
create function public.bloquear_dispositivo_bb(p_dispositivo uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_persona uuid;
begin
  select persona_id into v_persona from public.dispositivos_bb where id = p_dispositivo;
  if v_persona is null or not (v_persona = public.mi_persona_bb() or exists (
      select 1 from public.miembros_bb m where m.persona_id = v_persona and public.es_admin_bb(m.grupo_id))) then
    raise exception 'No puedes bloquear ese dispositivo.' using errcode = '42501';
  end if;
  update public.dispositivos_bb set estado = 'bloqueado' where id = p_dispositivo;
  update public.grupos_bb g set epoca = g.epoca + 1
    where g.id in (select m.grupo_id from public.miembros_bb m where m.persona_id = v_persona);
end $$;

revoke all on function public.mi_dispositivo_bb(), public.mi_persona_bb(), public.es_miembro_bb(uuid),
  public.es_admin_bb(uuid), public.comparto_grupo_bb(uuid), public.solicita_en_mi_grupo_bb(uuid),
  public.cuota_bb(), public.registrar_dispositivo_bb(text, text, text), public.crear_grupo_bb(),
  public.crear_invitacion_bb(uuid, bytea, boolean), public.usar_invitacion_bb(text),
  public.resolver_solicitud_bb(uuid, boolean), public.bloquear_dispositivo_bb(uuid)
  from public, anon;
grant execute on function public.mi_dispositivo_bb(), public.mi_persona_bb(), public.es_miembro_bb(uuid),
  public.es_admin_bb(uuid), public.comparto_grupo_bb(uuid), public.solicita_en_mi_grupo_bb(uuid),
  public.registrar_dispositivo_bb(text, text, text), public.crear_grupo_bb(),
  public.crear_invitacion_bb(uuid, bytea, boolean), public.usar_invitacion_bb(text),
  public.resolver_solicitud_bb(uuid, boolean), public.bloquear_dispositivo_bb(uuid)
  to authenticated;
