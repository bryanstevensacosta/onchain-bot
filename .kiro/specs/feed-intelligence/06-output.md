# 📦 Output para Feed-Publisher (Resumen Ejecutivo)

# ¿Qué recibe feed-publisher?

Contenido listo para publicar, ya procesado, filtrado, agrupado y formateado según diferentes formatos (templates).

**API:** GET /content/pending
**Response:** Lista de contenidos listos para publicar

```
[
  {
    "id": "uuid-123",
    "templateName": "Hourly Highlights",
    "templateType": "highlights",
    "content": "📰 **Top 5 Crypto News**\n\n🚨 **1.** US seizes $84M from Tether payment processor...\n\n🐋 **2.** Whale moves $50M ETH...",
    "metadata": {
      "totalItems": 5,
      "avgScore": 85,
      "categoriesIncluded": ["regulation", "whale_activity"],
      "generatedAt": "2026-09-25T14:00:00Z"
    },
    "generatedAt": "2026-09-25T14:00:00Z"
  },
  {
    "id": "uuid-456",
    "templateName": "Breaking News Alert",
    "templateType": "breaking",
    "content": "🚨 **BREAKING**\n\nTether exits EU MiCA framework...",
    "metadata": {
      "totalItems": 1,
      "avgScore": 95,
      "generatedAt": "2026-09-25T14:15:00Z"
    },
    "generatedAt": "2026-09-25T14:15:00Z"
  }
]
```

# 🎯 Tipos de Contenido (Templates)

# 1. Hourly Highlights (cada hora)

**Qué es:** Top 5 noticias más relevantes de la última hora Formato: Lista numerada con emojis por categoría
**Ejemplo:**

📰 Top 5 Crypto News — Last Hour
🚨 1. US seizes $84M from Tether processor
🐋 2. Whale moves $50M in ETH
💰 3. Citi recommends buying crypto dip

# 2. Breaking News Alert (cada 15 min, condicional)

**Qué es:** Noticias urgentes con score >= 85 Formato: Alerta destacada con 1-3 noticias críticas Ejemplo:

🚨 BREAKING CRYPTO NEWS

⚠️ URGENT: Tether exits EU regulatory framework
Impact: High — Major stablecoin regulation

# 3. Daily Digest (diario 8 AM)

**Qué es:** Top 10 noticias del día agrupadas por categoría Formato: Secciones por tipo (Regulation, Market, Whale Activity) Ejemplo:

📊 Daily Crypto Digest — Sep 25, 2026

🚨 REGULATION (3)

1. US seizes $84M...
2. EU MiCA framework...

🐋 WHALE ACTIVITY (2)

1. $50M ETH transfer...

# 4. Story Updates (diario 9 AM)

**Qué es:** Historias en desarrollo con actualizaciones Formato: Timeline de eventos relacionados
**Ejemplo:**

📖 Developing Stories

📰 Tether-MiCA Exit

Latest (Sep 25, 14:30 UTC):
European exchanges delisting USDT...

Timeline:
🆕 Sep 22: Tether announces exit
📈 Sep 23: No plans to return
📈 Sep 25: Exchanges begin delisting

# 🔄 Flujo de Consumo

Content-Publisher llama cada 1-5 minutos:
↓
GET /content/pending
↓
Recibe 0-N contenidos listos
↓
Por cada contenido:

1. Publica en Telegram (sendMessage)
2. Marca como consumido: POST /content/{id}/consume

# ✨ Valor Agregado (vs mensajes crudos)

# Sin Feed-Intelligence (antes):

❌ 65 mensajes/día individuales
❌ Muchos duplicados
❌ Sin contexto ni categorización
❌ Mezcla de importante y trivial
❌ Spam al usuario

# Con Feed-Intelligence (ahora):

✅ 4-8 publicaciones/día organizadas
✅ Duplicados fusionados en 1 mensaje completo
✅ Categorizado y priorizado
✅ Solo lo más relevante (score >= 70)
✅ Formatos profesionales listos para publicar

# 📊 Ejemplo Real: Un Día Típico

# Input (65 mensajes crudos de Telegram):

- 25 sobre regulación (5 duplicados)
- 15 sobre whales (3 duplicados)
- 10 sobre listings
- 15 noise/spam

# Output para content-publisher (6 contenidos):

- 09:00 AM → Hourly Highlights (5 noticias)
- 10:00 AM → Hourly Highlights (5 noticias)
- 11:15 AM → Breaking News (1 noticia urgente)
- 12:00 PM → Hourly Highlights (5 noticias)
- 08:00 AM (día siguiente) → Daily Digest (10 noticias agrupadas)
- 09:00 AM (día siguiente) → Story Updates (3 historias tracked)

# Resultado:

✅ 95% reducción de volumen (65 → 6)
✅ 100% contenido relevante (spam filtrado)
✅ Formatos profesionales (no mensajes crudos)
✅ Contexto agregado (timelines, agrupaciones)

# 🎁 En Resumen

# Feed-publisher recibe:

✅ Contenido curado (solo lo importante)
✅ Contenido formateado (listo para copiar/pegar)
✅ Contenido contextualizado (con metadata útil)
✅ Contenido sin duplicados (fusionados inteligentemente)
✅ Contenido organizado (por tipo y prioridad)

# Todo vía una API simple: GET /content/pending → array de strings listos para publicar.
