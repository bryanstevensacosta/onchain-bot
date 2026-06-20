import { IsNotEmpty, IsString } from 'class-validator';

export class AnalyzeHoneypotInput {
  @IsString()
  @IsNotEmpty()
  public chain!: string;

  @IsString()
  @IsNotEmpty()
  public address!: string;
}
