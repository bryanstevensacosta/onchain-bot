# File Upload (Multer)

## Installation

```bash
npm i -D @types/multer
```

## Single File

```typescript
import { Post, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

@Post('upload')
@UseInterceptors(FileInterceptor('file'))
uploadFile(@UploadedFile() file: Express.Multer.File) {
  console.log(file);
}
```

## File Validation

### Built-in Validators

```typescript
import { ParseFilePipe, MaxFileSizeValidator, FileTypeValidator } from '@nestjs/common';

@Post('upload')
@UseInterceptors(FileInterceptor('file'))
uploadFile(
  @UploadedFile(
    new ParseFilePipe({
      validators: [
        new MaxFileSizeValidator({ maxSize: 1000 }),       // 1KB
        new FileTypeValidator({ fileType: 'image/jpeg' }),  // MIME type
      ],
    }),
  )
  file: Express.Multer.File,
) {}
```

### ParseFilePipeBuilder

```typescript
import { ParseFilePipeBuilder, HttpStatus } from '@nestjs/common';

@UploadedFile(
  new ParseFilePipeBuilder()
    .addFileTypeValidator({ fileType: 'jpeg' })
    .addMaxSizeValidator({ maxSize: 1000 })
    .build({
      errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      fileIsRequired: true,
    }),
)
file: Express.Multer.File;
```

## Multiple Files (Array)

```typescript
import { FilesInterceptor } from '@nestjs/platform-express';

@Post('upload')
@UseInterceptors(FilesInterceptor('files', 10)) // max 10 files
uploadFiles(@UploadedFiles() files: Array<Express.Multer.File>) {}
```

## Multiple Fields

```typescript
import { FileFieldsInterceptor } from '@nestjs/platform-express';

@Post('upload')
@UseInterceptors(FileFieldsInterceptor([
  { name: 'avatar', maxCount: 1 },
  { name: 'background', maxCount: 1 },
]))
uploadFiles(
  @UploadedFiles() files: {
    avatar?: Express.Multer.File[];
    background?: Express.Multer.File[];
  },
) {}
```

## Any Files

```typescript
import { AnyFilesInterceptor } from '@nestjs/platform-express';

@Post('upload')
@UseInterceptors(AnyFilesInterceptor())
uploadFiles(@UploadedFiles() files: Array<Express.Multer.File>) {}
```

## No Files (multipart/form-data without files)

```typescript
import { NoFilesInterceptor } from '@nestjs/platform-express';

@Post('upload')
@UseInterceptors(NoFilesInterceptor())
handleMultiPartData(@Body() body: any) {
  console.log(body);
}
```

## Global Default Options

```typescript
import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';

@Module({
  imports: [
    MulterModule.register({
      dest: './upload',
      limits: { fileSize: 1024 * 1024 }, // 1MB
    }),
  ],
})
export class AppModule {}
```

## Async Configuration

```typescript
MulterModule.registerAsync({
  imports: [ConfigModule],
  useFactory: async (config: ConfigService) => ({
    dest: config.get('UPLOAD_DIR'),
  }),
  inject: [ConfigService],
});
```
