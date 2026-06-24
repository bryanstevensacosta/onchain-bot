# Hexagonal Architecture + DDD + Bounded Contexts

> Documentación de la **arquitectura del core de SpyDefi**: motor de discovery, validación y republicación de alpha-calls de tokens on-chain a partir de canales de Telegram.
>
> Esta documentación es **autocontenida** y está pensada para copiarse tal cual al nuevo repositorio del core. Una vez allí, el producto SpyDefi (bots de usuario, KOL bot, verify, buybot, premium, achievements) se construirá **encima** de este core como BCs adicionales.

## Overview
Documentation for building modular, decoupled systems using Domain-Driven Design, Bounded Contexts, and Hexagonal Architecture.

## Structure

```
docs/arch/
├── INDEX.md                            # This file
├── 01-principles.md                    # Core principles overview
├── 02-bounded-contexts.md              # Bounded Contexts explained
├── 03-hexagonal.md                     # Hexagonal Architecture
├── 04-domain-layer.md                  # Domain: entities, value objects, rules
├── 05-application-layer.md             # Application: use cases, ports
├── 06-adapters-layer.md                # Adapters: controllers, repos, APIs
├── 07-bc-communication.md              # Context mapping, events, protocols
├── 08-file-structure.md                # Directory structure by BC
├── 09-anti-patterns.md                 # Common mistakes
├── 10-testing.md                       # Testing strategies
├── 11-why.md                           # When to use this architecture
├── 12-spydefi-core-overview.md         # Mapa de BCs del core engine
└── 13-recipe-extract-core.md           # Receta para extraer el core a un nuevo repo
```

## Core Idea

> The domain is the heart of the system. Everything else (DB, APIs, UI, brokers) is replaceable.

## Lo que SÍ cubre esta documentación

El **core engine** de SpyDefi: 14 Bounded Contexts encadenados por eventos in-process que forman el pipeline `ca` (contract analysis), desde la ingestión de mensajes crudos de Telegram hasta la publicación de calls validados, más el sistema de tracking de calls y reputación de canales que alimenta el scoring.

Ver [`12-spydefi-core-overview.md`](12-spydefi-core-overview.md) para el mapa completo de los BCs del core.

## Lo que NO cubre esta documentación

Los BCs de **producto** que se construirán encima del core en el repositorio nuevo:

- `telegram/user-bot` (bot conversacional de usuario, `/start`, `/kol-stats`, etc.).
- `telegram/kol-bot` (KOL Club, Notify, anuncios).
- `telegram/verify` (verificación de @user/@channel, scam warning).
- `telegram/buybot` (alertas de compra, whale alerts, achievements de proyecto).
- `premium` (tiers, custom filters, preset filters).
- `achievements` (sistema de logros por KOL y por call).
- `kol-stats` (consistency, average X, PnL potential, alpha caller count).
- `web-dashboard` (UI web para explorar el grafo de calls).

Estos BCs consumirán los **eventos** y las **APIs in-process** que el core publica, pero viven en su propio repositorio (o como sub-app monorepo) y no se documentan aquí.
