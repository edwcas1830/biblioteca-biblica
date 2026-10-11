-- Prueba de 001_foro_bb.sql: pegar DESPUÉS del contenido de la migración, en la misma ejecución.
-- Crea cuatro usuarios anónimos de mentira (Edward, Laura, su segundo dispositivo e intruso), recorre el flujo
-- y termina con un error a propósito que muestra el informe: así Postgres deshace TODO (migración incluida).
do $$
declare
  r text[] := '{}';
  uA uuid := gen_random_uuid(); uB uuid := gen_random_uuid(); uC uuid := gen_random_uuid(); uA2 uuid := gen_random_uuid();
  dA uuid; dB uuid; dC uuid; dA2 uuid; g uuid; sB uuid; sA2 uuid; n int; t uuid := gen_random_uuid(); ok boolean;
  k text := repeat('k', 90);
begin
  begin
    -- Altas anónimas reales (sin correo), como las de los teléfonos. Requiere 002 en el proyecto compartido.
    insert into auth.users (id, instance_id, aud, role, is_anonymous, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', true, now(), now(),
           '{"provider":"anonymous","providers":["anonymous"]}', '{}'
    from unnest(array[uA, uB, uC, uA2]) u;
    r := r || 'OK  alta de usuarios anónimos (con el disparador actual del proyecto)'::text;
  exception when others then
    raise exception 'FALLA alta de usuarios anónimos: % (%)', sqlerrm, sqlstate;
  end;
  select count(*) into n from public.profiles where id in (uA, uB, uC, uA2);
  r := r || (case when n = 0 then 'OK  los anónimos no crean perfiles del Centro de Mando' else 'FALLA se crearon ' || n || ' perfiles en profiles' end)::text;

  -- Edward (A): registra, crea el grupo e invita a Laura y a su propio segundo dispositivo.
  perform set_config('request.jwt.claims', json_build_object('sub', uA, 'role', 'authenticated', 'is_anonymous', true)::text, true);
  perform set_config('role', 'authenticated', true);
  dA := public.registrar_dispositivo_bb('PC de Edward', k, k);
  ok := dA = public.registrar_dispositivo_bb('otra vez', k, k);
  r := r || (case when ok then 'OK  registrar es idempotente' else 'FALLA registrar duplicó' end)::text;
  g := public.crear_grupo_bb();
  perform public.crear_invitacion_bb(g, extensions.digest('token-laura', 'sha256'));
  perform public.crear_invitacion_bb(g, extensions.digest('token-edward-2', 'sha256'), true);
  r := r || 'OK  grupo e invitaciones creados'::text;

  -- Intruso (C): no ve nada, no escribe, no adivina invitaciones.
  perform set_config('request.jwt.claims', json_build_object('sub', uC, 'role', 'authenticated', 'is_anonymous', true)::text, true);
  dC := public.registrar_dispositivo_bb('Intruso', k, k);
  select count(*) into n from public.grupos_bb; r := r || (case when n = 0 then 'OK  intruso no ve grupos' else 'FALLA intruso ve grupos' end)::text;
  select count(*) into n from public.dispositivos_bb; r := r || (case when n = 1 then 'OK  intruso solo ve su dispositivo' else 'FALLA intruso ve ' || n || ' dispositivos' end)::text;
  begin
    insert into public.hilos_bb (id, grupo_id, tipo, dispositivo_id, sobre) values (gen_random_uuid(), g, 'chat', dC, 'x');
    r := r || 'FALLA intruso creó un hilo'::text;
  exception when others then r := r || 'OK  intruso no puede crear hilos'::text; end;
  begin
    perform public.usar_invitacion_bb('token-equivocado');
    r := r || 'FALLA token equivocado aceptado'::text;
  exception when others then r := r || 'OK  token equivocado rechazado'::text; end;

  -- Laura (B): usa la invitación; queda pendiente y todavía no ve nada.
  perform set_config('request.jwt.claims', json_build_object('sub', uB, 'role', 'authenticated', 'is_anonymous', true)::text, true);
  dB := public.registrar_dispositivo_bb('Teléfono de Laura', k, k);
  sB := public.usar_invitacion_bb('token-laura');
  select count(*) into n from public.grupos_bb; r := r || (case when n = 0 then 'OK  pendiente no ve el grupo' else 'FALLA pendiente ve el grupo' end)::text;
  select count(*) into n from public.solicitudes_bb where id = sB; r := r || (case when n = 1 then 'OK  Laura ve su solicitud' else 'FALLA Laura no ve su solicitud' end)::text;

  -- El intruso intenta reusar la invitación de Laura.
  perform set_config('request.jwt.claims', json_build_object('sub', uC, 'role', 'authenticated', 'is_anonymous', true)::text, true);
  begin
    perform public.usar_invitacion_bb('token-laura');
    r := r || 'FALLA invitación reutilizada'::text;
  exception when others then r := r || 'OK  invitación de un solo uso'::text; end;
  begin
    perform public.resolver_solicitud_bb(sB, true);
    r := r || 'FALLA intruso aprobó una solicitud'::text;
  exception when others then r := r || 'OK  intruso no aprueba solicitudes'::text; end;

  -- Edward ve la solicitud y las claves públicas de Laura (para comparar la huella), aprueba y le entrega la clave.
  perform set_config('request.jwt.claims', json_build_object('sub', uA, 'role', 'authenticated', 'is_anonymous', true)::text, true);
  select count(*) into n from public.dispositivos_bb where id = dB; r := r || (case when n = 1 then 'OK  admin ve la clave pública del que pide entrar' else 'FALLA admin no ve al que pide entrar' end)::text;
  perform public.resolver_solicitud_bb(sB, true);
  insert into public.claves_grupo_bb (grupo_id, epoca, dispositivo_id, envuelta_por, clave_envuelta) values (g, 1, dB, dA, k), (g, 1, dA, dA, k);
  begin
    insert into public.claves_grupo_bb (grupo_id, epoca, dispositivo_id, envuelta_por, clave_envuelta) values (g, 1, dC, dA, k);
    r := r || 'FALLA se entregó clave a un no miembro'::text;
  exception when others then r := r || 'OK  no se entrega clave a un no miembro'::text; end;
  insert into public.hilos_bb (id, grupo_id, tipo, dispositivo_id, sobre) values (t, g, 'chat', dA, 'sobre-cifrado');
  insert into public.mensajes_bb (id, grupo_id, hilo_id, dispositivo_id, epoca, sobre) values (gen_random_uuid(), g, t, dA, 1, 'sobre-cifrado');
  begin
    insert into public.mensajes_bb (id, grupo_id, hilo_id, dispositivo_id, epoca, sobre) values (gen_random_uuid(), g, t, dB, 1, 'suplantado');
    r := r || 'FALLA Edward escribió como Laura'::text;
  exception when others then r := r || 'OK  nadie escribe con el dispositivo de otro'::text; end;
  r := r || 'OK  Edward aprobó, entregó la clave y escribió'::text;

  -- Laura ya es miembro: ve su clave y el mensaje, y responde.
  perform set_config('request.jwt.claims', json_build_object('sub', uB, 'role', 'authenticated', 'is_anonymous', true)::text, true);
  select count(*) into n from public.claves_grupo_bb; r := r || (case when n = 1 then 'OK  Laura ve solo su clave envuelta' else 'FALLA Laura ve ' || n || ' claves' end)::text;
  insert into public.mensajes_bb (id, grupo_id, hilo_id, dispositivo_id, epoca, sobre) values (gen_random_uuid(), g, t, dB, 1, 'respuesta-cifrada');
  select count(*) into n from public.mensajes_bb; r := r || (case when n = 2 then 'OK  Laura lee y responde' else 'FALLA Laura ve ' || n || ' mensajes' end)::text;
  begin
    update public.mensajes_bb set sobre = 'cambiado';
    get diagnostics n = row_count;
    r := r || (case when n = 0 then 'OK  nadie edita mensajes' else 'FALLA se editaron mensajes' end)::text;
  exception when others then r := r || 'OK  nadie edita mensajes'::text; end;

  -- El intruso sigue sin ver nada.
  perform set_config('request.jwt.claims', json_build_object('sub', uC, 'role', 'authenticated', 'is_anonymous', true)::text, true);
  select count(*) into n from public.mensajes_bb; r := r || (case when n = 0 then 'OK  intruso no lee mensajes' else 'FALLA intruso lee mensajes' end)::text;
  select count(*) into n from public.personas_bb; r := r || (case when n = 1 then 'OK  intruso solo ve su persona' else 'FALLA intruso ve ' || n || ' personas' end)::text;

  -- Segundo dispositivo de Edward: entra con la invitación «para mí» y queda como la misma persona.
  perform set_config('request.jwt.claims', json_build_object('sub', uA2, 'role', 'authenticated', 'is_anonymous', true)::text, true);
  dA2 := public.registrar_dispositivo_bb('Teléfono de Edward', k, k);
  sA2 := public.usar_invitacion_bb('token-edward-2');
  perform set_config('request.jwt.claims', json_build_object('sub', uA, 'role', 'authenticated', 'is_anonymous', true)::text, true);
  perform public.resolver_solicitud_bb(sA2, true);
  perform set_config('request.jwt.claims', json_build_object('sub', uA2, 'role', 'authenticated', 'is_anonymous', true)::text, true);
  ok := public.mi_persona_bb() = (select persona_id from public.dispositivos_bb where id = dA);
  select count(*) into n from public.mensajes_bb;
  r := r || (case when ok and n = 2 then 'OK  segundo dispositivo de Edward es la misma persona y lee' else 'FALLA segundo dispositivo' end)::text;

  -- Teléfono perdido: Edward bloquea a Laura (como admin); ella pierde el acceso y la época sube.
  perform set_config('request.jwt.claims', json_build_object('sub', uA, 'role', 'authenticated', 'is_anonymous', true)::text, true);
  perform public.bloquear_dispositivo_bb(dB);
  select epoca into n from public.grupos_bb where id = g; r := r || (case when n = 2 then 'OK  bloquear rota la época' else 'FALLA época ' || n end)::text;
  begin
    insert into public.mensajes_bb (id, grupo_id, hilo_id, dispositivo_id, epoca, sobre) values (gen_random_uuid(), g, t, dA, 1, 'época vieja');
    r := r || 'FALLA se aceptó un mensaje con la época vieja'::text;
  exception when others then r := r || 'OK  mensajes nuevos exigen la época nueva'::text; end;
  perform set_config('request.jwt.claims', json_build_object('sub', uB, 'role', 'authenticated', 'is_anonymous', true)::text, true);
  select count(*) into n from public.mensajes_bb; r := r || (case when n = 0 then 'OK  dispositivo bloqueado ya no lee' else 'FALLA bloqueado lee ' || n end)::text;

  -- Sin sesión (rol anon) no hay acceso a nada.
  perform set_config('role', 'anon', true);
  begin
    select count(*) into n from public.personas_bb;
    r := r || 'FALLA anon lee personas'::text;
  exception when others then r := r || 'OK  sin sesión no se lee nada'::text; end;
  begin
    perform public.crear_grupo_bb();
    r := r || 'FALLA anon ejecuta funciones'::text;
  exception when others then r := r || 'OK  sin sesión no se ejecutan funciones'::text; end;

  raise exception E'INFORME (todo se deshace)\n%', array_to_string(r, E'\n');
end $$;
