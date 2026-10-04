import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { normalizeEmail } from '../auth/dto.js';
import { CaregiverType, Role } from '../generated/prisma/client.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateUserDto {
  @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(120)
  name!: string;

  @ApiProperty() @Transform(normalizeEmail) @IsEmail() @MaxLength(254)
  email!: string;

  @ApiProperty({ enum: Role }) @IsEnum(Role)
  role!: Role;

  @ApiPropertyOptional({ enum: CaregiverType, description: 'Wajib bila role = CAREGIVER' })
  @IsOptional() @IsEnum(CaregiverType)
  caregiverType?: CaregiverType;

  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(30)
  phone?: string;

  @ApiProperty({ minLength: 8 }) @IsString() @MinLength(8) @MaxLength(128)
  password!: string;
}

export class UpdateUserDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(120)
  name?: string;

  @ApiPropertyOptional() @IsOptional() @Transform(normalizeEmail) @IsEmail() @MaxLength(254)
  email?: string;

  @ApiPropertyOptional({ enum: Role }) @IsOptional() @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional({ enum: CaregiverType }) @IsOptional() @IsEnum(CaregiverType)
  caregiverType?: CaregiverType;

  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ minLength: 8, description: 'Reset kata sandi' })
  @IsOptional() @IsString() @MinLength(8) @MaxLength(128)
  password?: string;
}

export class ListUsersQuery {
  @ApiPropertyOptional({ enum: Role }) @IsOptional() @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(100)
  search?: string;
}
