# Serialization (ClassSerializerInterceptor)

Uses `class-transformer` to transform objects before returning responses.

## Installation

```bash
npm i class-transformer class-validator
```

## Basic Usage

```typescript
import { Controller, Get, UseInterceptors, ClassSerializerInterceptor } from '@nestjs/common';
import { Exclude } from 'class-transformer';

export class UserEntity {
  id: number;
  firstName: string;
  lastName: string;

  @Exclude()
  password: string;

  constructor(partial: Partial<UserEntity>) {
    Object.assign(this, partial);
  }
}

@Controller()
@UseInterceptors(ClassSerializerInterceptor)
export class AppController {
  @Get()
  findOne(): UserEntity {
    return new UserEntity({
      id: 1,
      firstName: 'John',
      lastName: 'Doe',
      password: 'secret',
    });
  }
}
```

Response excludes `password`:

```json
{ "id": 1, "firstName": "John", "lastName": "Doe" }
```

> Must return class instances (not plain objects) for serialization to work.

## Expose Properties

```typescript
import { Expose } from 'class-transformer';

export class UserEntity {
  @Expose()
  get fullName(): string {
    return `${this.firstName} ${this.lastName}`;
  }
}
```

## Transform

```typescript
import { Transform } from 'class-transformer';

@Transform(({ value }) => value.name)
role: RoleEntity;
```

## Serialize Options

```typescript
import { SerializeOptions } from '@nestjs/common';

@SerializeOptions({ excludePrefixes: ['_'] })
@Get()
findOne(): UserEntity {
  return new UserEntity();
}
```

## Transform Plain Objects

Force plain objects to be transformed into class instances:

```typescript
@UseInterceptors(ClassSerializerInterceptor)
@SerializeOptions({ type: UserEntity })
@Get()
findOne(@Query() { id }: { id: number }): UserEntity {
  return { id: 1, firstName: 'John', lastName: 'Doe', password: 'secret' };
}
```

## WebSockets & Microservices

`ClassSerializerInterceptor` works the same for WebSockets and Microservices.
