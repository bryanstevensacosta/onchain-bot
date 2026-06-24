# Recipe — Extraer el Core a un Nuevo Repositorio

> Receta paso a paso para clonar los 14 BCs del core desde el repo actual de `alpha-meta-token-scanner` a un nuevo repositorio `spydefi-core` (o el nombre que decidas). El objetivo: dos repos separados, motor idéntico, y cero deuda técnica cruzada.

## Prerrequisitos

- Acceso al repo `alpha-meta-token-scanner`.
- Permisos para crear un repo nuevo en el proveedor Git que uses.
- Node 20+, npm 10+.
- Conocimiento de la convención de BCs descrita en [`08-file-structure.md`](08-file-structure.md).

## Resultado esperado

Un nuevo repo `spydefi-core` que:

1. Tiene los **14 BCs del core** con su código, sus READMEs, sus tests.
2. Tiene `shared/` con primitivas DDD.
3. Tiene esta carpeta `docs/arch/` completa.
4. Compila (`npm run build`) y pasa los tests (`npm run test`).
5. Bootea (`npm run start:dev`) y procesa mensajes de Telegram de punta a punta.
6. **NO** contiene ningún código de producto (bots de usuario, verify, buybot, premium, achievements, kol-stats, web-dashboard, referrals).

## Paso 1 — Crear el repo nuevo

```bash
mkdir spydefi-core
cd spydefi-core
git init
npm init -y
```

## Paso 2 — Copiar configuración base del proyecto

Copia desde `alpha-meta-token-scanner`:

- `package.json` (luego ajusta `name`, `version`, `description`).
- `tsconfig.json` + `tsconfig.build.json`.
- `nest-cli.json`.
- `.eslintrc*` / `eslint.config.mjs` + `.prettierrc`.
- `.gitignore` (ajusta para excluir `.env` y `dist/`).
- `docker-compose.yml` (solo Postgres si lo usas en el core; pgAdmin es opcional).
- `pgadmin/` si aplica.

Renombra en `package.json`:

```json
{
  "name": "spydefi-core",
  "version": "0.1.0",
  "description": "SpyDefi core engine: discovery, validation, scoring and publishing of on-chain alpha-calls from Telegram."
}
```

## Paso 3 — Copiar esta carpeta `docs/`

Copia **toda** la carpeta `docs/spydefi/arch/` de `alpha-meta-token-scanner` a la raíz del nuevo repo como `docs/arch/`:

```bash
cp -R ../alpha-meta-token-scanner/apps/backend/docs/spydefi/arch ./docs/arch
```

Añade también el `README-BC-GUIDE.md` (es el que rige cómo escribir los READMEs de los BCs):

```bash
mkdir -p docs/proyect
cp ../alpha-meta-token-scanner/apps/backend/docs/proyect/README-BC-GUIDE.md ./docs/proyect/README-BC-GUIDE.md
```

## Paso 4 — Copiar `src/shared/`

`shared` no es un BC, es el núcleo transversal. Cópialo **entero** desde `alpha-meta-token-scanner/apps/backend/src/shared/`:

```bash
cp -R ../alpha-meta-token-scanner/apps/backend/src/shared ./src/shared
```

Verifica que existe:
- `src/shared/domain/aggregate-root.ts`
- `src/shared/domain/entity.ts`
- `src/shared/domain/value-object.ts`
- `src/shared/domain/domain-event.ts`
- `src/shared/domain/domain-error.ts`
- `src/shared/common/config/app.config.ts`
- `src/shared/common/persistence/database.module.ts`
- `src/shared/common/events/in-process-event-emitter.publisher.ts`

## Paso 5 — Copiar los 14 BCs del core

Ejecuta desde la raíz del nuevo repo:

```bash
# Telegram
cp -R ../alpha-meta-token-scanner/apps/backend/src/telegram/ingestion  ./src/telegram/ingestion
cp -R ../alpha-meta-token-scanner/apps/backend/src/telegram/publishing ./src/telegram/publishing

# Token
cp -R ../alpha-meta-token-scanner/apps/backend/src/token/intake/extraction       ./src/token/intake/extraction
cp -R ../alpha-meta-token-scanner/apps/backend/src/token/intake/parsing          ./src/token/intake/parsing
cp -R ../alpha-meta-token-scanner/apps/backend/src/token/normalization           ./src/token/normalization
cp -R ../alpha-meta-token-scanner/apps/backend/src/token/market-data/enrichment  ./src/token/market-data/enrichment
cp -R ../alpha-meta-token-scanner/apps/backend/src/token/classification          ./src/token/classification
cp -R ../alpha-meta-token-scanner/apps/backend/src/token/scoring                 ./src/token/scoring
cp -R ../alpha-meta-token-scanner/apps/backend/src/token/honeypot                ./src/token/honeypot
cp -R ../alpha-meta-token-scanner/apps/backend/src/token/token-gating/filters    ./src/token/token-gating/filters
cp -R ../alpha-meta-token-scanner/apps/backend/src/token/call-tracking           ./src/token/call-tracking
cp -R ../alpha-meta-token-scanner/apps/backend/src/token/channel-reputation      ./src/token/channel-reputation

# Chain
cp -R ../alpha-meta-token-scanner/apps/backend/src/chain/detection ./src/chain/detection
cp -R ../alpha-meta-token-scanner/apps/backend/src/chain/registry  ./src/chain/registry
```

> **No copies** `src/token/identity/` salvo que forme parte del core (verifica con `ls`). Si existe y solo se usa en producto, déjalo fuera.

## Paso 6 — Reescribir `src/app.module.ts`

Toma el `app.module.ts` de `alpha-meta-token-scanner/apps/backend/src/app.module.ts` y:

1. Elimina los imports y módulos que correspondan a producto (si los hay).
2. Asegúrate de que solo estén los **14 BCs** del core listados en [`12-spydefi-core-overview.md`](12-spydefi-core-overview.md).
3. Renombra el `AppController` a algo como `SpydefiCoreController` o mantenlo genérico.

Plantilla de referencia:

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { appConfig } from 'shared/common/config/app.config';
import { DatabaseModule } from 'shared/common/persistence/database.module';

import { TelegramIngestionModule } from 'telegram/ingestion/telegram-ingestion.module';
import { ExtractionModule } from 'token/intake/extraction/extraction.module';
import { ParsingModule } from 'token/intake/parsing/parsing.module';
import { NormalizationModule } from 'token/normalization/normalization.module';
import { ChainDetectionModule } from 'chain/detection/chain-detection.module';
import { ChainRegistryModule } from 'chain/registry/chain-registry.module';
import { EnrichmentModule } from 'token/market-data/enrichment.module';
import { ClassificationModule } from 'token/classification/classification.module';
import { ScoringModule } from 'token/scoring/scoring.module';
import { HoneypotModule } from 'token/honeypot/honeypot.module';
import { FiltersModule } from 'token/token-gating/filters.module';
import { TelegramPublishingModule } from 'telegram/publishing/publishing.module';
import { CallTrackingModule } from 'token/call-tracking/call-tracking.module';
import { ChannelReputationModule } from 'token/channel-reputation/channel-reputation.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'], load: [appConfig] }),
    EventEmitterModule.forRoot({ global: true, wildcard: false, delimiter: '.', maxListeners: 32 }),
    ScheduleModule.forRoot(),
    DatabaseModule.forRootFromEnv(),
    TelegramIngestionModule,
    ExtractionModule,
    ParsingModule,
    NormalizationModule,
    ChainDetectionModule,
    ChainRegistryModule,
    EnrichmentModule,
    ClassificationModule,
    ScoringModule,
    HoneypotModule,
    FiltersModule,
    TelegramPublishingModule,
    CallTrackingModule,
    ChannelReputationModule,
  ],
})
export class AppModule {}
```

## Paso 7 — Ajustar `tsconfig.json` y `jest`

Asegúrate de que los `paths` del `tsconfig.json` y de `jest.moduleNameMapper` en `package.json` reflejan los alias del core:

```json
// tsconfig.json
{
  "compilerOptions": {
    "paths": {
      "shared/*": ["src/shared/*"],
      "telegram/*": ["src/telegram/*"],
      "token/*": ["src/token/*"],
      "chain/*": ["src/chain/*"]
    }
  }
}
```

```json
// package.json (jest.moduleNameMapper)
{
  "moduleNameMapper": {
    "^shared/(.*)$": "<rootDir>/shared/$1",
    "^telegram/(.*)$": "<rootDir>/telegram/$1",
    "^token/(.*)$": "<rootDir>/token/$1",
    "^chain/(.*)$": "<rootDir>/chain/$1",
    "^src/(.*)$": "<rootDir>/$1"
  }
}
```

> Si has movido `shared` a la raíz (no dentro de un BC), ajusta accordingly.

## Paso 8 — Renombrar referencias internas

Algunos archivos del core mencionan el nombre del proyecto. Búscalos y renómbralos:

```bash
# desde la raíz del nuevo repo
grep -rl "alpha-meta-token-scanner" src/ | xargs sed -i '' 's/alpha-meta-token-scanner/spydefi-core/g'
grep -rl "AlphaMetaTokenScanner" src/ | xargs sed -i '' 's/AlphaMetaTokenScanner/SpydefiCore/g'
grep -rl "AlphaMetaTokenScanner" src/ | xargs sed -i '' 's/AlphaMetaTokenScanner/SpyDefiCore/g'
```

> Revisa manualmente los cambios para evitar reemplazos no deseados en strings de UI o en URLs de providers.

## Paso 9 — Crear `.env.example` y `.env`

Crea un `.env.example` con las variables mínimas para que el core arranque:

```dotenv
# App
NODE_ENV=development
APP_PORT=3000

# Telegram
TELEGRAM_API_ID=
TELEGRAM_API_HASH=
TELEGRAM_SESSION_STRING=
TELEGRAM_MONITORED_CHANNELS=@kol1,@kol2,@kol3
TELEGRAM_OUTPUT_CHANNELS=@my_output_channel

# Providers
DEXSCREENER_BASE_URL=https://api.dexscreener.com
GECKOTERMINAL_BASE_URL=https://api.geckoterminal.com
HELIUS_API_KEY=
HELIUS_RPC_URL=https://mainnet.helius-rpc.com

# Persistence
DB_HOST=localhost
DB_PORT=5432
DB_USER=spydefi
DB_PASS=spydefi
DB_NAME=spydefi_core
```

## Paso 10 — Crear el `AppController` mínimo

El core no expone HTTP público por defecto. El `AppController` solo debe servir `/health`:

```typescript
// src/app.controller.ts
import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get('health')
  health(): { status: 'ok'; ts: string } {
    return { status: 'ok', ts: new Date().toISOString() };
  }
}
```

## Paso 11 — Escribir el `README.md` del nuevo repo

Un README de alto nivel:

```markdown
# spydefi-core

> Core engine de SpyDefi: discovery, validación, scoring y republicación de alpha-calls de tokens on-chain a partir de canales de Telegram.

Este repo contiene los 14 Bounded Contexts del pipeline `ca` (contract analysis) y el núcleo transversal `shared`. NO incluye los BCs de producto (bots de usuario, verify, buybot, premium, achievements, kol-stats, web-dashboard, referrals), que viven en `spydefi-product`.

## Quickstart

\`\`\`bash
npm install
cp .env.example .env  # editar valores
docker compose up -d  # si usas Postgres
npm run start:dev
\`\`\`

## Docs

- [docs/arch/INDEX.md](docs/arch/INDEX.md) — Arquitectura, principios, hexagonal, BCs.
- [docs/arch/12-spydefi-core-overview.md](docs/arch/12-spydefi-core-overview.md) — Mapa de los 14 BCs del core.
- [docs/arch/13-recipe-extract-core.md](docs/arch/13-recipe-extract-core.md) — Cómo se generó este repo.

## Estructura

\`\`\`
src/
├── telegram/         # ingestion, publishing
├── token/            # intake, normalization, market-data, classification, scoring, honeypot, token-gating, call-tracking, channel-reputation
├── chain/            # detection, registry
└── shared/           # DDD primitives, errors, config
\`\`\`
```

## Paso 12 — Verificar que compila y los tests pasan

```bash
npm install
npm run build
npm run test
npm run test:e2e
```

Si algún test falla por imports rotos o paths mal migrados, ajusta hasta que pase.

## Paso 13 — Smoke test manual

Arranca la app:

```bash
npm run start:dev
```

Verifica:

1. `GET /health` responde 200.
2. Los logs muestran que el listener de Telegram arranca.
3. Si tienes canales configurados en `TELEGRAM_MONITORED_CHANNELS`, deberían empezar a llegar mensajes y procesarse por el pipeline.
4. En el `InMemoryTokenCallRepository` (vía un endpoint de debug o un test de integración), deberías ver `TokenCall` pasando por todos los estados: `RAW` → `ENRICHED` → `SCORED` → `APPROVED` → `PUBLISHED`.

## Paso 14 — Tagging y release

```bash
git add -A
git commit -m "feat: bootstrap spydefi-core engine (14 BCs)"
git tag v0.1.0
git push origin main --tags
```

## Paso 15 — Evolucionar el core sin tocar producto, y viceversa

A partir de aquí:

- **Cambios al core** (nuevo BC de pipeline, nuevo provider de market data, mejor heurística de honeypot) → PR en `spydefi-core`, se versiona y se publica. El repo de producto hace `npm i spydefi-core@x.y.z`.
- **Cambios de producto** (nuevo bot, nuevo filtro premium, achievement nuevo) → PR en `spydefi-product`. No toca el core.
- **Cambios compartidos** (nuevo evento del core que producto consume, nuevo método en un puerto) → se modifican ambos repos en PRs coordinados, con bump de versión mayor si rompe compat.

## Checklist final

- [ ] Repo `spydefi-core` creado y con `git init`.
- [ ] Config base copiada (`package.json`, `tsconfig*`, `nest-cli.json`, `eslint`, `prettier`).
- [ ] `docs/arch/` copiado íntegro (12 archivos, INDEX incluido).
- [ ] `src/shared/` copiado íntegro.
- [ ] 14 BCs copiados.
- [ ] `src/app.module.ts` reescrito con solo los 14 BCs.
- [ ] Aliases `paths` en `tsconfig.json` y `jest.moduleNameMapper` ajustados.
- [ ] Referencias a `alpha-meta-token-scanner` renombradas.
- [ ] `.env.example` creado.
- [ ] `AppController` mínimo (`/health`).
- [ ] `README.md` del nuevo repo escrito.
- [ ] `npm install` + `npm run build` + `npm run test` + `npm run test:e2e` pasan.
- [ ] Smoke test manual: `npm run start:dev` arranca y procesa un mensaje real.
- [ ] Tag y release `v0.1.0`.
