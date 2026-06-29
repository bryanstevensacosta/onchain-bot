# Security Fix: Tailscale TUN Bypasses iptables

**Date:** 2026-06-29
**Severity:** CRITICAL — Production ports were publicly accessible
**Status:** FIXED

## El problema

Después del primer deploy, descubrimos que los puertos 3030 (backend) y 5173 (frontend) eran accesibles desde la IP pública `144.126.203.139` a pesar de:
- UFW configurado para solo permitir 100.64.0.0/10
- Reglas iptables INPUT con DROP para todo lo no-Tailscale
- Reglas iptables FORWARD con DROP para todo lo no-Tailscale
- Reglas ip6tables FORWARD con DROP

## El diagnóstico

| Test | Resultado |
|------|-----------|
| `curl http://144.126.203.139:5173/` desde Mac | HTTP 200 (no bloqueado) |
| `tcpdump -i eth0 port 5173` durante curl | **0 packets** |
| `tcpdump -i tailscale0 port 5173` durante curl | **0 packets** |
| `iptables -L INPUT -v` (contadores) | **0 packets** matched |
| Nginx access log en el frontend | Registra la conexión ✅ |

**Conclusión:** La conexión SÍ llega al backend (nginx la registra) pero bypasea completamente iptables, tcpdump, y todas las capas de red.

## La causa raíz

Tailscale en el Mac usa un **TUN device** (`utun`/`tailscale0`) que intercepta tráfico a CUALQUIER IP (incluso IPs públicas como `144.126.203.139`). En lugar de enviar los paquetes al gateway default, los encapsula en WireGuard y los envía al peer Tailscale del droplet.

Cuando el paquete llega al droplet:
1. Tailscale en el droplet lo desencapsula
2. En lugar de reinyectarlo a la pila de red normal (eth0), lo inyecta **directamente al socket** del proceso que escucha en esa IP:puerto
3. Esto bypasea: iptables INPUT, iptables FORWARD, conntrack, tcpdump

El docker-proxy escucha en `0.0.0.0:5173` (todas las interfaces, incluida la TUN). Por eso Tailscale puede entregarle el paquete directamente.

## Por qué los iptables "normales" no funcionan

| Capa | Por qué no funciona |
|------|---------------------|
| UFW (INPUT) | El tráfico no pasa por INPUT — se inyecta directamente al socket |
| iptables INPUT | Mismo motivo — bypass completo |
| iptables FORWARD | El tráfico no se "forwardea" — se entrega localmente al socket |
| ip6tables FORWARD | Idem |
| UFW route allow | Diseñado para tráfico forwarded, no para inyección directa |
| conntrack | No ve el paquete original |

## La solución

**No publicar puertos en `0.0.0.0` desde Docker.** Usar `127.0.0.1` y dejar que `socat` haga el forwarding desde la IP de Tailscale.

### 1. Cambiar docker-compose.prod.yml

```yaml
services:
  backend:
    ports:
      - "127.0.0.1:3030:3030"   # ANTES: "3030:3030"
  frontend:
    ports:
      - "127.0.0.1:5173:80"     # ANTES: "5173:80"
```

Esto hace que el docker-proxy SOLO escuche en localhost. Tailscale TUN ya no puede entregarle paquetes porque no hay socket escuchando en `100.84.4.28:5173`.

### 2. Crear servicios socat

`/etc/systemd/system/socat-3030.service`:
```ini
[Unit]
Description=Socat forward Tailscale:3030 to localhost:3030 (docker)
After=network.target docker.service tailscaled.service
Wants=docker.service

[Service]
Type=simple
Restart=always
RestartSec=5
ExecStart=/usr/bin/socat TCP-LISTEN:3030,bind=100.84.4.28,reuseaddr,fork TCP:127.0.0.1:3030
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

`/etc/systemd/system/socat-5173.service`:
```ini
[Unit]
Description=Socat forward Tailscale:5173 to localhost:5173 (docker)
After=network.target docker.service tailscaled.service
Wants=docker.service

[Service]
Type=simple
Restart=always
RestartSec=5
ExecStart=/usr/bin/socat TCP-LISTEN:5173,bind=100.84.4.28,reuseaddr,fork TCP:127.0.0.1:5173
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

### 3. Activar

```bash
systemctl daemon-reload
systemctl enable socat-3030.service socat-5173.service
systemctl start socat-3030.service socat-5173.service
```

### 4. Limpiar iptables innecesarios

Las reglas iptables ya no son necesarias (el docker-proxy no escucha en 0.0.0.0). Pero mantenemos UFW como defense-in-depth.

## Validación post-fix

| Test | Resultado |
|------|-----------|
| `curl http://144.126.203.139:3030/api/health` | HTTP 000 (bloqueado ✅) |
| `curl http://144.126.203.139:5173/` | HTTP 000 (bloqueado ✅) |
| `nc -zv 144.126.203.139 3030` | Connection refused ✅ |
| `nc -zv 144.126.203.139 5173` | Connection refused ✅ |
| `curl http://100.84.4.28:3030/api/health` (Tailscale) | HTTP 200 ✅ |
| `curl http://100.84.4.28:5173/` (Tailscale) | HTTP 200 ✅ |
| `curl http://cryptoganster.tailf01c61.ts.net:3030/api/health` | HTTP 200 ✅ |
| `curl http://cryptoganster.tailf01c61.ts.net:5173/` | HTTP 200 ✅ |

## Lecciones aprendidas

1. **Tailscale TUN es poderoso y peligroso para security models basados en red**: bypasea iptables, tcpdump, y firewalls
2. **Nunca publicar puertos en 0.0.0.0** si usas Tailscale y quieres restricción por red
3. **`bind=IP` en socat/docker-compose es la forma correcta** de exponer servicios solo a Tailscale
4. **Si necesitas internet público en el futuro**: usa un reverse proxy (Caddy/Nginx) en una IP pública específica, NO en 0.0.0.0

## Rollback (si algo se rompe)

```bash
# Revertir a 0.0.0.0 (NO recomendado, pero para salir del paso)
ssh root@cryptoganster.tailf01c61.ts.net
cd /opt/onchain-bot/apps/backend
cp docker-compose.prod.yml.bak docker-compose.prod.yml
docker compose -f docker-compose.prod.yml up -d --force-recreate
systemctl stop socat-3030.service socat-5173.service
```

⚠️ **El rollback restaura la vulnerabilidad original.** Solo usar en emergencia.
