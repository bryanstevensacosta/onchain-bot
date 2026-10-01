import { Body, Controller, Get, Post } from '@nestjs/common';
import { IsArray, IsOptional, IsString, Length } from 'class-validator';
import { RequireScope } from 'auth/application/require-scope.decorator';
import { EmbeddingsService } from '@/embeddings/application/embeddings.service';
import { cosineSimilarity } from '@/embeddings/domain/cosine';

class EmbedDto {
  @IsString()
  @Length(1, 8000)
  public text!: string;

  @IsOptional()
  @IsString()
  public model?: string;
}

class EmbedBatchDto {
  @IsArray()
  @IsString({ each: true })
  public texts!: Array<string>;

  @IsOptional()
  @IsString()
  public model?: string;
}

class SimilarityDto {
  @IsString()
  @Length(1, 8000)
  public a!: string;

  @IsString()
  @Length(1, 8000)
  public b!: string;

  @IsOptional()
  @IsString()
  public model?: string;
}

/**
 * Embeddings HTTP surface (ai-ml, todo 2 — dedup + search):
 * - POST /api/embeddings/embed (generate): single vector.
 * - POST /api/embeddings/batch (generate): up to 100 vectors.
 * - POST /api/embeddings/similarity (generate): cosine(embed(a),
 *   embed(b)) for dedup thresholds + search ranking.
 * - GET /api/embeddings/models (read): providers + default + cache.
 * Outages answer 503 with an explicit hint (never null, never 200).
 */
@Controller('api/embeddings')
export class EmbeddingsController {
  public constructor(private readonly embeddings: EmbeddingsService) {}

  @Post('embed')
  @RequireScope('generate')
  public async embed(@Body() dto: EmbedDto): Promise<{
    vector: ReadonlyArray<number>;
    model: string;
    dimensions: number;
  }> {
    const vector = await this.embeddings.embed(dto.text, dto.model);
    const models = await this.embeddings.listModels();
    const used =
      (dto.model ?? '').trim() !== ''
        ? (dto.model as string).trim()
        : models.defaultModel;
    return { vector, model: used, dimensions: vector.length };
  }

  @Post('batch')
  @RequireScope('generate')
  public async embedBatch(@Body() dto: EmbedBatchDto): Promise<{
    vectors: ReadonlyArray<ReadonlyArray<number>>;
    model: string;
  }> {
    const vectors = await this.embeddings.embedBatch(
      dto.texts ?? [],
      dto.model,
    );
    const models = await this.embeddings.listModels();
    const used =
      (dto.model ?? '').trim() !== ''
        ? (dto.model as string).trim()
        : models.defaultModel;
    return { vectors, model: used };
  }

  @Post('similarity')
  @RequireScope('generate')
  public async similarity(@Body() dto: SimilarityDto): Promise<{
    similarity: number;
    model: string;
  }> {
    const [a, b] = await this.embeddings.embedBatch([dto.a, dto.b], dto.model);
    const models = await this.embeddings.listModels();
    const used =
      (dto.model ?? '').trim() !== ''
        ? (dto.model as string).trim()
        : models.defaultModel;
    return {
      similarity: cosineSimilarity(a, b),
      model: used,
    };
  }

  @Get('models')
  @RequireScope('read')
  public async getModels(): Promise<unknown> {
    return this.embeddings.listModels();
  }
}
