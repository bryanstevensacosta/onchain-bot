# BC README Guide — Cómo crear y mantener los `README.md` de los Bounded Contexts

> Esta guía define **qué debe contener**, **cómo debe escribirse** y **cuándo debe actualizarse** el `README.md` de cada BC del proyecto.

El primer BC que sirve como referencia es `src/discovery/ingestion/telegram/README.md`; utilízalo como plantilla canónica.

---

## 1. Propósito de esta guía

- Estandarizar la documentación interna de todos los BCs (`src/discovery/*`, `src/user/`, `src/token/`, `src/trading/`, `src/analytics/`, `src/notification/`).
- Acelerar el onboarding de nuevos devs: cualquier BC debe entenderse leyendo **solo** su `README.md`.
- Mantener viva la arquitectura: el README refleja el código, no la intención.

> Regla de oro: **si cambias el código del BC, actualiza su README en el mismo commit**.

---

## 2. Ubicación y nombrado

| Elemento | Convención |
|---|---|
| Archivo | `README.md` (en MAYÚSCULAS) |
| Ruta | `<raíz del BC>/README.md` (ej. `src/discovery/ingestion/telegram/README.md`) |
| Idioma | Español (consistente con `docs/proyect/BC.md` y resto de docs internas) |
| Encoding | UTF-8, LF |

No crear variantes (`README.es.md`, `README-old.md`). Si necesitas separar concerns, usa secciones dentro del mismo archivo.

---

## 3. Estructura obligatoria

El README de un BC **debe** contener, en este orden, las siguientes secciones. Las marcadas como **[REQ]** son obligatorias; las **[OPT]** son recomendadas.

| # | Sección | Tag | Contenido |
|---|---|---|---|
| 1 | Título + tagline | [REQ] | Nombre del BC y frase que responda "¿para qué existe?" |
| 2 | Propósito | [REQ] | 1 párrafo + 3 preguntas clave que el BC resuelve |
| 3 | Responsabilidades del BC | [REQ] | Tabla "responsabilidad / archivo" + lista de lo que **NO** hace |
| 4 | Límites transaccionales | [REQ] | Agregado raíz, atomicidad, eventos, concurrencia |
| 5 | Lenguaje ubicuo | [REQ] | Glosario de términos con definición y referencia `archivo:línea` |
| 6 | API (HTTP inbound) | [REQ] | Tabla de rutas + inputs + outputs |
| 7 | Objetos y modelado del dominio | [REQ] | Agregados, VOs, eventos, puertos |
| 8 | Puertos de aplicación | [OPT] | Repos, publishers, mappers |
| 9 | Infraestructura | [REQ] | Adaptadores concretos (MTProto, REST, DB, bus) |
| 10 | Casos de uso | [REQ] | Tabla con cada use case y comportamiento clave |
| 11 | Flujo (happy path) | [OPT] | Diagrama ASCII del flujo principal |
| 12 | Wiring (NestJS DI) | [REQ] | Tabla token → implementación + exports |
| 13 | Errores de dominio | [OPT] | `ErrorCode` usados y dónde se lanzan |
| 14 | Pruebas | [OPT] | Listado de specs existentes + gaps conocidos |
| 15 | Extensiones sugeridas | [OPT] | Trabajo futuro explícito (no wishlist genérica) |
| 16 | Mapa rápido de archivos | [REQ] | Árbol de directorios del BC |

---

## 4. Reglas de redacción

1. **Referencias explícitas con `archivo.ts:línea`.** Cada afirmación sobre el código debe apuntar a una ubicación concreta. Ej.:
   > `TelegramChannel` agregado en `domain/entities/telegram-channel.entity.ts:13`.
2. **Sin emojis** salvo que el usuario lo pida explícitamente.
3. **Sin claims de marketing** ("súper rápido", "robusto"). Describe comportamiento observable.
4. **Tablas para datos estructurados**, prosa para explicar.
5. **Listas con verbos en imperativo o infinitivo** consistente.
6. **Diagramas ASCII** cuando el flujo tenga más de 3 saltos. Evita Mermaid salvo que el repo ya lo use.
7. **Tono técnico, conciso.** Máx. 1 idea por bullet.

---

## 5. Workflow para crear un README de BC

### Paso 1 — Inventariar el BC

Antes de escribir, recolecta:

```bash
ls src/<ruta-del-bc>
```

Para cada subcarpeta (`api/`, `application/`, `domain/`, `infrastructure/`):

- Lista archivos.
- Identifica el módulo NestJS (`*.module.ts`).
- Identifica use cases (`*.use-case.ts`).
- Identifica entidades y VOs.

### Paso 2 — Leer el módulo raíz

`*.module.ts` define el grafo DI: providers, controllers, exports. Es la mejor fuente para la sección **Wiring**.

### Paso 3 — Leer el agregado

El archivo `domain/entities/*.entity.ts` define el modelo. Extrae:

- Atributos del estado privado.
- Factory `static create(...)` con sus validaciones.
- Métodos públicos (comandos del agregado).
- `mutate(event)` si hay event sourcing.

### Paso 4 — Leer los VOs y eventos

Cada VO tiene regex o reglas de validación. Cópialas textualmente al README en la sección **Lenguaje ubicuo** y **Objetos del dominio**.

### Paso 5 — Leer los puertos

`application/ports/*.ts` y `domain/ports/*.ts` declaran el contrato. Documenta cada método.

### Paso 6 — Leer los adaptadores

`infrastructure/` y `api/` contienen implementaciones. Documenta:

- Cómo leen config (`ConfigService`).
- Cómo manejan errores (especialmente `FloodWait`, rate limits, etc.).
- Cómo se conectan/desconectan (lifecycle hooks).

### Paso 7 — Redactar el README

Usa como plantilla la sección §3 de esta guía. Copia el README de `src/discovery/ingestion/telegram/README.md` como base.

### Paso 8 — Verificar

Checklist antes de commitear:

- [ ] ¿Cada referencia `archivo:línea` apunta a un archivo existente?
- [ ] ¿Las rutas HTTP están completas (método + path + handler)?
- [ ] ¿Los `ErrorCode` listados son los que realmente se lanzan?
- [ ] ¿El árbol de archivos final refleja la realidad?
- [ ] ¿No hay secciones vacías?

---

## 6. Workflow para actualizar un README existente

Disparadores de actualización:

- Se **añade, renombra o elimina** un archivo dentro del BC.
- Se **modifica la firma** de un use case o puerto.
- Se **añade** un nuevo evento, VO o entidad.
- Se **cambia** el wiring del módulo DI.
- Se **añade** un nuevo `ErrorCode` o un handler nuevo.

Procedimiento:

1. `git diff src/<bc>` para localizar cambios.
2. Para cada archivo tocado, ubicar las secciones afectadas en el README.
3. Actualizar líneas concretas (no reescribir el README entero si no hace falta).
4. Si añades un método nuevo al agregado, añadir bullet en **Casos de uso** y entrada en **Lenguaje ubicuo** si introduce vocabulario.
5. Re-ejecutar la checklist de §5 paso 8.

> Recomendación: incluir el `README.md` en el mismo commit que el código modificado para evitar drift.

---

## 7. Plantilla mínima

Si necesitas arrancar desde cero, este es el esqueleto. Rellena cada sección con datos reales del BC.

```markdown
# <Nombre del BC> — Bounded Context

> <Tagline de una línea respondiendo "¿para qué existe?">

Forma parte de `<ruta>` y se monta vía `<nombre>.module.ts:<línea>`.

---

## 1. Propósito

<Párrafo corto + 3 preguntas clave>

## 2. Responsabilidades del BC

| Responsabilidad | Dónde vive |
|---|---|
| ... | `path/al/archivo.ts` |

**Fuera del scope:**
- ...

## 3. Límites transaccionales

- Agregado raíz: `<Entity>` (`path:línea`).
- ...

## 4. Lenguaje ubicuo

| Término | Definición |
|---|---|
| `<Term>` | `<def>` + referencia `path:línea` |

## 5. API (HTTP — inbound)

Base path: `<base>` (`controller.ts:línea`).

| Método | Ruta | Handler | Caso de uso |
|---|---|---|---|

## 6. Objetos y modelado del dominio

### 6.1 Agregado `<Entity>`

Archivo: `path/entity.ts`.

```
<Entity> {
  ...
}
```

Métodos relevantes:
- `static create(...)` (`:N`) — ...
- `comportamiento()` (`:N`) — ...

### 6.2 Value Objects

- `<VO1>` (`path:vo.ts:N`) — ...

### 6.3 Eventos

- `<Event>` (`path:event.ts:N`) — ...

### 6.4 Puertos de dominio

- `<Port>` (`path:port.ts:N`) — ...

## 7. Infraestructura

### 7.1 <Adaptador>

Archivo: `path/adapter.ts`.

- ...

## 8. Casos de uso

| Use case | Archivo | Comportamiento |
|---|---|---|
| `<Name>` | `path/usecase.ts:N` | ... |

## 9. Wiring (NestJS DI)

Archivo: `module.ts:N`.

| Token | Implementación |
|---|---|

## 10. Errores de dominio

- `VALIDATION` — `<dónde se lanza>` (`path:línea`).
- ...

## 11. Pruebas

- `path/spec.ts` — ...

## 12. Extensiones sugeridas

1. ...

## 13. Mapa rápido de archivos

```
<árbol>
```
```

---

## 8. Convenciones específicas del repo

Estas convenciones ya están fijadas en `src/discovery/ingestion/telegram/` y deben replicarse:

- **Hexagonal estricto:** `domain/` no importa de `application/`, `infrastructure/` o `api/`. Ver `domain/entities/telegram-channel.entity.ts` (sin imports NestJS).
- **Puertos como `abstract class`** (no `interface`) para ser tokens DI. Ver `domain/ports/telegram-listener.port.ts:8` y comentario en `:7`.
- **Inputs en `api/input/`.** Ver `api/input/add-channel.input.ts:1`.
- **VOs como `ValueObject<TProps>`** con factory `fromX(...)` que lanza `DomainError(VALIDATION)`. Ver `domain/value-objects/channel-username.vo.ts:19`.
- **Errores centralizados** en `shared/domain/domain-error.ts`. Usar `ErrorCode` enum.
- **Eventos extienden `DomainEvent`** con `eventName` y payload inmutable (`Object.freeze`). Ver `domain/events/message-ingested.event.ts:22`.
- **Publisher siempre vía `publishAll`** después de cada `aggregate.commit()`. Ver `application/ports/telegram-event.publisher.ts:11`.

Si un nuevo BC rompe alguna de estas convenciones, documenta el porqué en su README (sección **Extensiones sugeridas** o una sub-sección **Desviaciones de convención**).

---

## 9. Anti-patrones a evitar

- ❌ README genérico copiado de otro BC sin reemplazar nombres y referencias.
- ❌ Referencia a "TODO", "FIXME" o "próximamente" sin contexto.
- ❌ Incluir config (`api_id`, `api_hash`, tokens) en el README.
- ❌ Describir intenciones futuras como si ya estuvieran implementadas.
- ❌ Duplicar el `BC.md` global (`docs/proyect/BC.md`). El README del BC **complementa**, no repite.
- ❌ Usar paths absolutos (`/Users/.../src/...`). Siempre paths relativos al repo (`src/...`).
- ❌ Documentar tests como si fueran specs cuando son solo `*.spec.ts` mínimos o no existen.

---

## 10. Estado de cobertura

| BC | ¿Tiene README? | Referencia |
|---|---|---|
| `src/discovery/ingestion/telegram` | ✅ | `src/discovery/ingestion/telegram/README.md` |
| `src/discovery/ingestion/reddit` | ❌ | pendiente |
| `src/discovery/ingestion/twitter` | ❌ | pendiente |
| `src/discovery/ingestion/discord` | ❌ | pendiente |
| `src/discovery/ingestion/webhooks` | ❌ | pendiente |
| `src/discovery/extraction` | ✅ | `src/discovery/extraction/README.md` |
| `src/discovery/parsing` | ✅ | `src/discovery/parsing/README.md` |
| `src/discovery/normalization` | ✅ | `src/discovery/normalization/README.md` |
| `src/discovery/chain-detection` | ✅ | `src/discovery/chain-detection/README.md` |
| `src/discovery/enrichment` | ✅ | `src/discovery/enrichment/README.md` |
| `src/discovery/classification` | ✅ | `src/discovery/classification/README.md` |
| `src/discovery/scoring` | ✅ | `src/discovery/scoring/README.md` |
| `src/discovery/analytics` | ✅ | `src/discovery/analytics/README.md` |
| `src/discovery/filters` | ✅ | `src/discovery/filters/README.md` |
| `src/discovery/publishing/telegram` | ✅ | `src/discovery/publishing/telegram/README.md` |
| `src/user` | ❌ | pendiente |
| `src/token` | ❌ | pendiente |
| `src/trading` | ❌ | pendiente |
| `src/analytics` | ❌ | pendiente |
| `src/notification` | ❌ | pendiente |
| `src/shared` | ✅ (no es BC) | `src/shared/README.md` |

> A medida que se cree cada README, actualiza esta tabla.

---

## 11. Recursos relacionados

- `docs/proyect/BC.md` — Mapa global de BCs, lenguaje ubicuo de alto nivel y grafo de dependencias.
- `docs/proyect/PLAN.md` — Orden de implementación y rationale.
- `src/discovery/ingestion/telegram/README.md` — Ejemplo canónico a replicar.
- `src/shared/domain/*` — Base classes (`AggregateRoot`, `ValueObject`, `DomainEvent`, `DomainError`).