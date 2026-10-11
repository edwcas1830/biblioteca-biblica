-- Biblioteca Bíblica · ajustes del servidor antes del cliente del chat.
-- CONSENSO-CHAT.md (épocas en hilos, quién envuelve, historia, huella fijada, recuperación en papel)
-- y CONSENSO-WEB.md (re-vincular con Edge Function, auth_uid sin cascada, mensajes serializados).
-- Edward eligió la recuperación en PAPEL (11-oct-2026).
-- La verificación ECDSA de los desafíos la hace una Edge Function (pgcrypto no verifica ECDSA);
-- aquí quedan los desafíos y las funciones que solo el backend (service_role) puede consumir.

-- ── 1. Dispositivos: sin cascada desde auth, tipo, huella fijada, estado «pendiente» ──────────────
-- Antes: borrar un usuario anónimo borraba el dispositivo y, en cascada, sus mensajes y envolturas.
alter table public.dispositivos_bb alter column auth_uid drop not null;
alter table public.dispositivos_bb drop constraint dispositivos_bb_auth_uid_fkey;
alter table public.dispositivos_bb add constraint dispositivos_bb_auth_uid_fkey
  foreign key (auth_uid) references auth.users(id) on delete set null;

-- «recuperacion»: la credencial en papel. No tiene sesión (auth_uid nulo), así que nunca escribe;
-- solo recibe envolturas de cada época para restaurar la historia.
alter table public.dispositivos_bb add column tipo text not null default 'normal'
  check (tipo in ('normal', 'recuperacion'));
-- Huella de las claves públicas (fijada desde el alta; al aprobar se exige que sea la que se comparó).
alter table public.dispositivos_bb add column huella text check (huella is null or char_length(huella) = 43);
alter table public.dispositivos_bb drop constraint dispositivos_bb_estado_check;
alter table public.dispositivos_bb add constraint dispositivos_bb_estado_check
  check (estado in ('activo', 'pendiente', 'bloqueado'));
alter table public.solicitudes_bb add column huella text check (huella is null or char_length(huella) = 43);

-- Las claves públicas de un dispositivo son inmutables: cambiarlas exigiría verificar de nuevo.
create function public.claves_inmutables_bb() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.clave_firma is distinct from old.clave_firma or new.clave_acuerdo is distinct from old.clave_acuerdo then
    raise exception 'Las claves de un dispositivo no cambian; registra uno nuevo.' using errcode = '42501';
  end if;
  if old.huella is not null and new.huella is distinct from old.huella then
    raise exception 'La huella fijada no cambia.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger dispositivos_bb_claves before update on public.dispositivos_bb
  for each row execute function public.claves_inmutables_bb();

-- La misma huella que calcula shared/chat-cripto.js (huellaDispositivo):
-- base64url(SHA-256(JSON ["bb/dispositivo",1,id,firma,acuerdo])). Las claves son base64url: no hay que escapar.
create function public.huella_bb(p_id uuid, p_firma text, p_acuerdo text) returns text
language sql immutable set search_path = '' as $$
  select translate(rtrim(encode(extensions.digest(convert_to(
    '["bb/dispositivo",1,"' || p_id::text || '","' || p_firma || '","' || p_acuerdo || '"]', 'UTF8'), 'sha256'),
    'base64'), '='), '+/', '-_')
$$;

-- La huella queda fijada desde el alta (es función de las claves, que ya no cambian); el aprobar
-- comprueba que el admin comparó esa misma. Se completa en los dispositivos que ya existían.
create function public.huella_al_alta_bb() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.huella := public.huella_bb(new.id, new.clave_firma, new.clave_acuerdo);
  return new;
end $$;
create trigger dispositivos_bb_huella before insert on public.dispositivos_bb
  for each row execute function public.huella_al_alta_bb();
update public.dispositivos_bb set huella = public.huella_bb(id, clave_firma, clave_acuerdo) where huella is null;

-- ── 2. Hilos con época ───────────────────────────────────────────────────────────────────────────
-- El título del hilo se sella con la clave de la época en que se creó.
alter table public.hilos_bb add column epoca int not null default 1 check (epoca >= 1);
drop policy hilos_bb_crear on public.hilos_bb;
create policy hilos_bb_crear on public.hilos_bb for insert to authenticated
  with check (
    dispositivo_id = public.mi_dispositivo_bb()
    and public.es_miembro_bb(grupo_id)
    and epoca = (select g.epoca from public.grupos_bb g where g.id = grupo_id));

-- ── 3. Quién envuelve, y la historia ─────────────────────────────────────────────────────────────
-- Época actual: el admin (coordinador) para cualquier dispositivo activo de un miembro,
--               o cualquiera para un dispositivo activo de su misma persona (su teléfono nuevo, su papel).
-- Épocas pasadas (historia): igual, pero solo si mi persona ya tiene esa época (no se inventan claves viejas).
-- Nunca se pisa: la clave primaria (grupo, época, dispositivo) impide una segunda envoltura y no hay UPDATE.
-- ¿Algún dispositivo de mi persona (otro teléfono, el papel) tiene ya esa época? Sin RLS: cada
-- dispositivo solo ve sus propias envolturas, y el teléfono restaurado necesita ver las del papel.
create function public.mi_persona_tiene_epoca_bb(g uuid, e int) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.claves_grupo_bb k join public.dispositivos_bb d on d.id = k.dispositivo_id
    where k.grupo_id = g and k.epoca = e and d.persona_id = public.mi_persona_bb())
$$;

drop policy claves_grupo_bb_entregar on public.claves_grupo_bb;
create policy claves_grupo_bb_entregar on public.claves_grupo_bb for insert to authenticated
  with check (
    envuelta_por = public.mi_dispositivo_bb()
    and public.es_miembro_bb(grupo_id)
    and exists (
      select 1 from public.dispositivos_bb d join public.miembros_bb m on m.persona_id = d.persona_id
      where d.id = dispositivo_id and d.estado = 'activo' and m.grupo_id = claves_grupo_bb.grupo_id
        and (public.es_admin_bb(claves_grupo_bb.grupo_id) or d.persona_id = public.mi_persona_bb()))
    and (
      epoca = (select g.epoca from public.grupos_bb g where g.id = grupo_id)
      or (epoca < (select g.epoca from public.grupos_bb g where g.id = grupo_id)
          and public.mi_persona_tiene_epoca_bb(grupo_id, epoca))));

-- ── 4. Aprobar fijando la huella ─────────────────────────────────────────────────────────────────
-- El admin manda la huella que vio en pantalla; el servidor comprueba que corresponde a las claves
-- que tiene guardadas y la fija. Así nadie aprueba sin comparar, y el servidor no puede cambiar las claves después.
drop function public.resolver_solicitud_bb(uuid, boolean);
create function public.resolver_solicitud_bb(p_solicitud uuid, p_aprobar boolean, p_huella text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_sol public.solicitudes_bb; v_inv public.invitaciones_bb; v_disp public.dispositivos_bb;
        v_persona_nueva uuid; v_mia uuid := public.mi_persona_bb();
begin
  select * into v_sol from public.solicitudes_bb where id = p_solicitud and estado = 'pendiente' for update;
  if v_sol.id is null or not public.es_admin_bb(v_sol.grupo_id) then
    raise exception 'Solicitud no encontrada.' using errcode = 'P0001';
  end if;
  if not p_aprobar then
    update public.solicitudes_bb set estado = 'rechazada', resuelta = now() where id = v_sol.id;
    return;
  end if;
  select * into v_disp from public.dispositivos_bb where id = v_sol.dispositivo_id for update;
  if p_huella is null or p_huella <> public.huella_bb(v_disp.id, v_disp.clave_firma, v_disp.clave_acuerdo) then
    raise exception 'La huella no coincide con ese dispositivo; no se aprueba.' using errcode = 'P0001';
  end if;
  update public.solicitudes_bb set estado = 'aprobada', resuelta = now(), huella = p_huella where id = v_sol.id;
  select * into v_inv from public.invitaciones_bb where id = v_sol.invitacion_id;
  v_persona_nueva := v_disp.persona_id;
  if v_inv.para_mi then
    if (select persona_id from public.dispositivos_bb where id = v_inv.creada_por) is distinct from v_mia then
      raise exception 'Solo quien creó la invitación puede sumar su propio dispositivo.' using errcode = '42501';
    end if;
    update public.dispositivos_bb set persona_id = v_mia where id = v_disp.id;
    delete from public.personas_bb p where p.id = v_persona_nueva
      and not exists (select 1 from public.dispositivos_bb d where d.persona_id = p.id)
      and not exists (select 1 from public.miembros_bb m where m.persona_id = p.id);
  else
    insert into public.miembros_bb (grupo_id, persona_id) values (v_sol.grupo_id, v_persona_nueva)
      on conflict do nothing;
  end if;
end $$;

-- ── 5. Mensajes serializados por grupo ───────────────────────────────────────────────────────────
-- «identity» puede confirmarse fuera de orden entre transacciones (101 después de 102) y el cursor
-- se saltaría el 101. Un candado por grupo antes del INSERT lo impide. Sin inserción directa.
drop policy mensajes_bb_enviar on public.mensajes_bb;
revoke insert on public.mensajes_bb from authenticated;

create function public.enviar_mensaje_bb(p_id uuid, p_grupo uuid, p_hilo uuid, p_epoca int, p_sobre text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_disp uuid := public.mi_dispositivo_bb(); v_seq bigint;
begin
  if v_disp is null or (select tipo from public.dispositivos_bb where id = v_disp) <> 'normal'
     or not public.es_miembro_bb(p_grupo) then
    raise exception 'No puedes escribir en este grupo.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('mensajes_bb:' || p_grupo::text, 0));
  if p_epoca <> (select g.epoca from public.grupos_bb g where g.id = p_grupo) then
    raise exception 'Época vieja: actualiza las claves del grupo.' using errcode = 'P0001';
  end if;
  -- Reenviar el mismo id (cola del cliente) devuelve el mismo seq sin duplicar.
  select seq into v_seq from public.mensajes_bb where id = p_id and grupo_id = p_grupo and dispositivo_id = v_disp;
  if v_seq is not null then return v_seq; end if;
  insert into public.mensajes_bb (id, grupo_id, hilo_id, dispositivo_id, epoca, sobre)
    values (p_id, p_grupo, p_hilo, v_disp, p_epoca, p_sobre) returning seq into v_seq;
  return v_seq;
end $$;

-- ── 6. Credencial de recuperación en papel ───────────────────────────────────────────────────────
-- Un dispositivo mío sin sesión, con las claves públicas del papel. Activo para recibir envolturas;
-- nunca escribe (sin auth_uid, mi_dispositivo_bb() jamás lo devuelve). Máximo 2 por persona.
create function public.crear_recuperacion_bb(p_clave_firma text, p_clave_acuerdo text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_persona uuid := public.mi_persona_bb(); v_id uuid;
begin
  if v_persona is null then raise exception 'Registra este dispositivo primero.' using errcode = '42501'; end if;
  if (select count(*) from public.dispositivos_bb where persona_id = v_persona and tipo = 'recuperacion' and estado = 'activo') >= 2 then
    raise exception 'Ya tienes dos papeles de recuperación activos; bloquea uno primero.' using errcode = 'P0001';
  end if;
  insert into public.dispositivos_bb (persona_id, auth_uid, nombre, clave_firma, clave_acuerdo, tipo)
    values (v_persona, null, 'Papel de recuperación', p_clave_firma, p_clave_acuerdo, 'recuperacion')
    returning id into v_id;
  return v_id;
end $$;

-- ── 7. Desafíos firmados: re-vincular y restaurar con el papel ───────────────────────────────────
-- Una sesión anónima nueva pide un desafío para un dispositivo; firma con la clave privada (la que
-- quedó en el teléfono, o la del papel). La Edge Function verifica la firma contra la clave pública
-- FIJADA de ese dispositivo y llama a consumir_*; nunca acepta una clave pública que mande el cliente.
create table public.desafios_bb (
  id uuid primary key default gen_random_uuid(),
  dispositivo_id uuid not null references public.dispositivos_bb(id) on delete cascade,
  auth_uid uuid not null references auth.users(id) on delete cascade,
  tipo text not null check (tipo in ('revincular', 'recuperar')),
  nonce bytea not null default extensions.gen_random_bytes(32) check (octet_length(nonce) = 32),
  creado timestamptz not null default now(),
  expira timestamptz not null default now() + interval '5 minutes',
  usado timestamptz
);
create index desafios_bb_dispositivo on public.desafios_bb (dispositivo_id, creado);
alter table public.desafios_bb enable row level security;
revoke all on public.desafios_bb from anon, authenticated;

-- Texto exacto que se firma (el cliente y la Edge Function lo arman igual):
-- ["bb/desafio",1,tipo,desafio_id,dispositivo_id,huella_fijada,auth_uid,nonce_b64url,expira_unix]
create function public.texto_desafio_bb(d public.desafios_bb) returns text
language sql stable set search_path = '' as $$
  select '["bb/desafio",1,"' || d.tipo || '","' || d.id || '","' || d.dispositivo_id || '","'
    || coalesce((select x.huella from public.dispositivos_bb x where x.id = d.dispositivo_id), '') || '","'
    || d.auth_uid || '","' || translate(rtrim(encode(d.nonce, 'base64'), '='), '+/', '-_') || '",'
    || extract(epoch from d.expira)::bigint || ']'
$$;

-- La sesión nueva no debe tener dispositivo todavía. Mismo error para todo lo inválido. Cuota: 5 por hora.
create function public.pedir_desafio_bb(p_dispositivo uuid, p_tipo text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_d public.dispositivos_bb; v_x public.desafios_bb;
begin
  if auth.uid() is null or exists (select 1 from public.dispositivos_bb where auth_uid = auth.uid()) then
    raise exception 'Esta sesión ya tiene dispositivo.' using errcode = '42501';
  end if;
  select * into v_d from public.dispositivos_bb where id = p_dispositivo;
  if v_d.id is null or v_d.huella is null
     or (p_tipo = 'revincular' and not (v_d.tipo = 'normal' and v_d.estado = 'activo'))
     or (p_tipo = 'recuperar' and not (v_d.tipo = 'recuperacion' and v_d.estado = 'activo'))
     or p_tipo not in ('revincular', 'recuperar') then
    raise exception 'No se puede pedir ese desafío.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.desafios_bb where dispositivo_id = p_dispositivo and creado > now() - interval '1 hour') >= 5 then
    raise exception 'Demasiados intentos; espera una hora.' using errcode = 'P0001';
  end if;
  insert into public.desafios_bb (dispositivo_id, auth_uid, tipo) values (p_dispositivo, auth.uid(), p_tipo)
    returning * into v_x;
  return jsonb_build_object('id', v_x.id, 'texto', public.texto_desafio_bb(v_x), 'expira', v_x.expira);
end $$;

-- Solo backend: datos para que la Edge Function verifique (clave fijada + texto exacto).
create function public.datos_desafio_bb(p_desafio uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_x public.desafios_bb; v_d public.dispositivos_bb;
begin
  select * into v_x from public.desafios_bb where id = p_desafio and usado is null and expira > now();
  if v_x.id is null then raise exception 'Desafío vencido o usado.' using errcode = 'P0001'; end if;
  select * into v_d from public.dispositivos_bb where id = v_x.dispositivo_id;
  if v_d.huella is null or v_d.huella <> public.huella_bb(v_d.id, v_d.clave_firma, v_d.clave_acuerdo) then
    raise exception 'El dispositivo no tiene una huella fijada válida.' using errcode = 'P0001';
  end if;
  return jsonb_build_object('texto', public.texto_desafio_bb(v_x), 'clave_firma', v_d.clave_firma,
                            'auth_uid', v_x.auth_uid, 'tipo', v_x.tipo);
end $$;

-- Solo backend, tras verificar la firma: la sesión nueva pasa a ser la de ese dispositivo. Atómico.
-- La sesión vieja deja de valer (mi_dispositivo_bb() ya no la reconoce). Identidad, claves y grupos no cambian.
create function public.consumir_revinculacion_bb(p_desafio uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_x public.desafios_bb;
begin
  select * into v_x from public.desafios_bb where id = p_desafio and tipo = 'revincular'
    and usado is null and expira > now() for update;
  if v_x.id is null then raise exception 'Desafío vencido o usado.' using errcode = 'P0001'; end if;
  perform 1 from public.dispositivos_bb where id = v_x.dispositivo_id and estado = 'activo' and tipo = 'normal' for update;
  if not found then raise exception 'Dispositivo bloqueado o inexistente.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.dispositivos_bb where auth_uid = v_x.auth_uid) then
    raise exception 'Esa sesión ya tiene dispositivo.' using errcode = 'P0001';
  end if;
  update public.desafios_bb set usado = now() where id = v_x.id;
  update public.dispositivos_bb set auth_uid = v_x.auth_uid where id = v_x.dispositivo_id;
  return v_x.dispositivo_id;
end $$;

-- Solo backend, tras verificar la firma del PAPEL: alta de un teléfono nuevo de la misma persona,
-- en estado «pendiente» hasta que otro miembro (Laura o Edward) compare la huella y apruebe.
create function public.consumir_recuperacion_bb(p_desafio uuid, p_nombre text, p_clave_firma text, p_clave_acuerdo text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_x public.desafios_bb; v_persona uuid; v_id uuid;
begin
  select * into v_x from public.desafios_bb where id = p_desafio and tipo = 'recuperar'
    and usado is null and expira > now() for update;
  if v_x.id is null then raise exception 'Desafío vencido o usado.' using errcode = 'P0001'; end if;
  select persona_id into v_persona from public.dispositivos_bb
    where id = v_x.dispositivo_id and estado = 'activo' and tipo = 'recuperacion';
  if v_persona is null then raise exception 'Papel bloqueado o inexistente.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.dispositivos_bb where auth_uid = v_x.auth_uid) then
    raise exception 'Esa sesión ya tiene dispositivo.' using errcode = 'P0001';
  end if;
  update public.desafios_bb set usado = now() where id = v_x.id;
  insert into public.dispositivos_bb (persona_id, auth_uid, nombre, clave_firma, clave_acuerdo, estado)
    values (v_persona, v_x.auth_uid, p_nombre, p_clave_firma, p_clave_acuerdo, 'pendiente') returning id into v_id;
  return v_id;
end $$;

-- Otro miembro que comparte grupo compara la huella por llamada y aprueba el teléfono restaurado.
create function public.aprobar_restaurado_bb(p_dispositivo uuid, p_huella text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_d public.dispositivos_bb;
begin
  select * into v_d from public.dispositivos_bb where id = p_dispositivo and estado = 'pendiente' for update;
  if v_d.id is null or v_d.persona_id = public.mi_persona_bb() or not public.comparto_grupo_bb(v_d.persona_id) then
    raise exception 'No hay un teléfono restaurado que puedas aprobar.' using errcode = 'P0001';
  end if;
  if p_huella is null or p_huella <> public.huella_bb(v_d.id, v_d.clave_firma, v_d.clave_acuerdo) then
    raise exception 'La huella no coincide; no se aprueba.' using errcode = 'P0001';
  end if;
  update public.dispositivos_bb set estado = 'activo' where id = v_d.id;
end $$;

-- ── 8. Permisos ──────────────────────────────────────────────────────────────────────────────────
revoke all on function public.claves_inmutables_bb(), public.huella_al_alta_bb(), public.huella_bb(uuid, text, text),
  public.mi_persona_tiene_epoca_bb(uuid, int),
  public.resolver_solicitud_bb(uuid, boolean, text), public.enviar_mensaje_bb(uuid, uuid, uuid, int, text),
  public.crear_recuperacion_bb(text, text), public.texto_desafio_bb(public.desafios_bb),
  public.pedir_desafio_bb(uuid, text), public.datos_desafio_bb(uuid), public.consumir_revinculacion_bb(uuid),
  public.consumir_recuperacion_bb(uuid, text, text, text), public.aprobar_restaurado_bb(uuid, text)
  from public, anon, authenticated;
grant execute on function public.huella_bb(uuid, text, text), public.mi_persona_tiene_epoca_bb(uuid, int),
  public.resolver_solicitud_bb(uuid, boolean, text),
  public.enviar_mensaje_bb(uuid, uuid, uuid, int, text), public.crear_recuperacion_bb(text, text),
  public.pedir_desafio_bb(uuid, text), public.aprobar_restaurado_bb(uuid, text)
  to authenticated;
-- Lo que cambia quién es quién solo lo llama la Edge Function (service_role), después de verificar la firma.
grant execute on function public.datos_desafio_bb(uuid), public.consumir_revinculacion_bb(uuid),
  public.consumir_recuperacion_bb(uuid, text, text, text), public.texto_desafio_bb(public.desafios_bb)
  to service_role;
