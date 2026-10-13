-- IA integrada (D1): solo cuentas por día; ningún texto salvo los reportes que la persona envía.
CREATE TABLE IF NOT EXISTS uso (clave TEXT NOT NULL, dia TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (clave, dia));
CREATE TABLE IF NOT EXISTS idem (dispositivo TEXT NOT NULL, idem TEXT NOT NULL, dia TEXT NOT NULL, PRIMARY KEY (dispositivo, idem));
CREATE TABLE IF NOT EXISTS gasto (dia TEXT PRIMARY KEY, usd REAL NOT NULL DEFAULT 0, llamadas INTEGER NOT NULL DEFAULT 0);
-- plan: 'plus' (cuando exista Play Billing) o 'probador' (Edward y Laura en el piloto). hasta: ISO o NULL.
CREATE TABLE IF NOT EXISTS planes (dispositivo TEXT PRIMARY KEY, plan TEXT NOT NULL, hasta TEXT);
CREATE TABLE IF NOT EXISTS reportes (id INTEGER PRIMARY KEY AUTOINCREMENT, dispositivo TEXT, creado TEXT, modo TEXT, pregunta TEXT, respuesta TEXT, motivo TEXT);
-- Equipos que abrieron «Preguntar a la Biblia» (para dar el plan «probador»).
CREATE TABLE IF NOT EXISTS vistos (dispositivo TEXT PRIMARY KEY, primero TEXT, ultimo TEXT);
