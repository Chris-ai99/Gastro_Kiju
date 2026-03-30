import { IsString, MinLength } from "class-validator";

export class LoginDto {
  @IsString()
  identifier!: string;

  @IsString()
  @MinLength(4)
  secret!: string;
}
