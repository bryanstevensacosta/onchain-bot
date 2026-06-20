import { IsNotEmpty, IsString } from 'class-validator';

export class DetectChainInput {
  @IsString()
  @IsNotEmpty()
  public address!: string;
}
