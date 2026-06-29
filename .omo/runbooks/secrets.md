# Secrets — Estrategia Híbrida

## ¿Por qué híbrida?

- **GitHub Free** da 500 MB de Packages, insuficiente para imágenes Docker del backend.
- 30+ vars de entorno sería engorroso de mantener en GitHub Secrets.
- Tailscale hace seguro tener `.env.production` en el droplet (solo tú accedes).
- **.env.production en el droplet** es la fuente de verdad para las 30+ vars.

## En GitHub Secrets (Settings → Secrets and variables → Actions)

Configura estos 3 secrets:

| Secret | Valor | Descripción |
|--------|-------|-------------|
| `SSH_PRIVATE_KEY` | Contenido de `~/.ssh/visual_studio_macbook` | Llave SSH para acceder al droplet. Empezar con `-----BEGIN OPENSSH PRIVATE KEY-----` |
| `SSH_HOST` | `144.126.203.139` | IP del droplet (también funciona Tailscale MagicDNS: `cryptoganster.tailf01c61.ts.net`) |
| `SSH_USER` | `root` | Usuario SSH |

## En el droplet (`/opt/onchain-bot/.env.production`)

Crea el archivo **una vez a mano**:

```bash
ssh root@144.126.203.139
mkdir -p /opt/onchain-bot
cp /path/to/apps/backend/.env.production.template /opt/onchain-bot/.env.production
nano /opt/onchain-bot/.env.production
# ... rellena cada variable con su valor de PRODUCCIÓN
```

### Variables críticas que NO debes olvidar

- `TELEGRAM_BOT_TOKEN` (bot de salida)
- `VIP_CALLS_BOT_TOKEN` y `VIP_CALLS_OUTPUT_CHANNEL`
- `CHAIN_DEXTER_BOT_TOKEN`
- `INGESTION_TELEGRAM_MTPROTO_API_ID`, `_HASH`, `_SESSION` (cuenta de PRODUCCIÓN, distinta de dev)
- `DATABASE_SYNCHRONIZE=false` (CRÍTICO en producción)
- `POSTGRES_PASSWORD` y `REDIS_PASSWORD` (que coincidan con los del `docker-compose.prod.yml`)

## Respaldo del .env.production

```bash
# Desde tu Mac, después de crearlo
scp root@144.126.203.139:/opt/onchain-bot/.env.production ~/backups/onchain-bot-env-production-$(date +%Y%m%d).bak
```

## Qué NO hacer

- **NO** commitees `.env.production` con valores reales (está en `.gitignore`).
- **NO** pongas API keys en GitHub Secrets (mantenlas en el droplet).
- **NO** regeneres la `INGESTION_TELEGRAM_MTPROTO_SESSION` de producción accidentalmente — invalida la sesión actual.

## Rotación de secrets

1. **API keys**: edita `/opt/onchain-bot/.env.production` y `docker compose restart`.
2. **Bot tokens**: regenera con @BotFather, edita `.env.production`, `restart`.
3. **MTProto session**: requiere cuidado. Cambia solo si la sesión está comprometida.