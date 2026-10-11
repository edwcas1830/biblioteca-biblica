-- Prueba de 003_foro_bb.sql: pegar DESPUÉS de 003, en la misma ejecución (con 001 y 002 ya aplicados).
-- Recorre huella fijada, épocas, historia, mensajes serializados, papel, re-vincular y restaurar;
-- termina con un error a propósito que muestra el informe: Postgres deshace TODO.
do $$
declare
  r text[] := '{}';
  uA uuid := gen_random_uuid(); uB uuid := gen_random_uuid(); uC uuid := gen_random_uuid();
  uN uuid := gen_random_uuid(); uR uuid := gen_random_uuid(); uX uuid := gen_random_uuid();
  kA text := repeat('a', 90); kB text := repeat('b', 90); kC text := repeat('c', 90); kP text := repeat('p', 90); kR text := repeat('r', 90);
  dA uuid; dB uuid; dC uuid; dP uuid; dR uuid; g uuid; sB uuid; h uuid := gen_random_uuid(); m uuid := gen_random_uuid();
  n int; s1 bigint; s2 bigint; j jsonb; x uuid; t text;
begin
  -- Vector cruzado con shared/chat-cripto.js (huellaDispositivo en Node).
  t := public.huella_bb('00000000-0000-4000-8000-0000000000a1', repeat('F', 60), repeat('a_-', 20));
  r := r || (case when t = 'e4eawLuHkZEisD1GVLDJdW_Nqq-WFp3BMp1tokX38_c' then 'OK  huella igual a la de chat-cripto.js' else 'FALLA huella SQL ' || t end)::text;

  insert into auth.users (id, instance_id, aud, role, is_anonymous, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', true, now(), now(),
         '{"provider":"anonymous","providers":["anonymous"]}', '{}'
  from unnest(array[uA, uB, uC, uN, uR, uX]) u;

  -- Edward: registra, grupo, invita a Laura, su papel de recuperación.
  perform set_config('request.jwt.claims', json_build_object('sub', uA, 'role', 'authenticated', 'is_anonymous', true)::text, true);
  perform set_config('role', 'authenticated', true);
  dA := public.registrar_dispositivo_bb('PC de Edward', kA, kA);
  select count(*) into n from public.dispositivos_bb where id = dA and huella = public.huella_bb(dA, kA, kA);
  r := r || (case when n = 1 then 'OK  la huella queda fijada al registrar' else 'FALLA sin huella al registrar' end)::text;
  g := public.crear_grupo_bb();
  perform public.crear_invitacion_bb(g, extensions.digest('token-laura', 'sha256'));
  dP := public.crear_recuperacion_bb(kP, kP);
  r := r || 'OK  papel de recuperación creado'::text;
  insert into public.claves_grupo_bb (grupo_id, epoca, dispositivo_id, envuelta_por, clave_envuelta) values
    (g, 1, dA, dA, repeat('e', 60)), (g, 1, dP, dA, repeat('e', 60));
  r := r || 'OK  Edward envuelve la época 1 para él y para su papel'::text;

  -- Laura pide entrar.
  perform set_config('request.jwt.claims', json_build_object('sub', uB, 'role', 'authenticated', 'is_anonymous', true)::text, true);
  dB := public.registrar_dispositivo_bb('Teléfono de Laura', kB, kB);
  sB := public.usar_invitacion_bb('token-laura');

  -- Edward aprueba: sin huella o con otra, no; con la correcta, sí.
  perform set_config('request.jwt.claims', json_build_object('sub', uA, 'role', 'authenticated', 'is_anonymous', true)::text, true);
  begin
    perform public.resolver_solicitud_bb(sB, true);
    r := r || 'FALLA aprobó sin comparar la huella'::text;
  exception when others then r := r || 'OK  sin huella no se aprueba'::text; end;
  begin
    perform public.resolver_solicitud_bb(sB, true, public.huella_bb(dB, kC, kC));
    r := r || 'FALLA aprobó con la huella de otras claves'::text;
  exception when others then r := r || 'OK  huella de otras claves (servidor mentiroso) no se aprueba'::text; end;
  perform public.resolver_solicitud_bb(sB, true, public.huella_bb(dB, kB, kB));
  select count(*) into n from public.miembros_bb where grupo_id = g; r := r || (case when n = 2 then 'OK  con la huella correcta Laura entra' else 'FALLA miembros ' || n end)::text;

  -- Hilos con época y mensajes por RPC.
  begin
    insert into public.hilos_bb (id, grupo_id, tipo, dispositivo_id, sobre, epoca) values (gen_random_uuid(), g, 'chat', dA, 'x', 2);
    r := r || 'FALLA hilo con época futura'::text;
  exception when others then r := r || 'OK  hilo con época equivocada rechazado'::text; end;
  insert into public.hilos_bb (id, grupo_id, tipo, dispositivo_id, sobre, epoca) values (h, g, 'chat', dA, 'titulo', 1);
  s1 := public.enviar_mensaje_bb(m, g, h, 1, 'sobre-1');
  s2 := public.enviar_mensaje_bb(m, g, h, 1, 'sobre-1');
  r := r || (case when s1 = s2 then 'OK  reenviar el mismo id no duplica' else 'FALLA duplicó' end)::text;
  begin
    perform public.enviar_mensaje_bb(gen_random_uuid(), g, h, 2, 'x');
    r := r || 'FALLA mensaje con época equivocada'::text;
  exception when others then r := r || 'OK  mensaje con época equivocada rechazado'::text; end;
  begin
    insert into public.mensajes_bb (id, grupo_id, hilo_id, dispositivo_id, epoca, sobre) values (gen_random_uuid(), g, h, dA, 1, 'x');
    r := r || 'FALLA inserción directa permitida'::text;
  exception when others then r := r || 'OK  sin inserción directa (todo por el RPC serializado)'::text; end;

  -- Rotación de época (como al bloquear) y la historia.
  perform set_config('role', 'postgres', true);
  update public.grupos_bb set epoca = 2 where id = g;
  begin
    update public.dispositivos_bb set clave_firma = kC where id = dB;
    r := r || 'FALLA se cambiaron las claves públicas'::text;
  exception when others then r := r || 'OK  las claves públicas no se pueden cambiar'::text; end;
  perform set_config('role', 'authenticated', true);

  perform set_config('request.jwt.claims', json_build_object('sub', uB, 'role', 'authenticated', 'is_anonymous', true)::text, true);
  begin
    insert into public.claves_grupo_bb (grupo_id, epoca, dispositivo_id, envuelta_por, clave_envuelta) values (g, 1, dB, dB, repeat('e', 60));
    r := r || 'FALLA Laura se inventó una clave de una época que no tenía'::text;
  exception when others then r := r || 'OK  nadie se inventa claves de épocas viejas'::text; end;
  begin
    insert into public.claves_grupo_bb (grupo_id, epoca, dispositivo_id, envuelta_por, clave_envuelta) values (g, 2, dA, dB, repeat('e', 60));
    r := r || 'FALLA Laura (no admin) envolvió para Edward'::text;
  exception when others then r := r || 'OK  quien no administra no envuelve para otros'::text; end;

  perform set_config('request.jwt.claims', json_build_object('sub', uA, 'role', 'authenticated', 'is_anonymous', true)::text, true);
  insert into public.claves_grupo_bb (grupo_id, epoca, dispositivo_id, envuelta_por, clave_envuelta) values
    (g, 2, dA, dA, repeat('e', 60)), (g, 2, dB, dA, repeat('e', 60)), (g, 2, dP, dA, repeat('e', 60)),
    (g, 1, dB, dA, repeat('e', 60));
  r := r || 'OK  el admin entrega la época 2 y la historia (época 1) a Laura'::text;
  begin
    insert into public.claves_grupo_bb (grupo_id, epoca, dispositivo_id, envuelta_por, clave_envuelta) values (g, 1, dB, dA, repeat('f', 60));
    r := r || 'FALLA se pisó una envoltura'::text;
  exception when others then r := r || 'OK  una envoltura no se pisa'::text; end;

  -- Laura escribe en la época 2.
  perform set_config('request.jwt.claims', json_build_object('sub', uB, 'role', 'authenticated', 'is_anonymous', true)::text, true);
  perform public.enviar_mensaje_bb(gen_random_uuid(), g, h, 2, 'sobre-laura');

  -- El intruso (con dispositivo) no puede pedir desafíos ni ejecutar lo del backend.
  perform set_config('request.jwt.claims', json_build_object('sub', uC, 'role', 'authenticated', 'is_anonymous', true)::text, true);
  dC := public.registrar_dispositivo_bb('Intruso', kC, kC);
  begin
    perform public.pedir_desafio_bb(dA, 'revincular');
    r := r || 'FALLA una sesión con dispositivo pidió desafío'::text;
  exception when others then r := r || 'OK  una sesión con dispositivo no pide desafíos'::text; end;
  begin
    perform public.consumir_revinculacion_bb(gen_random_uuid());
    r := r || 'FALLA authenticated ejecuta consumir_revinculacion'::text;
  exception when insufficient_privilege then r := r || 'OK  consumir_* solo para el backend'::text; end;
  begin
    select count(*) into n from public.desafios_bb;
    r := r || 'FALLA authenticated lee desafíos'::text;
  exception when others then r := r || 'OK  los desafíos no se leen desde la app'::text; end;

  -- Re-vincular: Edward perdió la sesión, pero la clave sigue en el teléfono. Sesión nueva uN.
  perform set_config('request.jwt.claims', json_build_object('sub', uN, 'role', 'authenticated', 'is_anonymous', true)::text, true);
  j := public.pedir_desafio_bb(dA, 'revincular');
  t := j ->> 'texto';
  r := r || (case when t like '["bb/desafio",1,"revincular","%' and t like '%' || public.huella_bb(dA, kA, kA) || '%' and t like '%' || uN::text || '%'
    then 'OK  el texto a firmar ata tipo, dispositivo, huella y sesión nueva' else 'FALLA texto del desafío: ' || t end)::text;
  x := (j ->> 'id')::uuid;
  perform set_config('role', 'service_role', true);
  j := public.datos_desafio_bb(x);
  r := r || (case when j ->> 'clave_firma' = kA and j ->> 'texto' = t then 'OK  la Edge Function recibe la clave FIJADA y el mismo texto' else 'FALLA datos del desafío' end)::text;
  perform public.consumir_revinculacion_bb(x);
  begin
    perform public.consumir_revinculacion_bb(x);
    r := r || 'FALLA desafío reutilizado'::text;
  exception when others then r := r || 'OK  un desafío no se reutiliza'::text; end;
  perform set_config('role', 'authenticated', true);
  r := r || (case when public.mi_dispositivo_bb() = dA then 'OK  la sesión nueva es el dispositivo de Edward' else 'FALLA no se re-vinculó' end)::text;
  select count(*) into n from public.mensajes_bb; r := r || (case when n = 2 then 'OK  re-vinculado ve toda la historia' else 'FALLA ve ' || n end)::text;
  perform set_config('request.jwt.claims', json_build_object('sub', uA, 'role', 'authenticated', 'is_anonymous', true)::text, true);
  r := r || (case when public.mi_dispositivo_bb() is null then 'OK  la sesión vieja ya no vale' else 'FALLA la sesión vieja sigue' end)::text;

  -- Restaurar con el papel: teléfono nuevo uR; queda pendiente hasta que Laura compare y apruebe.
  perform set_config('request.jwt.claims', json_build_object('sub', uR, 'role', 'authenticated', 'is_anonymous', true)::text, true);
  begin
    perform public.pedir_desafio_bb(dP, 'revincular');
    r := r || 'FALLA el papel se usó para re-vincular'::text;
  exception when others then r := r || 'OK  el papel solo sirve para recuperar'::text; end;
  x := (public.pedir_desafio_bb(dP, 'recuperar') ->> 'id')::uuid;
  perform set_config('role', 'service_role', true);
  dR := public.consumir_recuperacion_bb(x, 'iPhone nuevo', kR, kR);
  perform set_config('role', 'authenticated', true);
  r := r || (case when public.mi_dispositivo_bb() is null then 'OK  restaurado queda pendiente (no lee ni escribe)' else 'FALLA restaurado activo sin aprobar' end)::text;
  perform set_config('request.jwt.claims', json_build_object('sub', uN, 'role', 'authenticated', 'is_anonymous', true)::text, true);
  begin
    perform public.aprobar_restaurado_bb(dR, public.huella_bb(dR, kR, kR));
    r := r || 'FALLA Edward se aprobó a sí mismo'::text;
  exception when others then r := r || 'OK  nadie aprueba su propio restaurado'::text; end;
  perform set_config('request.jwt.claims', json_build_object('sub', uB, 'role', 'authenticated', 'is_anonymous', true)::text, true);
  begin
    perform public.aprobar_restaurado_bb(dR, public.huella_bb(dR, kC, kC));
    r := r || 'FALLA Laura aprobó con otra huella'::text;
  exception when others then r := r || 'OK  Laura no aprueba con otra huella'::text; end;
  perform public.aprobar_restaurado_bb(dR, public.huella_bb(dR, kR, kR));
  perform set_config('request.jwt.claims', json_build_object('sub', uR, 'role', 'authenticated', 'is_anonymous', true)::text, true);
  r := r || (case when public.mi_dispositivo_bb() = dR then 'OK  Laura aprueba el teléfono restaurado' else 'FALLA no quedó activo' end)::text;
  insert into public.claves_grupo_bb (grupo_id, epoca, dispositivo_id, envuelta_por, clave_envuelta) values
    (g, 1, dR, dR, repeat('e', 60)), (g, 2, dR, dR, repeat('e', 60));
  r := r || 'OK  el restaurado se re-envuelve la historia desde el papel'::text;

  -- Cuota de desafíos: 5 por hora por dispositivo.
  perform set_config('request.jwt.claims', json_build_object('sub', uX, 'role', 'authenticated', 'is_anonymous', true)::text, true);
  begin
    for n in 1..6 loop perform public.pedir_desafio_bb(dB, 'revincular'); end loop;
    r := r || 'FALLA sin cuota de desafíos'::text;
  exception when others then r := r || 'OK  cuota de desafíos por hora'::text; end;

  -- Si se borra el usuario anónimo de Laura, su dispositivo y sus mensajes siguen.
  perform set_config('role', 'postgres', true);
  delete from auth.users where id = uB;
  select count(*) into n from public.dispositivos_bb where id = dB and auth_uid is null;
  r := r || (case when n = 1 then 'OK  borrar el usuario anónimo no borra el dispositivo' else 'FALLA se borró el dispositivo' end)::text;
  select count(*) into n from public.mensajes_bb where dispositivo_id = dB;
  r := r || (case when n = 1 then 'OK  ni sus mensajes' else 'FALLA se borraron mensajes' end)::text;

  -- Sin sesión no se ejecuta nada nuevo.
  perform set_config('role', 'anon', true);
  begin
    perform public.pedir_desafio_bb(dA, 'revincular');
    r := r || 'FALLA anon pide desafíos'::text;
  exception when others then r := r || 'OK  sin sesión no se piden desafíos'::text; end;

  raise exception E'INFORME (todo se deshace)\n%', array_to_string(r, E'\n');
end $$;
