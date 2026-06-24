# docs-money/kols/ — Muestras de referencia (one-off research)

> ⚠️ **Esta carpeta es para investigación de formato, NO para producción.**
> El contenido se descarga puntualmente con `scripts/fetch-kol-samples.mjs`
> para entender cómo publican los canales establecidos, y se borra después.

---

## Estado actual

Esta carpeta está **vacía**. Los datos se generan al ejecutar:

```bash
node scripts/fetch-kol-samples.mjs --kol 1867934972 --kol 2397610468 --kol 1960616143 --limit 50
```

---

## Qué contendrá cuando ejecutes el script

```
docs-money/kols/
├── README.md                            ← este archivo (siempre)
├── 1867934972/
│   ├── raw.json                         ← mensajes Telegram completos
│   ├── urls.json                        ← URLs extraídas con contexto
│   └── summary.md                       ← estadísticas + ejemplo anonimizado
├── 2397610468/
│   ├── raw.json
│   ├── urls.json
│   └── summary.md
└── 1960616143/
    ├── raw.json
    ├── urls.json
    └── summary.md
```

---

## Por qué este approach

Estos 3 canales llevan años operando y han iterado sobre el formato que
funciona en el espacio cripto (texto + URLs incrustadas tipo `(texto)[url]`
o `[texto](url)`). Vamos a imitar SU formato porque:

1. **Su formato está probado**: si llevan años publicando así, su audiencia
   ya sabe parsearlo mentalmente y hacer click.
2. **Reduce tu costo de educador de mercado**: tu output se ve "familiar" en
   vez de inventar algo nuevo.
3. **Maximiza extraction accuracy**: tu regex extractor se entrena con datos
   reales del dominio, no ejemplos inventados.

---

## Qué hacer con los datos

1. **Lee los `summary.md`** de cada KOL para entender el patrón:
   - ¿Usan `(texto)[url]` o `[texto](url)`?
   - ¿Cuántas URLs por mensaje?
   - ¿URLs a qué servicios? (DexScreener, DexTools, Etherscan, t.me)
   - ¿Tienen un header con formato consistente?
2. **Mira 5–10 mensajes crudos** en `raw.json` para entender la prosa.
3. **Diseña tu `MessageFormatterPort`** (`apps/backend/src/telegram/vip-calls-channel/
   infrastructure/formatters/default-message-formatter.adapter.ts`) imitando
   ese formato.
4. **Diseña tu `RegexBasedExtractorAdapter`** (`apps/backend/src/token/intake/
   extraction/infrastructure/adapters/regex-based-extractor.adapter.ts`)
   capturando el mismo patrón de URLs.
5. **BORRA los datos descargados** (ver `scripts/fetch-kol-samples.mjs §7`).

---

## Compliance

Esta es la ÚNICA situación en la que tu pipeline descarga texto crudo de KOLs:

✅ **Permitido**:
- Descarga puntual (50–200 mensajes) de canales públicos.
- Para análisis de formato, no para construir dataset.
- Hecho por humano, no automatizado en cron.
- Borrado tras usar.

❌ **No permitido** (es lo que fix-1 previene):
- Pipeline automático que descarga y persiste miles de mensajes.
- Acumulación de dataset de UGC en Postgres.
- Entrenamiento de modelos AI/ML con esos datos.
- Crawling de miles de canales sin opt-in.

Referencia ToS:
- *"ordinary, legitimate, and intended use of the Telegram platform as its user"*
  — Content Licensing ToS [https://telegram.org/tos/content-licensing]
- *"Always prohibited uses include any form of data collection aimed at creating
  large datasets"* — Bot Developer ToS §4.3
  [https://telegram.org/tos/bot-developers]

---

## Después de ejecutar el script y usar los datos

```bash
# Borrar los datos descargados (mantén solo este README)
rm -rf docs-money/kols/1867934972
rm -rf docs-money/kols/2397610468
rm -rf docs-money/kols/1960616143

# Añadir a .gitignore para evitar futuras subidas accidentales
echo "docs-money/kols/[0-9]*/" >> .gitignore
echo "!docs-money/kols/README.md" >> .gitignore

# Opcional: borrar el script mismo
rm scripts/fetch-kol-samples.mjs
```

Si más adelante necesitas volver a capturar el formato de otro canal,
puedes recrear el script desde el template en `docs-money/fix-1/` o pedir
que lo regeneremos.

---

## Próximo paso

1. Asegúrate de tener `.env` con `TELEGRAM_MTPROTO_*` rellenado.
2. Ejecuta el script desde tu máquina local (no desde CI/servidor).
3. Revisa los `summary.md` resultantes.
4. Itera sobre `MessageFormatterPort` y `RegexBasedExtractorAdapter`.
5. Borra los datos descargados.
6. Vuelve a `fix-1/solution.md` para terminar el fix anti-scraping.
