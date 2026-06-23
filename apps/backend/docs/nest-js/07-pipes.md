# Pipes

Pipes operate on arguments before they reach the route handler. Two use cases:

- **Transformation**: convert input (e.g., string → integer)
- **Validation**: evaluate input, throw if invalid

## Built-in Pipes

| Pipe | Purpose |
|------|---------|
| `ValidationPipe` | Validate objects against DTO decorators |
| `ParseIntPipe` | String → integer |
| `ParseFloatPipe` | String → float |
| `ParseBoolPipe` | String → boolean |
| `ParseArrayPipe` | String → array |
| `ParseUUIDPipe` | Validate UUID (v3/4/5) |
| `ParseEnumPipe` | Validate enum values |
| `DefaultValuePipe` | Default if missing |
| `ParseFilePipe` | Validate uploaded files |
| `ParseDatePipe` | String → Date |

## Binding Built-in Pipes

```typescript
@Get(':id')
async findOne(@Param('id', ParseIntPipe) id: number) { ... }
```

Custom options via instance:

```typescript
@Get(':id')
async findOne(
  @Param('id', new ParseIntPipe({ errorHttpStatusCode: HttpStatus.NOT_ACCEPTABLE }))
  id: number,
) { ... }
```

```typescript
@Get(':uuid')
async findOne(@Param('uuid', new ParseUUIDPipe()) uuid: string) { ... }
```

## Custom Pipes

Implement `PipeTransform`:

```typescript
import { PipeTransform, Injectable, ArgumentMetadata, BadRequestException } from '@nestjs/common';

@Injectable()
export class ParseIntPipe implements PipeTransform<string, number> {
  transform(value: string, metadata: ArgumentMetadata): number {
    const val = parseInt(value, 10);
    if (isNaN(val)) {
      throw new BadRequestException('Validation failed');
    }
    return val;
  }
}
```

### ArgumentMetadata

```typescript
export interface ArgumentMetadata {
  type: 'body' | 'query' | 'param' | 'custom';
  metatype?: Type<unknown>;
  data?: string;
}
```

## Schema-based Validation (Zod)

```bash
npm install --save zod
```

```typescript
import { PipeTransform, ArgumentMetadata, BadRequestException } from '@nestjs/common';
import { ZodSchema } from 'zod';

export class ZodValidationPipe implements PipeTransform {
  constructor(private schema: ZodSchema) {}

  transform(value: unknown, metadata: ArgumentMetadata) {
    try {
      return this.schema.parse(value);
    } catch (error) {
      throw new BadRequestException('Validation failed');
    }
  }
}
```

Usage:

```typescript
const createCatSchema = z.object({
  name: z.string(),
  age: z.number(),
  breed: z.string(),
}).required();

@Post()
@UsePipes(new ZodValidationPipe(createCatSchema))
async create(@Body() createCatDto: CreateCatDto) { ... }
```

## Class Validator (Recommended)

```bash
npm i --save class-validator class-transformer
```

```typescript
import { IsString, IsInt } from 'class-validator';

export class CreateCatDto {
  @IsString()
  name: string;

  @IsInt()
  age: number;

  @IsString()
  breed: string;
}
```

```typescript
import { PipeTransform, Injectable, ArgumentMetadata, BadRequestException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class ValidationPipe implements PipeTransform<any> {
  async transform(value: any, { metatype }: ArgumentMetadata) {
    if (!metatype || !this.toValidate(metatype)) return value;
    const object = plainToInstance(metatype, value);
    const errors = await validate(object);
    if (errors.length > 0) throw new BadRequestException('Validation failed');
    return value;
  }

  private toValidate(metatype: Function): boolean {
    const types: Function[] = [String, Boolean, Number, Array, Object];
    return !types.includes(metatype);
  }
}
```

> Nest's built-in `ValidationPipe` is already available and more feature-rich.

## Binding Validation Pipes

### Parameter-scoped
```typescript
@Post()
async create(@Body(new ValidationPipe()) createCatDto: CreateCatDto) { ... }
```

### Method-scoped
```typescript
@Post()
@UsePipes(new ZodValidationPipe(createCatSchema))
async create(@Body() createCatDto: CreateCatDto) { ... }
```

### Global-scoped
```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe());
}
```

### Global-scoped with DI
```typescript
@Module({
  providers: [{ provide: APP_PIPE, useClass: ValidationPipe }],
})
export class AppModule {}
```

## Default Values

```typescript
@Get()
async findAll(
  @Query('activeOnly', new DefaultValuePipe(false), ParseBoolPipe) activeOnly: boolean,
  @Query('page', new DefaultValuePipe(0), ParseIntPipe) page: number,
) { ... }
```
