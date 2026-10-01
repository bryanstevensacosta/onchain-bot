# Sistema Publisher — LLM & Prompt Templates

**Módulo**: `crypto-news-publisher/`  
**Responsabilidad**: Content generation, template management, model configuration

---

## Tabla de Contenidos

1. [Visión General](#visión-general)
2. [CryptoNewsLlmAdapter](#cryptonewsllmadapter)
3. [PromptTemplate Entity](#prompttemplate-entity)
4. [LlmConfig Entity](#llmconfig-entity)
5. [Template Selection](#template-selection)
6. [Image Handling](#image-handling)
7. [LiteLLM Integration](#litellm-integration)
8. [Output Validation](#output-validation)
9. [Preview Tool](#preview-tool)
10. [APIs](#apis)

---

## Visión General

El sistema LLM transforma contenido RAW de crypto-news en artículos refinados listos para publicación.

### Características

- **Optional**: LLM generation solo cuando `llmEnabled=true` AND `publishingEnabled=true`
- **Template-Based**: Prompt templates configurables (system + user prompts)
- **Vision Support**: Images encoded as base64 for vision models
- **Model Agnostic**: Cualquier modelo compatible con LiteLLM (OpenAI, Anthropic, etc.)
- **Validation**: Non-empty + Latin-only checks configurables
- **Preview**: Test templates sin publishar

### Pipeline

```
Queue Entry (PENDING)
    ↓
ProcessNextQueuedArticleUseCase
    ↓
CryptoNewsLlmAdapter.generateForEntry()
    ├─ Load LlmConfig
    ├─ Select PromptTemplate (keyword → default → first active)
    ├─ Download images a tmpdir
    ├─ Encode images a base64
    ├─ Interpolate prompts ({{title}}, {{content}}, {{imageAnalysis}})
    ├─ LlmPort.generate() → LiteLLM Gateway
    ├─ Validate output (non-empty + Latin-only)
    └─ Return { content, prompts, model, usage }
    ↓
Bot API Publish
    ↓
Queue Entry (PUBLISHED) + LLM metadata stored
```

---

## CryptoNewsLlmAdapter

**Ubicación**: `infrastructure/llm/crypto-news-llm.adapter.ts`

### Interface

```typescript
@Injectable()
export class CryptoNewsLlmAdapter {
  async generateForEntry(
    entry: PublisherQueueEntry,
  ): Promise<LlmGenerationResult | null>;
}

interface LlmGenerationResult {
  content: string; // Generated text
  systemPrompt: string; // Used system prompt
  userPrompt: string; // Used user prompt (interpolated)
  temperature: number; // Model temperature
  reasoningEffort: string | null; // 'low'|'medium'|'high' (o1 models)
  model: string; // Model identifier
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}
```

### Implementation

```typescript
async generateForEntry(
  entry: PublisherQueueEntry
): Promise<LlmGenerationResult | null> {
  // 1. Load config
  const cfg = await this.llmConfigRepo.load();

  if (!cfg.llmEnabled) {
    throw new Error('LLM generation called but llmEnabled=false');
  }

  // 2. Select template (priority: keyword → default → first active)
  const template = await this.selectTemplate(entry, cfg);

  // 3. Handle images
  let imageAnalysis: string | null = null;
  let tmpDir: string | null = null;

  try {
    if (entry.imagePaths.length > 0) {
      // Download to tmpdir
      tmpDir = path.join(os.tmpdir(), `backend-media-${uuid()}`);
      await fs.mkdir(tmpDir, { recursive: true });

      const localPaths = await this.downloadImages(entry.imagePaths, tmpDir);

      // Encode to base64
      imageAnalysis = await this.encodeImagesForVision(localPaths);
    }

    // 4. Interpolate prompts
    const systemPrompt = template.systemPrompt;
    const userPrompt = this.interpolateTemplate(template.userPrompt, {
      title: entry.rawTitle || '(Sin título)',
      content: entry.rawContent,
      imageAnalysis: imageAnalysis || '(Sin imágenes)'
    });

    // 5. Call LLM
    const result = await this.llmPort.generate({
      model: template.model,
      systemPrompt,
      userPrompt,
      temperature: template.temperature,
      reasoningEffort: template.reasoningEffort,
      maxTokens: cfg.llmMaxTokens
    });

    // 6. Validate
    if (!result.content || result.content.trim().length === 0) {
      throw new Error('LLM returned empty content');
    }

    // 7. Latin-only check si enabled
    if (cfg.rejectNonLatin) {
      const bad = findNonLatinCharacter(result.content);
      if (bad) {
        throw new Error(
          `Non-Latin character '${bad.char}' (U+${bad.codePoint.toString(16).toUpperCase()}) detected`
        );
      }
    }

    return {
      content: result.content,
      systemPrompt,
      userPrompt,
      temperature: template.temperature,
      reasoningEffort: template.reasoningEffort,
      model: template.model,
      usage: result.usage
    };

  } finally {
    // 8. Cleanup tmpdir (ALWAYS)
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(err => {
        this.logger.warn(`Failed to cleanup tmpdir ${tmpDir}: ${err.message}`);
      });
    }
  }
}
```

### Download Images

```typescript
private async downloadImages(
  remotePaths: string[],
  tmpDir: string
): Promise<string[]> {
  const localPaths: string[] = [];

  for (const remotePath of remotePaths) {
    // Parse URL (ingestion-telegram media endpoint)
    // Format: /api/media/:channelId/:messageId/:index
    const url = `${this.ingestionUrl}${remotePath}`;

    try {
      const response = await fetch(url);

      if (!response.ok) {
        this.logger.warn(
          `Failed to download media ${remotePath}: ${response.status}`
        );
        continue;
      }

      // Save to tmpdir
      const filename = `image-${localPaths.length}.${this.guessExtension(response)}`;
      const localPath = path.join(tmpDir, filename);

      const buffer = Buffer.from(await response.arrayBuffer());
      await fs.writeFile(localPath, buffer);

      localPaths.push(localPath);

    } catch (err) {
      this.logger.warn(`Failed to download media ${remotePath}: ${err.message}`);
      // Continue with other images
    }
  }

  return localPaths;
}

private guessExtension(response: Response): string {
  const contentType = response.headers.get('content-type');

  if (contentType?.includes('jpeg') || contentType?.includes('jpg')) {
    return 'jpg';
  }
  if (contentType?.includes('png')) {
    return 'png';
  }
  if (contentType?.includes('webp')) {
    return 'webp';
  }
  if (contentType?.includes('gif')) {
    return 'gif';
  }

  return 'bin'; // Fallback
}
```

### Encode Images for Vision

```typescript
private async encodeImagesForVision(paths: string[]): Promise<string> {
  const encoded: string[] = [];

  for (const localPath of paths) {
    try {
      // Read file
      const buffer = await fs.readFile(localPath);

      // Encode to base64
      const base64 = buffer.toString('base64');

      // Detect MIME type (magic bytes)
      const mimeType = this.detectMimeType(buffer);

      // Data URL format
      encoded.push(`data:${mimeType};base64,${base64}`);

    } catch (err) {
      this.logger.warn(`Failed to encode image ${localPath}: ${err.message}`);
      // Continue with other images
    }
  }

  // Join multiple images
  return encoded.join('\n\n');
}

private detectMimeType(buffer: Buffer): string {
  // Magic bytes detection
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return 'image/jpeg';
  }
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return 'image/png';
  }
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return 'image/gif';
  }
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
    return 'image/webp';
  }

  return 'application/octet-stream'; // Fallback
}
```

### Interpolate Template

```typescript
private interpolateTemplate(
  template: string,
  vars: Record<string, string>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return vars[key] !== undefined ? vars[key] : match;
  });
}

// Example:
// template: "Title: {{title}}\n\nContent:\n{{content}}"
// vars: { title: 'Bitcoin News', content: 'BTC at 50k' }
// result: "Title: Bitcoin News\n\nContent:\nBTC at 50k"
```

---

## PromptTemplate Entity

**Ubicación**: `domain/entities/prompt-template.entity.ts`

### Props

```typescript
interface PromptTemplateProps {
  name: string; // Display name (unique)
  description: string | null; // Purpose/notes
  systemPrompt: string; // LLM system context
  userPrompt: string; // Template with {{placeholders}}
  model: string; // Model identifier
  temperature: number; // 0.0 - 1.0
  reasoningEffort: string | null; // 'low'|'medium'|'high' (o1 models only)
  isActive: boolean; // Enable/disable
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
}
```

### Validators

```typescript
function validateName(raw: unknown): string {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    throw new DomainError('name', 'Name must be non-empty string');
  }

  const trimmed = raw.trim();

  if (trimmed.length > 200) {
    throw new DomainError('name', 'Name too long (max 200 chars)');
  }

  return trimmed;
}

function validateSystemPrompt(raw: unknown): string {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    throw new DomainError('systemPrompt', 'System prompt required');
  }

  const trimmed = raw.trim();

  if (trimmed.length > 10_000) {
    throw new DomainError(
      'systemPrompt',
      'System prompt too long (max 10k chars)',
    );
  }

  return trimmed;
}

function validateUserPrompt(raw: unknown): string {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    throw new DomainError('userPrompt', 'User prompt required');
  }

  const trimmed = raw.trim();

  if (trimmed.length > 10_000) {
    throw new DomainError('userPrompt', 'User prompt too long (max 10k chars)');
  }

  // Check for placeholders (at least one required)
  const placeholders = trimmed.match(/\{\{(\w+)\}\}/g);
  if (!placeholders || placeholders.length === 0) {
    throw new DomainError(
      'userPrompt',
      'User prompt must contain at least one placeholder ({{title}}, {{content}}, {{imageAnalysis}})',
    );
  }

  return trimmed;
}

function validateTemperature(raw: unknown): number {
  if (typeof raw !== 'number' || isNaN(raw)) {
    throw new DomainError('temperature', 'Temperature must be a number');
  }

  if (raw < 0 || raw > 1) {
    throw new DomainError('temperature', 'Temperature must be between 0 and 1');
  }

  return raw;
}

function validateReasoningEffort(raw: unknown): string | null {
  if (raw === null || raw === undefined) {
    return null;
  }

  if (typeof raw !== 'string') {
    throw new DomainError(
      'reasoningEffort',
      'Reasoning effort must be string or null',
    );
  }

  const allowed = ['low', 'medium', 'high'];
  if (!allowed.includes(raw)) {
    throw new DomainError(
      'reasoningEffort',
      `Reasoning effort must be one of: ${allowed.join(', ')}`,
    );
  }

  return raw;
}
```

### Factory & Update

```typescript
class PromptTemplate extends Entity<string> {
  static create(input: {
    name: string;
    description?: string;
    systemPrompt: string;
    userPrompt: string;
    model: string;
    temperature: number;
    reasoningEffort?: string;
    createdBy?: string;
  }): PromptTemplate {
    const props: PromptTemplateProps = {
      name: validateName(input.name),
      description: input.description?.trim() || null,
      systemPrompt: validateSystemPrompt(input.systemPrompt),
      userPrompt: validateUserPrompt(input.userPrompt),
      model: validateModel(input.model),
      temperature: validateTemperature(input.temperature),
      reasoningEffort: validateReasoningEffort(input.reasoningEffort),
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: input.createdBy || null,
      updatedBy: null,
    };

    return new PromptTemplate(uuid(), props);
  }

  update(input: {
    name?: string;
    description?: string;
    systemPrompt?: string;
    userPrompt?: string;
    model?: string;
    temperature?: number;
    reasoningEffort?: string;
    isActive?: boolean;
    updatedBy?: string;
  }): void {
    if (input.name !== undefined) {
      this.props.name = validateName(input.name);
    }

    if (input.description !== undefined) {
      this.props.description = input.description?.trim() || null;
    }

    if (input.systemPrompt !== undefined) {
      this.props.systemPrompt = validateSystemPrompt(input.systemPrompt);
    }

    if (input.userPrompt !== undefined) {
      this.props.userPrompt = validateUserPrompt(input.userPrompt);
    }

    if (input.model !== undefined) {
      this.props.model = validateModel(input.model);
    }

    if (input.temperature !== undefined) {
      this.props.temperature = validateTemperature(input.temperature);
    }

    if (input.reasoningEffort !== undefined) {
      this.props.reasoningEffort = validateReasoningEffort(
        input.reasoningEffort,
      );
    }

    if (input.isActive !== undefined) {
      this.props.isActive = input.isActive;
    }

    this.props.updatedAt = new Date();
    this.props.updatedBy = input.updatedBy || null;
  }

  activate(): void {
    this.props.isActive = true;
    this.props.updatedAt = new Date();
  }

  deactivate(): void {
    this.props.isActive = false;
    this.props.updatedAt = new Date();
  }
}
```

### Examples

**Default Template**:

```typescript
{
  name: 'Default Crypto News',
  description: 'Standard formatting for crypto news articles',
  systemPrompt: `You are a professional crypto news editor. Your job is to:
1. Rewrite the provided content in clear, engaging English
2. Maintain factual accuracy
3. Keep the original meaning and key details
4. Remove promotional language
5. Structure with proper paragraphs
6. Keep it concise (200-300 words)

Do not add information not present in the source.`,

  userPrompt: `Title: {{title}}

Content:
{{content}}

Images:
{{imageAnalysis}}

Please rewrite this crypto news article following the guidelines.`,

  model: 'gpt-4o',
  temperature: 0.7,
  reasoningEffort: null
}
```

**Technical Analysis Template**:

```typescript
{
  name: 'Technical Analysis',
  description: 'Deep dive with metrics focus',
  systemPrompt: `You are a crypto analyst specializing in technical analysis.
Focus on:
- Price action and trends
- Volume analysis
- Key support/resistance levels
- Chart patterns
- On-chain metrics if available

Be analytical and data-driven.`,

  userPrompt: `Analyze this crypto news with technical perspective:

{{title}}

{{content}}

Charts/Images:
{{imageAnalysis}}

Provide technical insights.`,

  model: 'o1-preview',
  temperature: 1.0,
  reasoningEffort: 'high'
}
```

---

## LlmConfig Entity

**Ubicación**: `domain/entities/llm-config.entity.ts`

### Props

```typescript
interface LlmConfigProps {
  // Master Switches
  llmEnabled: boolean; // Enable LLM generation
  publishingEnabled: boolean; // Enable publishing (master)

  // Template
  defaultTemplateId: string; // UUID of default template

  // Model Config
  llmMaxTokens: number; // Max output tokens
  llmMaxAttempts: number; // Retry limit per entry

  // Publishing Limits
  dailyCap: number; // Max publishes per day
  dailyResetUtcHour: number; // 0-23 (hour to reset counter)

  // Content Validation
  rejectNonLatin: boolean; // Block non-Latin output

  // Audit
  updatedAt: Date;
  updatedBy: string | null;
}
```

### Singleton Pattern

```typescript
class LlmConfig extends Entity<number> {
  static SINGLETON_ID = 1;

  static async load(repo: LlmConfigRepository): Promise<LlmConfig> {
    const config = await repo.findOne();
    if (!config) {
      throw new Error('LlmConfig not seeded — run migrations');
    }
    return config;
  }

  update(input: Partial<LlmConfigProps>): void {
    // Validate + update props
    // ...
    this.props.updatedAt = new Date();
  }
}
```

### Validators

```typescript
function validateDailyCap(raw: unknown): number {
  const num = requirePositive(raw, 'dailyCap');

  if (num > 1000) {
    throw new DomainError('dailyCap', 'Daily cap too high (max 1000)');
  }

  return num;
}

function validateDailyResetUtcHour(raw: unknown): number {
  const num = requireInteger(raw, 'dailyResetUtcHour');

  if (num < 0 || num > 23) {
    throw new DomainError('dailyResetUtcHour', 'Hour must be 0-23');
  }

  return num;
}

function validateDefaultTemplateId(raw: unknown): string {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    throw new DomainError('defaultTemplateId', 'Template ID required');
  }

  // UUID format check
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(raw.trim())) {
    throw new DomainError('defaultTemplateId', 'Invalid UUID format');
  }

  return raw.trim();
}
```

### Database

```sql
CREATE TABLE crypto_news_publisher_llm_config (
  id                     INTEGER PRIMARY KEY CHECK (id = 1), -- Singleton
  llm_enabled            BOOLEAN NOT NULL DEFAULT true,
  publishing_enabled     BOOLEAN NOT NULL DEFAULT true,
  default_template_id    UUID NOT NULL,
  llm_max_tokens         INTEGER NOT NULL DEFAULT 2000,
  llm_max_attempts       INTEGER NOT NULL DEFAULT 3,
  daily_cap              INTEGER NOT NULL DEFAULT 20,
  daily_reset_utc_hour   INTEGER NOT NULL DEFAULT 0 CHECK (daily_reset_utc_hour >= 0 AND daily_reset_utc_hour <= 23),
  reject_non_latin       BOOLEAN NOT NULL DEFAULT true,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by             VARCHAR,

  CONSTRAINT fk_default_template
    FOREIGN KEY (default_template_id)
    REFERENCES crypto_news_publisher_prompt_templates(id)
);

-- Seed (after creating a default template)
INSERT INTO crypto_news_publisher_llm_config (
  id, llm_enabled, publishing_enabled, default_template_id
) VALUES (
  1, true, false, :default_template_id
);
```

---

## Template Selection

### Priority Logic

```typescript
private async selectTemplate(
  entry: PublisherQueueEntry,
  cfg: LlmConfig
): Promise<PromptTemplate> {
  // 1. Try keyword-specific template (highest priority)
  if (entry.keywordTemplateId) {
    const template = await this.templateRepo.findById(entry.keywordTemplateId);

    if (template && template.isActive) {
      this.logger.log(
        `Using keyword template ${template.name} for entry ${entry.id}`
      );
      return template;
    }

    this.logger.warn(
      `Keyword template ${entry.keywordTemplateId} not found or inactive for entry ${entry.id}`
    );
  }

  // 2. Try default template
  const defaultTemplate = await this.templateRepo.findById(cfg.defaultTemplateId);

  if (defaultTemplate && defaultTemplate.isActive) {
    this.logger.log(
      `Using default template ${defaultTemplate.name} for entry ${entry.id}`
    );
    return defaultTemplate;
  }

  this.logger.warn(
    `Default template ${cfg.defaultTemplateId} not found or inactive`
  );

  // 3. Fallback: first active template
  const templates = await this.templateRepo.listActive();

  if (templates.length === 0) {
    throw new Error('No active templates available');
  }

  const fallback = templates[0];
  this.logger.warn(
    `Using fallback template ${fallback.name} for entry ${entry.id}`
  );

  return fallback;
}
```

### Keyword-Specific Templates

**Use Case**: Diferentes estilos según keyword matched

**Example**:

```typescript
// Keyword: "bitcoin etf"
{
  phrase: 'bitcoin etf',
  type: 'SIMPLE',
  templateId: 'regulatory-news-template-uuid'
}

// PromptTemplate: "Regulatory News"
{
  name: 'Regulatory News',
  systemPrompt: 'Focus on regulatory implications...',
  userPrompt: 'Analyze regulatory aspect of: {{content}}'
}
```

---

## LiteLLM Integration

### Shared LlmPort

```typescript
// shared/llm/domain/ports/llm.port.ts
abstract class LlmPort {
  abstract generate(input: LlmGenerateInput): Promise<LlmGenerateOutput>;
  abstract listModels(): Promise<string[]>;
}

interface LlmGenerateInput {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
  maxTokens?: number;
  reasoningEffort?: string | null;
}

interface LlmGenerateOutput {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}
```

### LlmGatewayAdapter

```typescript
// shared/llm/adapters/llm-gateway.adapter.ts
@Injectable()
export class LlmGatewayAdapter implements LlmPort {
  async generate(input: LlmGenerateInput): Promise<LlmGenerateOutput> {
    const url = `${this.config.liteLlmBaseUrl}/chat/completions`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.liteLlmApiKey}`,
      },
      body: JSON.stringify({
        model: input.model,
        messages: [
          { role: 'system', content: input.systemPrompt },
          { role: 'user', content: input.userPrompt },
        ],
        temperature: input.temperature,
        max_tokens: input.maxTokens,
        ...(input.reasoningEffort && {
          reasoning_effort: input.reasoningEffort,
        }),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`LLM API error ${response.status}: ${error}`);
    }

    const data = await response.json();

    return {
      content: data.choices[0].message.content,
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          }
        : undefined,
    };
  }

  async listModels(): Promise<string[]> {
    const url = `${this.config.liteLlmBaseUrl}/models`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.config.liteLlmApiKey}`,
      },
    });

    const data = await response.json();

    return data.data.map((model: any) => model.id);
  }
}
```

### Module Override

```typescript
// crypto-news-publisher.module.ts
@Module({
  providers: [
    // Override global LlmPort binding for this module
    {
      provide: LlmPort,
      useClass: LlmGatewayAdapter,
    },
    CryptoNewsLlmAdapter,
    // ...
  ],
})
export class CryptoNewsPublisherModule {}
```

---

## Output Validation

### Non-Empty Check

```typescript
if (!result.content || result.content.trim().length === 0) {
  throw new Error('LLM returned empty content');
}
```

### Latin-Only Validation

**Service**: `application/services/latin-script-validator.ts`

```typescript
interface NonLatinMatch {
  char: string;
  codePoint: number;
  index: number;
}

export function findNonLatinCharacter(text: string): NonLatinMatch | null {
  for (let i = 0; i < text.length; i++) {
    const codePoint = text.codePointAt(i);
    if (codePoint === undefined) continue;

    // Skip emoji ranges (common in crypto news)
    if (isEmoji(codePoint)) {
      continue;
    }

    // Check if Latin script
    if (!isLatinScript(codePoint)) {
      return {
        char: text[i],
        codePoint,
        index: i,
      };
    }
  }

  return null;
}

function isLatinScript(codePoint: number): boolean {
  // Basic Latin (ASCII)
  if (codePoint >= 0x0000 && codePoint <= 0x007f) return true;

  // Latin-1 Supplement
  if (codePoint >= 0x0080 && codePoint <= 0x00ff) return true;

  // Latin Extended-A
  if (codePoint >= 0x0100 && codePoint <= 0x017f) return true;

  // Latin Extended-B
  if (codePoint >= 0x0180 && codePoint <= 0x024f) return true;

  // Common punctuation
  if (codePoint >= 0x2000 && codePoint <= 0x206f) return true;

  return false;
}

function isEmoji(codePoint: number): boolean {
  // Emoji ranges (simplified)
  return (
    (codePoint >= 0x1f300 && codePoint <= 0x1f9ff) || // Misc symbols
    (codePoint >= 0x2600 && codePoint <= 0x26ff) || // Misc symbols
    (codePoint >= 0x2700 && codePoint <= 0x27bf) // Dingbats
  );
}
```

**Usage**:

```typescript
const cfg = await this.llmConfigRepo.load();

if (cfg.rejectNonLatin) {
  const bad = findNonLatinCharacter(llmOutput);

  if (bad) {
    const hex = bad.codePoint.toString(16).toUpperCase().padStart(4, '0');
    throw new Error(
      `Non-Latin character '${bad.char}' (U+${hex}) at index ${bad.index}`,
    );
  }
}
```

---

## Preview Tool

### Use Case

**Purpose**: Test templates sin publicar

```typescript
// application/handlers/preview-prompt.use-case.ts
@Injectable()
export class PreviewPromptUseCase {
  async execute(input: {
    templateId: string;
    content: string;
    title?: string;
    imageUrls?: string[];
  }): Promise<PreviewResult>;
}

interface PreviewResult {
  generatedContent: string;
  systemPrompt: string;
  userPrompt: string;
  model: string;
  temperature: number;
  reasoningEffort: string | null;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}
```

### Implementation

```typescript
async execute(input: PreviewPromptInput): Promise<PreviewResult> {
  // 1. Load template
  const template = await this.templateRepo.findById(input.templateId);

  if (!template) {
    throw new Error(`Template ${input.templateId} not found`);
  }

  if (!template.isActive) {
    throw new Error(`Template ${template.name} is inactive`);
  }

  // 2. Handle images (optional)
  let imageAnalysis: string | null = null;

  if (input.imageUrls && input.imageUrls.length > 0) {
    const tmpDir = path.join(os.tmpdir(), `preview-${uuid()}`);
    await fs.mkdir(tmpDir, { recursive: true });

    try {
      const localPaths = await this.downloadImages(input.imageUrls, tmpDir);
      imageAnalysis = await this.encodeImagesForVision(localPaths);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  }

  // 3. Interpolate prompts
  const userPrompt = this.interpolateTemplate(template.userPrompt, {
    title: input.title || '(Sin título)',
    content: input.content,
    imageAnalysis: imageAnalysis || '(Sin imágenes)'
  });

  // 4. Call LLM
  const result = await this.llmPort.generate({
    model: template.model,
    systemPrompt: template.systemPrompt,
    userPrompt,
    temperature: template.temperature,
    reasoningEffort: template.reasoningEffort,
    maxTokens: 2000
  });

  // 5. Return preview (NO save to queue)
  return {
    generatedContent: result.content,
    systemPrompt: template.systemPrompt,
    userPrompt,
    model: template.model,
    temperature: template.temperature,
    reasoningEffort: template.reasoningEffort,
    usage: result.usage || {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0
    }
  };
}
```

---

## APIs

### Templates CRUD

```http
GET /crypto-news-publisher/llm/templates
Response: {
  templates: PromptTemplateDto[];
}

POST /crypto-news-publisher/llm/templates
Body: {
  name: string;
  description?: string;
  systemPrompt: string;
  userPrompt: string;
  model: string;
  temperature: number;
  reasoningEffort?: 'low'|'medium'|'high';
}
Response: { id: string }

GET /crypto-news-publisher/llm/templates/:id
PATCH /crypto-news-publisher/llm/templates/:id
DELETE /crypto-news-publisher/llm/templates/:id
```

### LLM Config

```http
GET /crypto-news-publisher/llm/config
Response: LlmConfigDto

PATCH /crypto-news-publisher/llm/config
Body: {
  llmEnabled?: boolean;
  publishingEnabled?: boolean;
  defaultTemplateId?: string;
  llmMaxTokens?: number;
  llmMaxAttempts?: number;
  dailyCap?: number;
  dailyResetUtcHour?: number;
  rejectNonLatin?: boolean;
}
Response: { success: true }

# Production Guard (backend enforces)
PATCH /crypto-news-publisher/llm/config (NODE_ENV=production)
Body: { llmEnabled: false }
Response: 400 {
  error: "llmEnabled cannot be changed in production (always enabled for quality)",
  hint: "Use matchingEnabled or publishingEnabled to control pipeline"
}
```

### Preview

```http
POST /crypto-news-publisher/llm/preview
Body: {
  templateId: string;
  content: string;
  title?: string;
  imageUrls?: string[];
}
Response: PreviewResult
```

### List Models

```http
GET /crypto-news-publisher/llm/models
Response: {
  models: string[];  // ['gpt-4o', 'claude-3-opus', ...]
}
```

---

**Navegación**: [← 03-queue.md](./03-queue.md) | [05-publishing.md →](./05-publishing.md)
