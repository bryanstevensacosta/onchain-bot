# pgAdmin Queries — Alpha Meta Token Scanner

Queries SQL pre-hechas para inspección rápida de la base de datos, versionadas en git.

## Cómo usarlas en pgAdmin

1. Abre **http://localhost:5050** → login.
2. Click en `alpha-meta-token-scanner` (servidor pre-cargado) → `alpha_meta_token_scanner`.
3. **Tools → Query Tool** (o `Alt+Shift+Q`).
4. **File → Open** (`Ctrl+O`) y selecciona la query.
5. F5 para ejecutar.

## Catálogo

| # | Archivo | Propósito |
|---|---------|-----------|
| 00 | `00_overview.sql` | Resumen: filas, tamaño y actividad de cada tabla |
| 01 | `01_active_jobs.sql` | Jobs pendientes, corriendo y fallidos |
| 02 | `02_top_tokens.sql` | Tokens con mayor score |
| 03 | `03_recent_calls.sql` | Llamadas canónicas recientes |
| 04 | `04_channel_performance.sql` | Ranking de canales por reputación |
| 05 | `05_call_outcomes.sql` | Distribución de outcomes de llamadas |
| 06 | `06_risky_tokens.sql` | Tokens con flags de seguridad |
| 07 | `07_all_previews.sql` | Preview rápido de todas las tablas en una sola query |
| 08 | `08_jobs_by_chain.sql` | Jobs agrupados por chain y estado |
| 09 | `09_liquidity_distribution.sql` | Distribución de market cap y liquidez |
| 10 | `10_top_channels_by_ath.sql` | Canales con ATH múltiple más alto |
| 11 | `11_score_tier_distribution.sql` | Distribución de tier y classification |
| 12 | `12_inactive_channels.sql` | Canales inactivos o sin ingestar |
| 13 | `13_tokens_no_score.sql` | Tokens aún sin puntuar |
| 14 | `14_data_freshness.sql` | Antigüedad del último registro por tabla |
| 15 | `15_recent_errors.sql` | Últimos errores en jobs |
| 16 | `16_activity_by_chain.sql` | Resumen de actividad por blockchain |
| 17 | `17_score_evolution_24h.sql` | Evolución horaria de scores (24h) |

## Añadir nuevas queries

Crea un nuevo archivo `NN_descripcion.sql` siguiendo la numeración. Mantén el header de comentarios para documentar el propósito.