import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { TaskStatus } from '../generated/prisma/client.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateTaskDto {
  @ApiProperty() @IsUUID()
  patientId!: string;

  @ApiProperty() @IsUUID()
  caregiverId!: string;

  @ApiProperty({ example: 'Amlodipine' }) @Transform(trim) @IsString() @MinLength(1) @MaxLength(120)
  medicine!: string;

  @ApiProperty({ example: '5 mg' }) @Transform(trim) @IsString() @MinLength(1) @MaxLength(60)
  dose!: string;

  @ApiProperty({ example: '2026-10-04T01:00:00.000Z' }) @IsDateString()
  scheduledAt!: string;

  @ApiProperty({ description: 'Batas waktu; harus setelah scheduledAt' }) @IsDateString()
  dueUntil!: string;

  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(1000)
  notes?: string;
}

/** Hanya tugas berstatus PENDING yang boleh diubah. */
export class UpdateTaskDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID()
  caregiverId?: string;

  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(120)
  medicine?: string;

  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(60)
  dose?: string;

  @ApiPropertyOptional() @IsOptional() @IsDateString()
  scheduledAt?: string;

  @ApiPropertyOptional() @IsOptional() @IsDateString()
  dueUntil?: string;

  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(1000)
  notes?: string;
}

export class VerifyTaskDto {
  @ApiProperty({ description: 'true = setujui (VERIFIED), false = tolak (REJECTED)' }) @IsBoolean()
  approve!: boolean;

  @ApiPropertyOptional({ description: 'Wajib bila approve = false' })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000)
  note?: string;
}

const csv = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.split(',').map((s) => s.trim()).filter(Boolean) : value;

export class ListTasksQuery {
  @ApiPropertyOptional({ enum: TaskStatus, isArray: true, description: 'Dipisah koma, mis. GIVEN,REFUSED' })
  @IsOptional() @Transform(csv) @IsArray() @IsEnum(TaskStatus, { each: true })
  status?: TaskStatus[];

  @ApiPropertyOptional() @IsOptional() @IsUUID()
  caregiverId?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID()
  patientId?: string;

  @ApiPropertyOptional({ description: 'scheduledAt >= from (ISO)' }) @IsOptional() @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'scheduledAt < to (ISO)' }) @IsOptional() @IsDateString()
  to?: string;

  @ApiPropertyOptional({ description: 'Cari nama pasien atau obat' })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc', description: 'Urutan scheduledAt' })
  @IsOptional() @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';

  @ApiPropertyOptional({ default: 0 }) @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  skip?: number;

  @ApiPropertyOptional({ default: 50, maximum: 200 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200)
  take?: number;
}
