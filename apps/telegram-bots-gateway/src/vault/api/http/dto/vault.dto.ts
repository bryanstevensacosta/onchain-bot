import { IsNotEmpty, IsString } from 'class-validator';

export class RegisterBotDto {
  @IsString()
  @IsNotEmpty()
  public label!: string;

  @IsString()
  @IsNotEmpty()
  public token!: string;

  @IsString()
  @IsNotEmpty()
  public ownerApp!: string;
}

export class RotateBotDto {
  @IsString()
  @IsNotEmpty()
  public token!: string;
}
