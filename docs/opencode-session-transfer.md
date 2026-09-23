# Runbook: exportar una sesión de opencode del VPS e importarla en local

> Probado 2026-09-15 con `ses_f59c40c30` ("Fix saltos de linea"), opencode v1.18.31 en ambos lados.
> No existe sync oficial entre instancias — este es el path soportado (`export` → `import`).

## Cuándo usar

Traer al opencode local una sesión que vive en el VPS (`OracleDroplet`, `/data/repos/onchain-bot`)
para seguirla en `/Users/bryanstevens/dev/onchain-bot`.

## Prerrequisitos

- Misma versión de opencode en ambos lados (`~/.opencode/bin/opencode --version`). El formato del export cambia entre versiones.
- El ID de la sesión (`ses_...`). Para listar las del VPS:
  ```bash
  ssh OracleDroplet "python3 -c \"
  import sqlite3,os
  db=os.path.expanduser('~/.local/share/opencode/opencode.db')
  con=sqlite3.connect('file:'+db+'?mode=ro',uri=True)
  cur=con.cursor()
  cur.execute(\\\"SELECT s.id,substr(s.title,1,60),datetime(s.time_updated/1000,'unixepoch') FROM session s JOIN project p ON p.id=s.project_id WHERE p.worktree LIKE '%onchain-bot%' ORDER BY s.time_updated DESC LIMIT 15\\\")
  [print(' | '.join(map(str,r))) for r in cur.fetchall()]\""
  ```

## Pasos

### 1. Export en el VPS

```bash
ssh OracleDroplet "/home/ubuntu/.opencode/bin/opencode export <ses_ID> > /tmp/<ses_ID>.json && ls -lh /tmp/<ses_ID>.json"
```

### 2. Copiar a local

```bash
scp OracleDroplet:/tmp/<ses_ID>.json /tmp/<ses_ID>.json
```

### 3. Importar desde el repo destino (importante)

El `import` re-ancla la sesión al proyecto/directorio local — por eso hay que correrlo
desde el repo local, no desde cualquier carpeta:

```bash
cd /Users/bryanstevens/dev/onchain-bot
~/.opencode/bin/opencode import /tmp/<ses_ID>.json
# → Imported session: <ses_ID>
~/.opencode/bin/opencode session list --format json | grep <ses_ID>
```

### 4. Todos (el export NO los incluye)

El JSON solo trae `info` + `messages`. Si la sesión tiene todos que importan, copiarlos a mano:

```bash
# VPS → dump:
ssh OracleDroplet "python3 -c \"
import sqlite3,os,json
con=sqlite3.connect('file:'+os.path.expanduser('~/.local/share/opencode/opencode.db')+'?mode=ro',uri=True)
con.row_factory=sqlite3.Row
print(json.dumps([dict(r) for r in con.execute('SELECT * FROM todo WHERE session_id=? ORDER BY position',('<ses_ID>',))]))\" > /tmp/<ses_ID>-todos.json"
scp OracleDroplet:/tmp/<ses_ID>-todos.json /tmp/
# local → insert:
python3 -c "
import sqlite3,os,json
db=os.path.expanduser('~/.local/share/opencode/opencode.db')
todos=json.load(open('/tmp/<ses_ID>-todos.json'))
con=sqlite3.connect(db); cur=con.cursor()
for t in todos: cur.execute('INSERT OR IGNORE INTO todo VALUES (?,?,?,?,?,?,?)',(t['session_id'],t['content'],t['status'],t['priority'],t['position'],t['time_created'],t['time_updated']))
con.commit(); print(cur.execute('SELECT count(*) FROM todo WHERE session_id=?',('<ses_ID>',)).fetchone()[0])"
```

### 5. Abrir la sesión

```bash
cd /Users/bryanstevens/dev/onchain-bot
~/.opencode/bin/opencode --session <ses_ID>
```

o `/sessions` en el TUI y buscarla por título.

## Troubleshooting

### `reasoning encrypted_content was not issued to this caller`

Los modelos con reasoning vía Zen (p. ej. `muse-spark-*`) sellan los blobs de reasoning
al caller que los emitió (la credencial Zen del VPS). Al reanudar en local con otra
identidad, el upstream rechaza el replay con `400 invalid_request_error`.
(Refs: `oh-my-pi#11928` + fix `#11931`; `anomalyco/opencode#48964`, PR `#48908`.)

Fix aplicado 2026-09-15: con el TUI local **cerrado** y backup previo
(`sqlite3` backup API → `~/.local/share/opencode/opencode.db.bak-<fecha>`),
borrar solo los parts de reasoning encriptado de esa sesión:

```sql
DELETE FROM part WHERE session_id='<ses_ID>'
  AND (data LIKE '%encrypted_content%' OR data LIKE '%reasoningEncryptedContent%');
```

Verificar `0` blobs restantes, reabrir el TUI y reintentar. Se pierde el "cómo pensó"
original (casi todo vacío); el modelo razona de nuevo con el caller local.
Si persiste, plan B: fork desde un mensaje previo o sesión nueva con resumen.

## No hacer

- Copiar el `opencode.db` entero con opencode corriendo (corrupción por WAL) ni mezclar
  tablas a mano entre DBs — `export/import` es el path oficial y tolera versiones.
- Editar la DB con el TUI abierto en esa sesión; backup siempre antes.
- Asumir sync: no existe (Zen es gateway de modelos, `/share` es solo link público de
  lectura). Si la sesión sigue viva en el tmux del VPS y avanzas en ambos lados, divergen.
