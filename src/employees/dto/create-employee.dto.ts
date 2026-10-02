import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class CreateEmployeeDto {
  /** @example 'Ana Souza' */
  @IsString()
  @IsNotEmpty()
  name: string;

  /** @example 'ana.souza@empresa.com' */
  @IsEmail()
  email: string;

  /** @example 'TI' */
  @IsString()
  @IsNotEmpty()
  department: string;
}
