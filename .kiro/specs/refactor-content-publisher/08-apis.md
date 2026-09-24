# Sistema Publisher — HTTP APIs Reference

**Documentación completa de endpoints HTTP**

---

## Tabla de Contenidos

1. [Matching](#matching)
2. [Queue Management](#queue-management)
3. [Keywords & Phrases](#keywords--phrases)
4. [Blacklist](#blacklist)
5. [Content Filters](#content-filters)
6. [LLM Configuration](#llm-configuration)
7. [Prompt Templates](#prompt-templates)
8. [Ads Management](#ads-management)
9. [Media Management](#media-management)
10. [Health & Metrics](#health--metrics)

---

## Matching

### Get Matching Config

```http
GET /crypto-news-integration/matching/config

Response 200:
{
  "enabled": boolean,
  "updatedAt": "2026-09-23T10:00:00Z",
  "updatedBy": string | null
}
```

### Update Matching Config

```http
PATCH /crypto-news-integration/matching/config
Content-Type: application/json

Body:
{
  "enabled": boolean
}

Response 200:
{
  "success": true
}
```

### Get Matching Health

```http
GET /crypto-news-integration/matching/health

Response 200:
{
  "enabled": boolean,
  "lastCheckAt": "2026-09-23T10:00:00Z" | null,
  "stats": {
    "matchesFound": number,
    "enqueued": number,
    "skipped": number
  }
}
```

---

## Queue Management

### List Queue Entries

```http
GET /crypto-news-publisher/queue
Query Parameters:
  - status: PENDING | SCHEDULED | PUBLISHED | FAILED | BLOCKED
  - limit: number (default 50, max 100)
  - offset: number (default 0)
  - sortBy: queuedAt | publishedAt (default queuedAt)
  - sortOrder: ASC | DESC (default DESC)

Response 200:
{
  "entries": [
    {
      "id": "uuid",
      "traceId": "uuid",
      "channelId": "string",
      "messageId": number,
      "rawContent": "string",
      "rawTitle": "string" | null,
      "imagePaths": string[],
      "status": "PENDING",
      "queuedAt": "2026-09-23T10:00:00Z",
      "publishedAt": null,
      "telegramMessageId": null,
      "lastError": null,
      "attempts": 0,
      "matchedKeywordIds": string[]
    }
  ],
  "total": number,
  "stats": {
    "pending": number,
    "scheduled": number,
    "published": number,
    "failed": number,
    "blocked": number,
    "oldestPending": "2026-09-23T10:00:00Z" | null
  }
}
```

### Get Queue Entry

```http
GET /crypto-news-publisher/queue/:id

Response 200:
{
  "id": "uuid",
  "traceId": "uuid",
  "channelId": "string",
  "messageId": number,
  "rawContent": "string",
  "rawTitle": "string" | null,
  "imagePaths": string[],
  "groupedId": "string" | null,
  "matchedKeywordIds": string[],
  "keywordTemplateId": "uuid" | null,
  "formattingEntities": "string" | null,
  "messageReceivedAt": "2026-09-23T10:00:00Z",
  "queuedAt": "2026-09-23T10:00:00Z",
  "status": "PUBLISHED",
  "publishedAt": "2026-09-23T10:05:00Z",
  "telegramMessageId": "123456",
  "lastError": null,
  "attempts": 0,
  "generatedContent": "string" | null,
  "generatedModel": "gpt-4o" | null,
  "blockedReason": null,
  "duplicateOfEntryId": null
}

Response 404:
{
  "statusCode": 404,
  "message": "Queue entry not found",
  "error": "Not Found"
}
```

### Delete Queue Entry

```http
DELETE /crypto-news-publisher/queue/:id

Response 200:
{
  "success": true
}

Response 404:
{
  "statusCode": 404,
  "message": "Queue entry not found"
}
```

### Get Queue Stats

```http
GET /crypto-news-publisher/queue/stats

Response 200:
{
  "pending": number,
  "scheduled": number,
  "published": number,
  "failed": number,
  "blocked": number,
  "oldestPending": "2026-09-23T10:00:00Z" | null
}
```

### Get Queue Media

```http
GET /crypto-news-publisher/queue/media/:entryId/:index

Response 200:
Content-Type: image/jpeg | image/png | image/webp
Body: Binary image data

Response 404:
{
  "statusCode": 404,
  "message": "Media not found"
}
```

---

## Keywords & Phrases

### List Keywords

```http
GET /crypto-news-publisher/keywords
Query Parameters:
  - channelId: string (optional)
  - type: SIMPLE | AND_GROUP (optional)
  - isActive: boolean (optional)

Response 200:
{
  "keywords": [
    {
      "id": "uuid",
      "phrase": "bitcoin",
      "type": "SIMPLE",
      "compoundPhrases": [],
      "channelId": null,
      "priority": 10,
      "templateId": null,
      "isActive": true,
      "createdAt": "2026-09-23T10:00:00Z",
      "updatedAt": "2026-09-23T10:00:00Z"
    },
    {
      "id": "uuid",
      "phrase": "BTC ETF Approval",
      "type": "AND_GROUP",
      "compoundPhrases": ["bitcoin", "etf", "sec"],
      "channelId": null,
      "priority": 100,
      "templateId": "template-uuid",
      "isActive": true,
      "createdAt": "2026-09-23T10:00:00Z",
      "updatedAt": "2026-09-23T10:00:00Z"
    }
  ]
}
```

### Create Keyword

```http
POST /crypto-news-publisher/keywords
Content-Type: application/json

Body:
{
  "phrase": "string",             // Required
  "type": "SIMPLE" | "AND_GROUP", // Required
  "compoundPhrases": string[],    // Required if type=AND_GROUP
  "channelId": "string",          // Optional
  "priority": number,             // Optional (default 0)
  "templateId": "uuid"            // Optional
}

Response 201:
{
  "id": "uuid"
}

Response 400:
{
  "statusCode": 400,
  "message": "Validation failed",
  "errors": [
    "phrase cannot be empty",
    "AND_GROUP requires at least 2 compound phrases"
  ]
}
```

### Update Keyword

```http
PATCH /crypto-news-publisher/keywords/:id
Content-Type: application/json

Body:
{
  "phrase": "string",            // Optional
  "compoundPhrases": string[],   // Optional
  "priority": number,            // Optional
  "templateId": "uuid" | null,   // Optional
  "isActive": boolean            // Optional
}

Response 200:
{
  "success": true
}
```

### Delete Keyword

```http
DELETE /crypto-news-publisher/keywords/:id

Response 200:
{
  "success": true
}
```

---

## Blacklist

### List Blacklist Phrases

```http
GET /crypto-news-publisher/blacklist
Query Parameters:
  - channelId: string (optional)
  - isActive: boolean (optional)

Response 200:
{
  "phrases": [
    {
      "id": "uuid",
      "phrase": "spam",
      "matchMode": "EXACT",
      "reason": "Known spam keyword",
      "channelId": null,
      "isActive": true,
      "createdAt": "2026-09-23T10:00:00Z",
      "updatedAt": "2026-09-23T10:00:00Z"
    }
  ]
}
```

### Create Blacklist Entry

```http
POST /crypto-news-publisher/blacklist
Content-Type: application/json

Body:
{
  "phrase": "string",                               // Required
  "matchMode": "EXACT" | "CONTAINS" | "REGEX",     // Required
  "reason": "string",                              // Optional
  "channelId": "string"                            // Optional
}

Response 201:
{
  "id": "uuid"
}
```

### Update Blacklist Entry

```http
PATCH /crypto-news-publisher/blacklist/:id
Content-Type: application/json

Body:
{
  "phrase": "string",            // Optional
  "matchMode": "EXACT" | "CONTAINS" | "REGEX", // Optional
  "reason": "string",            // Optional
  "isActive": boolean            // Optional
}

Response 200:
{
  "success": true
}
```

### Delete Blacklist Entry

```http
DELETE /crypto-news-publisher/blacklist/:id

Response 200:
{
  "success": true
}
```

---

## Content Filters

### List Filters for Channel

```http
GET /crypto-news/sources/:channelId/filters

Response 200:
{
  "filters": [
    {
      "id": "uuid",
      "channelId": "-1001234567890",
      "pattern": "🚀.*?🚀",
      "replacement": "",
      "flags": "gs",
      "priority": 10,
      "description": "Remove rocket emoji spam",
      "isActive": true,
      "createdAt": "2026-09-23T10:00:00Z",
      "updatedAt": "2026-09-23T10:00:00Z"
    }
  ]
}
```

### Create Filter

```http
POST /crypto-news/sources/:channelId/filters
Content-Type: application/json

Body:
{
  "pattern": "string",        // Required (regex pattern)
  "replacement": "string",    // Required
  "flags": "string",          // Required (e.g., "gi")
  "priority": number,         // Required
  "description": "string"     // Optional
}

Response 201:
{
  "id": "uuid"
}

Response 400:
{
  "statusCode": 400,
  "message": "Invalid regex pattern"
}
```

### Update Filter

```http
PATCH /crypto-news/filters/:id
Content-Type: application/json

Body:
{
  "pattern": "string",        // Optional
  "replacement": "string",    // Optional
  "flags": "string",          // Optional
  "priority": number,         // Optional
  "isActive": boolean         // Optional
}

Response 200:
{
  "success": true
}
```

### Delete Filter

```http
DELETE /crypto-news/filters/:id

Response 200:
{
  "success": true
}
```

---

## LLM Configuration

### Get LLM Config

```http
GET /crypto-news-publisher/llm/config

Response 200:
{
  "llmEnabled": boolean,
  "publishingEnabled": boolean,
  "defaultTemplateId": "uuid",
  "llmMaxTokens": number,
  "llmMaxAttempts": number,
  "dailyCap": number,
  "dailyResetUtcHour": number,
  "rejectNonLatin": boolean,
  "updatedAt": "2026-09-23T10:00:00Z",
  "updatedBy": "string" | null
}
```

### Update LLM Config

```http
PATCH /crypto-news-publisher/llm/config
Content-Type: application/json

Body:
{
  "llmEnabled": boolean,              // Optional (BLOCKED in production)
  "publishingEnabled": boolean,       // Optional
  "defaultTemplateId": "uuid",        // Optional
  "llmMaxTokens": number,             // Optional
  "llmMaxAttempts": number,           // Optional
  "dailyCap": number,                 // Optional
  "dailyResetUtcHour": number,        // Optional (0-23)
  "rejectNonLatin": boolean           // Optional
}

Response 200:
{
  "success": true
}

Response 400 (Production Guard):
{
  "statusCode": 400,
  "error": "llmEnabled cannot be changed in production (always enabled for quality)",
  "hint": "Use matchingEnabled or publishingEnabled to control pipeline"
}
```

### List Available Models

```http
GET /crypto-news-publisher/llm/models

Response 200:
{
  "models": [
    "gpt-4o",
    "gpt-4o-mini",
    "claude-3-opus-20240229",
    "claude-3-sonnet-20240229",
    "o1-preview",
    "o1-mini"
  ]
}
```

---

## Prompt Templates

### List Templates

```http
GET /crypto-news-publisher/llm/templates

Response 200:
{
  "templates": [
    {
      "id": "uuid",
      "name": "Default Crypto News",
      "description": "Standard formatting",
      "systemPrompt": "You are a professional...",
      "userPrompt": "Title: {{title}}...",
      "model": "gpt-4o",
      "temperature": 0.7,
      "reasoningEffort": null,
      "isActive": true,
      "createdAt": "2026-09-23T10:00:00Z",
      "updatedAt": "2026-09-23T10:00:00Z"
    }
  ]
}
```

### Create Template

```http
POST /crypto-news-publisher/llm/templates
Content-Type: application/json

Body:
{
  "name": "string",                  // Required (1-200 chars, unique)
  "description": "string",           // Optional
  "systemPrompt": "string",          // Required (1-10000 chars)
  "userPrompt": "string",            // Required (1-10000 chars, must have placeholders)
  "model": "string",                 // Required
  "temperature": number,             // Required (0.0-1.0)
  "reasoningEffort": "low" | "medium" | "high" // Optional
}

Response 201:
{
  "id": "uuid"
}

Response 400:
{
  "statusCode": 400,
  "message": "Validation failed",
  "errors": [
    "User prompt must contain at least one placeholder"
  ]
}
```

### Get Template

```http
GET /crypto-news-publisher/llm/templates/:id

Response 200:
{
  "id": "uuid",
  "name": "string",
  "description": "string" | null,
  "systemPrompt": "string",
  "userPrompt": "string",
  "model": "string",
  "temperature": number,
  "reasoningEffort": "string" | null,
  "isActive": boolean,
  "createdAt": "2026-09-23T10:00:00Z",
  "updatedAt": "2026-09-23T10:00:00Z"
}
```

### Update Template

```http
PATCH /crypto-news-publisher/llm/templates/:id
Content-Type: application/json

Body:
{
  "name": "string",              // Optional
  "description": "string",       // Optional
  "systemPrompt": "string",      // Optional
  "userPrompt": "string",        // Optional
  "model": "string",             // Optional
  "temperature": number,         // Optional
  "reasoningEffort": "string",   // Optional
  "isActive": boolean            // Optional
}

Response 200:
{
  "success": true
}
```

### Delete Template

```http
DELETE /crypto-news-publisher/llm/templates/:id

Response 200:
{
  "success": true
}

Response 400:
{
  "statusCode": 400,
  "message": "Cannot delete template in use as default"
}
```

### Preview Template

```http
POST /crypto-news-publisher/llm/preview
Content-Type: application/json

Body:
{
  "templateId": "uuid",          // Required
  "content": "string",           // Required
  "title": "string",             // Optional
  "imageUrls": string[]          // Optional
}

Response 200:
{
  "generatedContent": "string",
  "systemPrompt": "string",
  "userPrompt": "string",
  "model": "string",
  "temperature": number,
  "reasoningEffort": "string" | null,
  "usage": {
    "promptTokens": number,
    "completionTokens": number,
    "totalTokens": number
  }
}
```

---

## Ads Management

### List Ads

```http
GET /crypto-news-ads/ads
Query Parameters:
  - isActive: boolean (optional)
  - limit: number (default 50)
  - offset: number (default 0)

Response 200:
{
  "ads": [
    {
      "id": "uuid",
      "text": "string",
      "mediaType": "IMAGE" | "VIDEO" | "TEXT_ONLY",
      "isActive": boolean,
      "priority": number,
      "scheduledStartDate": "2026-10-01T00:00:00Z" | null,
      "scheduledEndDate": "2026-12-31T23:59:59Z" | null,
      "lastPublishedAt": "2026-09-23T10:00:00Z" | null,
      "publishCount": number,
      "createdAt": "2026-09-23T10:00:00Z"
    }
  ],
  "total": number
}
```

### Create Ad

```http
POST /crypto-news-ads/ads
Content-Type: application/json

Body:
{
  "text": "string",                         // Required (1-1024 chars)
  "mediaType": "IMAGE" | "VIDEO" | "TEXT_ONLY", // Required
  "priority": number,                       // Optional (default 0)
  "scheduledStartDate": "2026-10-01T00:00:00Z", // Optional
  "scheduledEndDate": "2026-12-31T23:59:59Z"    // Optional
}

Response 201:
{
  "id": "uuid"
}
```

### Update Ad

```http
PATCH /crypto-news-ads/ads/:id
Content-Type: application/json

Body:
{
  "text": "string",              // Optional
  "mediaType": "IMAGE" | "VIDEO" | "TEXT_ONLY", // Optional
  "priority": number,            // Optional
  "isActive": boolean,           // Optional
  "scheduledStartDate": "string", // Optional
  "scheduledEndDate": "string"   // Optional
}

Response 200:
{
  "success": true
}
```

### Delete Ad

```http
DELETE /crypto-news-ads/ads/:id

Response 200:
{
  "success": true
}
```

### Publish Ad Now (Manual)

```http
POST /crypto-news-ads/ads/:id/publish-now

Response 200:
{
  "success": true,
  "messageId": "123456"
}

Response 400:
{
  "statusCode": 400,
  "message": "Ad is not active"
}
```

---

## Media Management

### Upload Ad Image

```http
POST /crypto-news-ads/ads/:adId/images
Content-Type: multipart/form-data

Body:
  - file: Binary (image file)
  - sequence: number (optional)

Response 201:
{
  "mediaId": "uuid"
}

Response 400:
{
  "statusCode": 400,
  "message": "File must be an image"
}
```

### Clear Ad Media

```http
DELETE /crypto-news-ads/ads/:adId/media

Response 200:
{
  "success": true,
  "deletedCount": number
}
```

### List Media Library

```http
GET /crypto-news-ads/media/library
Query Parameters:
  - tags: string[] (optional)
  - mediaType: IMAGE | VIDEO (optional)

Response 200:
{
  "items": [
    {
      "id": "uuid",
      "filename": "string",
      "originalName": "string",
      "mimeType": "image/jpeg",
      "sizeBytes": number,
      "mediaType": "IMAGE",
      "storageUrl": "string",
      "usageCount": number,
      "description": "string" | null,
      "tags": string[],
      "createdAt": "2026-09-23T10:00:00Z"
    }
  ]
}
```

### Upload to Library

```http
POST /crypto-news-ads/media/library
Content-Type: multipart/form-data

Body:
  - file: Binary (image/video file)
  - description: string (optional)
  - tags: string[] (optional)

Response 201:
{
  "id": "uuid"
}
```

### Reuse Library Image

```http
POST /crypto-news-ads/ads/:adId/images/reuse
Content-Type: application/json

Body:
{
  "libraryImageId": "uuid",  // Required
  "sequence": number         // Optional
}

Response 201:
{
  "mediaId": "uuid"
}
```

### Get Rotation Config

```http
GET /crypto-news-ads/rotation-config

Response 200:
{
  "enabled": boolean,
  "intervalPosts": number,
  "minHoursBetweenAds": number,
  "updatedAt": "2026-09-23T10:00:00Z",
  "updatedBy": "string" | null
}
```

### Update Rotation Config

```http
PATCH /crypto-news-ads/rotation-config
Content-Type: application/json

Body:
{
  "enabled": boolean,            // Optional
  "intervalPosts": number,       // Optional (>0)
  "minHoursBetweenAds": number   // Optional (>=0)
}

Response 200:
{
  "success": true
}
```

### Get Rotation State

```http
GET /crypto-news-ads/rotation-state

Response 200:
{
  "postsSinceLastAd": number,
  "lastAdPublishedAt": "2026-09-23T10:00:00Z" | null,
  "lastAdId": "uuid" | null
}
```

---

## Health & Metrics

### System Health

```http
GET /api/health

Response 200:
{
  "status": "ok",
  "timestamp": "2026-09-23T10:00:00Z",
  "uptime": number,
  "database": "connected",
  "redis": "connected"
}
```

### Publisher Metrics

```http
GET /crypto-news-publisher/metrics

Response 200:
{
  "queue": {
    "size": number,
    "oldestPendingAge": number | null
  },
  "published24h": {
    "count": number,
    "successRate": number
  },
  "performance": {
    "avgLatency": number,
    "p95Latency": number
  },
  "throttle": {
    "lastPublishAt": "2026-09-23T10:00:00Z" | null,
    "nextPublishEta": number | null
  },
  "dailyCap": {
    "used": number,
    "total": number
  }
}
```

---

## Error Responses

### Standard Error Format

```json
{
  "statusCode": number,
  "message": "string",
  "error": "string",
  "timestamp": "2026-09-23T10:00:00Z",
  "path": "/api/endpoint"
}
```

### Common HTTP Status Codes

- `200 OK` — Successful request
- `201 Created` — Resource created
- `400 Bad Request` — Validation error
- `401 Unauthorized` — Missing or invalid auth
- `404 Not Found` — Resource not found
- `409 Conflict` — Duplicate resource
- `429 Too Many Requests` — Rate limit exceeded
- `500 Internal Server Error` — Server error

---

**Navegación**: [← 07-deduplication.md](./07-deduplication.md) | [09-database.md →](./09-database.md)
