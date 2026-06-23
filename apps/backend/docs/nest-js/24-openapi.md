# OpenAPI (Swagger)

## Installation

```bash
npm install --save @nestjs/swagger
```

## Bootstrap

```typescript
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const config = new DocumentBuilder()
    .setTitle('Cats example')
    .setDescription('The cats API description')
    .setVersion('1.0')
    .addTag('cats')
    .build();

  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, documentFactory);

  await app.listen(3000);
}
bootstrap();
```

Navigate to `http://localhost:3000/api` to see Swagger UI. JSON spec at `http://localhost:3000/api-json`.

## DocumentBuilder Options

```typescript
const config = new DocumentBuilder()
  .setTitle('API')
  .setDescription('Description')
  .setVersion('1.0')
  .addTag('cats')
  .addBearerAuth()                    // JWT Bearer auth
  .addApiKey({ type: 'apiKey' }, 'api-key')
  .addGlobalResponse({ status: 500, description: 'Internal server error' })
  .build();
```

## Document Options

```typescript
const options: SwaggerDocumentOptions = {
  include: [CatsModule],             // only these modules
  extraModels: [ExtraModel],         // additional models
  ignoreGlobalPrefix: false,
  deepScanRoutes: false,
  operationIdFactory: (controllerKey: string, methodKey: string) => methodKey,
  autoTagControllers: true,
};
SwaggerModule.createDocument(app, config, options);
```

## Setup Options

```typescript
SwaggerModule.setup('api', app, documentFactory, {
  ui: true,                          // enable Swagger UI
  raw: ['json', 'yaml'],             // serve JSON/YAML definitions
  jsonDocumentUrl: 'swagger/json',
  yamlDocumentUrl: 'swagger/yaml',
  explorer: true,                    // show definitions selector
  customSiteTitle: 'My API Docs',
  swaggerOptions: { persistAuthorization: true },
});
```

## Decorators

### Tags

```typescript
import { ApiTags } from '@nestjs/swagger';

@ApiTags('cats')
@Controller('cats')
export class CatsController {}
```

### Headers

```typescript
@ApiHeader({ name: 'X-MyHeader', description: 'Custom header' })
@Controller('cats')
export class CatsController {}
```

### Responses

```typescript
@Post()
@ApiCreatedResponse({ description: 'Created successfully', type: Cat })
@ApiForbiddenResponse({ description: 'Forbidden' })
@ApiResponse({ status: 429, description: 'Too many requests' })
async create(@Body() dto: CreateCatDto) {}
```

Short-hand response decorators:

| Decorator | Status |
|-----------|--------|
| `@ApiOkResponse()` | 200 |
| `@ApiCreatedResponse()` | 201 |
| `@ApiAcceptedResponse()` | 202 |
| `@ApiNoContentResponse()` | 204 |
| `@ApiBadRequestResponse()` | 400 |
| `@ApiUnauthorizedResponse()` | 401 |
| `@ApiNotFoundResponse()` | 404 |
| `@ApiForbiddenResponse()` | 403 |
| `@ApiConflictResponse()` | 409 |
| `@ApiInternalServerErrorResponse()` | 500 |

### Queries, Params, Body

```typescript
@Get()
async findAll(
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @Query('limit') limit: number,
) {}

@Get(':id')
async findOne(@Param('id') id: string) {}

@ApiBody({ type: CreateCatDto })
@Post()
async create(@Body() createCatDto: CreateCatDto) {}
```

### File Upload

```typescript
@Post('upload')
@ApiConsumes('multipart/form-data')
@ApiBody({ description: 'File', type: FileUploadDto })
@UseInterceptors(FileInterceptor('file'))
uploadFile(@UploadedFile() file: Express.Multer.File) {}

class FileUploadDto {
  @ApiProperty({ type: 'string', format: 'binary' })
  file: any;
}
```

## ApiProperty (Model Decorators)

```typescript
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCatDto {
  @ApiProperty({ description: 'The name', example: 'Fluffy' })
  name: string;

  @ApiPropertyOptional({ default: 1 })
  age: number;

  @ApiProperty({ enum: ['Persian', 'Tabby', 'Siamese'], enumName: 'CatBreed' })
  breed: string;

  @ApiProperty({ type: [String] })
  tags: string[];
}
```

### Circular dependencies

```typescript
@ApiProperty({ type: () => Node })
node: Node;
```

### Raw definitions

```typescript
@ApiProperty({
  type: 'array',
  items: { type: 'array', items: { type: 'number' } },
})
coords: number[][];
```

### oneOf / anyOf / allOf

```typescript
@ApiProperty({
  oneOf: [
    { $ref: getSchemaPath(Cat) },
    { $ref: getSchemaPath(Dog) },
  ],
})
pet: Cat | Dog;
```

### Schema naming

```typescript
@ApiSchema({ name: 'CreateCatRequest', description: 'Request body for creating a cat' })
class CreateCatDto {}
```

## Extra Models

```typescript
@ApiExtraModels(PaginatedDto)
@Controller('cats')
export class CatsController {
  @Get()
  @ApiOkResponse({
    schema: {
      allOf: [
        { $ref: getSchemaPath(PaginatedDto) },
        { properties: { results: { type: 'array', items: { $ref: getSchemaPath(CatDto) } } } },
      ],
    },
  })
  async findAll() {}
}
```

## Use Plugin (Auto-generate decorators)

In `nest-cli.json`:

```json
{
  "compilerOptions": {
    "plugins": ["@nestjs/swagger"]
  }
}
```

The plugin automatically adds `@ApiProperty()` to DTOs, detects arrays, and handles circular dependencies.

> Auto-generates `@ApiProperty()` for standard model properties, `@ApiQuery()` for query params, etc.
