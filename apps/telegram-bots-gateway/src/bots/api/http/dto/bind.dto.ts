import { IsNotEmpty, IsString } from 'class-validator';

export class BindBotDto {
  @IsString()
  @IsNotEmpty()
  public appId!: string;
}
