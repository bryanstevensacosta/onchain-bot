# GraphQL (@nestjs/graphql)

Nest supports both **code first** (decorators + TS classes) and **schema first** (SDL files) approaches.

## Installation

```bash
npm i @nestjs/graphql @nestjs/apollo @apollo/server graphql
```

## Code First Approach

```typescript
import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { join } from 'node:path';

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
    }),
  ],
})
export class AppModule {}
```

- `autoSchemaFile: true` → generates schema in memory
- `autoSchemaFile: 'src/schema.gql'` → writes to file
- `sortSchema: true` → sorts schema lexicographically

### Object Types

```typescript
import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class Cat {
  @Field(type => Int)
  id: number;

  @Field({ nullable: true })
  name?: string;

  @Field(type => [String])
  tags: string[];
}
```

### Resolvers (Code First)

```typescript
import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';

@Resolver(of => Cat)
export class CatsResolver {
  constructor(private catsService: CatsService) {}

  @Query(returns => Cat)
  async cat(@Args('id', { type: () => Int }) id: number) {
    return this.catsService.findOne(id);
  }

  @Query(returns => [Cat])
  async cats() {
    return this.catsService.findAll();
  }

  @Mutation(returns => Cat)
  async createCat(@Args('name') name: string) {
    return this.catsService.create({ name });
  }
}
```

### Input Types

```typescript
import { InputType, Field } from '@nestjs/graphql';

@InputType()
export class CreateCatInput {
  @Field()
  name: string;

  @Field({ nullable: true })
  breed?: string;
}
```

## Schema First Approach

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  typePaths: ['./**/*.graphql'],
  definitions: {
    path: join(process.cwd(), 'src/graphql.ts'),
    outputAs: 'class',
  },
});
```

Create an SDL file, e.g. `src/cats/cats.graphql`:

```graphql
type Cat {
  id: Int!
  name: String!
  breed: String
}

type Query {
  cats: [Cat!]!
  cat(id: Int!): Cat
}

type Mutation {
  createCat(name: String!, breed: String): Cat!
}
```

### Generate Typings Script

```typescript
import { GraphQLDefinitionsFactory } from '@nestjs/graphql';
import { join } from 'node:path';

const definitionsFactory = new GraphQLDefinitionsFactory();
definitionsFactory.generate({
  typePaths: ['./src/**/*.graphql'],
  path: join(process.cwd(), 'src/graphql.ts'),
  outputAs: 'class',
  watch: true,
});
```

## Async Configuration

```typescript
GraphQLModule.forRootAsync<ApolloDriverConfig>({
  driver: ApolloDriver,
  imports: [ConfigModule],
  useFactory: async (configService: ConfigService) => ({
    autoSchemaFile: true,
    playground: configService.get('GRAPHQL_PLAYGROUND'),
  }),
  inject: [ConfigService],
});
```

## Apollo Sandbox

```typescript
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';

GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  playground: false,
  graphiql: true,
  plugins: [ApolloServerPluginLandingPageLocalDefault()],
});
```

## Multiple Endpoints

```typescript
GraphQLModule.forRoot({
  include: [CatsModule], // only scan resolvers in CatsModule
});
```

## Access Generated Schema

```typescript
import { GraphQLSchemaHost } from '@nestjs/graphql';

const { schema } = app.get(GraphQLSchemaHost);
```

## Guards & Interceptors

Guards and interceptors work the same as HTTP:

```typescript
@Resolver()
@UseGuards(AuthGuard)
export class CatsResolver {
  // all methods protected
}
```
