import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CareType } from '../generated/prisma/client.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreatePatientDto {
  @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(120)
  name!: string;

  @ApiProperty({ enum: CareType, description: 'INPATIENT = rawat inap, OUTPATIENT = rawat jalan (di rumah)' })
  @IsEnum(CareType)
  careType!: CareType;

  @ApiPropertyOptional({ description: 'Rawat inap: kamar' })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(60)
  room?: string;

  @ApiPropertyOptional({ description: 'Rawat jalan: alamat rumah (wajib). Data pribadi.' })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(300)
  address?: string;

  @ApiPropertyOptional({ description: 'Kontak keluarga' })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000)
  notes?: string;
}

export class UpdatePatientDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ enum: CareType }) @IsOptional() @IsEnum(CareType)
  careType?: CareType;

  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(60)
  room?: string;

  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(300)
  address?: string;

  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(1000)
  notes?: string;
}

export class ListPatientsQuery {
  @ApiPropertyOptional({ enum: CareType }) @IsOptional() @IsEnum(CareType)
  careType?: CareType;

  @ApiPropertyOptional({ description: 'Cari nama, kamar, atau alamat' })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100)
  search?: string;
}
