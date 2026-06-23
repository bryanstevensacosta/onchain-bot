# Database

Nest is database agnostic. Supports TypeORM, Sequelize, Prisma, MikroORM, Mongoose, and more.

---

## TypeORM (SQL)

## Installation

```bash
npm install --save @nestjs/typeorm typeorm mysql2
# For PostgreSQL: npm install --save pg
# For SQLite: npm install --save sqlite3
```

## Setup

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './users/user.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: 'localhost',
      port: 3306,
      username: 'root',
      password: 'root',
      database: 'test',
      entities: [User],
      synchronize: true,       // auto-create tables (dev only)
    }),
  ],
})
export class AppModule {}
```

> ⚠️ `synchronize: true` not for production — use migrations.

### Additional Options

| Option | Description | Default |
|--------|-------------|---------|
| `retryAttempts` | DB connection retries | 10 |
| `retryDelay` | Delay between retries (ms) | 3000 |
| `autoLoadEntities` | Auto-load entities from `forFeature()` | false |

## Auto-load Entities

```typescript
TypeOrmModule.forRoot({
  ...
  autoLoadEntities: true,
});
```

Every entity registered via `forFeature()` is automatically added.

## Entity

```typescript
import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ default: true })
  isActive: boolean;
}
```

## Feature Module

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './user.entity';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [UsersService],
  controllers: [UsersController],
})
export class UsersModule {}
```

## Repository Injection

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  findAll(): Promise<User[]> {
    return this.usersRepository.find();
  }

  findOne(id: number): Promise<User | null> {
    return this.usersRepository.findOneBy({ id });
  }

  async remove(id: number): Promise<void> {
    await this.usersRepository.delete(id);
  }
}
```

## Relations

```typescript
import { Entity, Column, PrimaryGeneratedColumn, OneToMany, ManyToOne, ManyToMany, JoinTable } from 'typeorm';

@Entity()
export class User {
  @OneToMany(() => Photo, photo => photo.user)
  photos: Photo[];

  @ManyToMany(() => Category)
  @JoinTable()
  categories: Category[];
}

@Entity()
export class Photo {
  @ManyToOne(() => User, user => user.photos)
  user: User;
}
```

## Transactions

### QueryRunner (full control)

```typescript
import { DataSource } from 'typeorm';

@Injectable()
export class UsersService {
  constructor(private dataSource: DataSource) {}

  async createMany(users: User[]) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await queryRunner.manager.save(users[0]);
      await queryRunner.manager.save(users[1]);
      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
    } finally {
      await queryRunner.release();
    }
  }
}
```

### Callback-style

```typescript
async createMany(users: User[]) {
  await this.dataSource.transaction(async manager => {
    await manager.save(users[0]);
    await manager.save(users[1]);
  });
}
```

## Multiple Databases

```typescript
@Module({
  imports: [
    TypeOrmModule.forRoot({ ... }),                                           // default
    TypeOrmModule.forRoot({ ... name: 'albumsConnection', host: '...' }),     // named
  ],
})
export class AppModule {}

// Per-feature:
@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    TypeOrmModule.forFeature([Album], 'albumsConnection'),
  ],
})
export class AlbumsModule {}
```

Inject named data source:

```typescript
@InjectDataSource('albumsConnection') private dataSource: DataSource;
@InjectEntityManager('albumsConnection') private entityManager: EntityManager;
@InjectRepository(Album, 'albumsConnection') private repo: Repository<Album>;
```

## Async Configuration

```typescript
TypeOrmModule.forRootAsync({
  imports: [ConfigModule],
  useFactory: async (configService: ConfigService) => ({
    type: 'mysql',
    host: configService.get('DB_HOST'),
    port: configService.get('DB_PORT'),
    username: configService.get('DB_USER'),
    password: configService.get('DB_PASS'),
    database: configService.get('DB_NAME'),
    entities: [],
    synchronize: true,
  }),
  inject: [ConfigService],
});
```

## Testing

```typescript
@Module({
  providers: [
    UsersService,
    { provide: getRepositoryToken(User), useValue: mockRepository },
  ],
})
export class UsersModule {}
```

---

## MongoDB (Mongoose)

## Installation

```bash
npm i @nestjs/mongoose mongoose
```

## Setup

```typescript
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  imports: [MongooseModule.forRoot('mongodb://localhost/nest')],
})
export class AppModule {}
```

## Schema

```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CatDocument = HydratedDocument<Cat>;

@Schema()
export class Cat {
  @Prop()
  name: string;

  @Prop({ required: true })
  age: number;

  @Prop([String])
  tags: string[];
}

export const CatSchema = SchemaFactory.createForClass(Cat);
```

### References to other models

```typescript
import * as mongoose from 'mongoose';
import { Owner } from '../owners/schemas/owner.schema';

@Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Owner' })
owner: Owner;

// Array of references:
@Prop({ type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Owner' }] })
owners: Owner[];
```

### Subdocuments

```typescript
@Schema()
class Name {
  @Prop() firstName: string;
  @Prop() lastName: string;
}

@Schema()
class Person {
  @Prop(NameSchema)                 // single subdocument
  name: Name;

  @Prop([NameSchema])               // array of subdocuments
  names: Name[];
}
```

### Virtuals

```typescript
import { Virtual } from '@nestjs/mongoose';

@Schema()
class Person {
  @Prop() firstName: string;
  @Prop() lastName: string;

  @Virtual({
    get: function (this: Person) { return `${this.firstName} ${this.lastName}`; },
  })
  fullName: string;
}
```

## Feature Module

```typescript
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Cat, CatSchema } from './schemas/cat.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: Cat.name, schema: CatSchema }])],
  providers: [CatsService],
  controllers: [CatsController],
})
export class CatsModule {}
```

## Model Injection

```typescript
import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';

@Injectable()
export class CatsService {
  constructor(@InjectModel(Cat.name) private catModel: Model<Cat>) {}

  async create(dto: CreateCatDto): Promise<Cat> {
    const createdCat = new this.catModel(dto);
    return createdCat.save();
  }

  async findAll(): Promise<Cat[]> {
    return this.catModel.find().exec();
  }
}
```

## Connection Injection

```typescript
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

@Injectable()
export class CatsService {
  constructor(@InjectConnection() private connection: Connection) {}

  async startTransaction() {
    const session = await this.connection.startSession();
    session.startTransaction();
    // ...
  }
}
```

## Hooks (Middleware)

```typescript
@Module({
  imports: [
    MongooseModule.forFeatureAsync([
      {
        name: Cat.name,
        useFactory: () => {
          const schema = CatSchema;
          schema.pre('save', function () {
            console.log('Hello from pre save');
          });
          return schema;
        },
      },
    ]),
  ],
})
export class AppModule {}
```

## Plugins (Global)

```typescript
MongooseModule.forRoot('mongodb://localhost/test', {
  connectionFactory: (connection) => {
    connection.plugin(require('mongoose-autopopulate'));
    return connection;
  },
});
```

## Multiple Databases

```typescript
@Module({
  imports: [
    MongooseModule.forRoot('mongodb://localhost/test', { connectionName: 'cats' }),
    MongooseModule.forRoot('mongodb://localhost/users', { connectionName: 'users' }),
  ],
})
export class AppModule {}

// Per-feature with connection name:
MongooseModule.forFeature([{ name: Cat.name, schema: CatSchema }], 'cats')

// Inject named connection:
@InjectConnection('cats') private connection: Connection
@InjectModel(Cat.name, 'cats') private catModel: Model<Cat>
```

## Testing

```typescript
@Module({
  providers: [
    CatsService,
    { provide: getModelToken(Cat.name), useValue: mockModel },
  ],
})
export class CatsModule {}
```

## Async Configuration

```typescript
MongooseModule.forRootAsync({
  imports: [ConfigModule],
  useFactory: async (configService: ConfigService) => ({
    uri: configService.get<string>('MONGODB_URI'),
  }),
  inject: [ConfigService],
});
```

## Discriminators (Schema Inheritance)

```typescript
@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Event.name,
        schema: EventSchema,
        discriminators: [
          { name: ClickedLinkEvent.name, schema: ClickedLinkEventSchema },
          { name: SignUpEvent.name, schema: SignUpEventSchema },
        ],
      },
    ]),
  ],
})
export class EventsModule {}
```
