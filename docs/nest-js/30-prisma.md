# Prisma ORM

## Installation

```bash
npm install prisma --save-dev
npm install @prisma/client
npx prisma init
```

Creates:
- `prisma/schema.prisma` — database schema
- `.env` — database credentials

## Schema

```groovy
generator client {
  provider      = "prisma-client"
  output        = "../src/generated/prisma"
  moduleFormat  = "cjs"
}

datasource db {
  provider = "sqlite"   // or postgresql, mysql, sqlserver, mongodb
  url      = env("DATABASE_URL")
}

model User {
  id    Int     @id @default(autoincrement())
  email String  @unique
  name  String?
  posts Post[]
}

model Post {
  id        Int     @id @default(autoincrement())
  title     String
  content   String?
  published Boolean @default(false)
  author    User?   @relation(fields: [authorId], references: [id])
  authorId  Int?
}
```

## Migrations

```bash
npx prisma migrate dev --name init
```

This generates SQL migration files and runs them against the database.

## Generate Client

```bash
npx prisma generate
```

## PrismaService

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaClient } from './generated/prisma/client';

@Injectable()
export class PrismaService extends PrismaClient {
  constructor() {
    super();
  }
}
```

## Using in Services

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { User, Prisma } from 'generated/prisma';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async user(where: Prisma.UserWhereUniqueInput): Promise<User | null> {
    return this.prisma.user.findUnique({ where });
  }

  async users(params: {
    skip?: number; take?: number;
    cursor?: Prisma.UserWhereUniqueInput;
    where?: Prisma.UserWhereInput;
    orderBy?: Prisma.UserOrderByWithRelationInput;
  }): Promise<User[]> {
    return this.prisma.user.findMany(params);
  }

  async createUser(data: Prisma.UserCreateInput): Promise<User> {
    return this.prisma.user.create({ data });
  }

  async updateUser(params: {
    where: Prisma.UserWhereUniqueInput;
    data: Prisma.UserUpdateInput;
  }): Promise<User> {
    return this.prisma.user.update(params);
  }

  async deleteUser(where: Prisma.UserWhereUniqueInput): Promise<User> {
    return this.prisma.user.delete({ where });
  }
}
```

## Full CRUD Example

```typescript
@Controller()
export class AppController {
  constructor(
    private readonly userService: UsersService,
    private readonly postService: PostsService,
  ) {}

  @Get('post/:id')
  async getPostById(@Param('id') id: string) {
    return this.postService.post({ id: Number(id) });
  }

  @Get('feed')
  async getPublishedPosts() {
    return this.postService.posts({ where: { published: true } });
  }

  @Post('user')
  async signupUser(@Body() userData: { name?: string; email: string }) {
    return this.userService.createUser(userData);
  }

  @Post('post')
  async createDraft(@Body() postData: { title: string; content?: string; authorEmail: string }) {
    return this.postService.createPost({
      title: postData.title,
      content: postData.content,
      author: { connect: { email: postData.authorEmail } },
    });
  }

  @Put('publish/:id')
  async publishPost(@Param('id') id: string) {
    return this.postService.updatePost({
      where: { id: Number(id) },
      data: { published: true },
    });
  }

  @Delete('post/:id')
  async deletePost(@Param('id') id: string) {
    return this.postService.deletePost({ id: Number(id) });
  }
}
```

## Relations (Prisma Client)

```typescript
// Include relations
const user = await prisma.user.findUnique({
  where: { id: 1 },
  include: { posts: true },
});

// Nested create
const post = await prisma.post.create({
  data: {
    title: 'My Post',
    author: { connect: { email: 'user@test.com' } },
  },
});
```
