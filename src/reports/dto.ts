import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class ComplianceQuery {
  @ApiPropertyOptional({ description: 'Tanggal awal (inklusif). Default: 6 hari lalu.', example: '2026-09-28' })
  @IsOptional() @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Tanggal akhir (inklusif). Default: hari ini.', example: '2026-10-04' })
  @IsOptional() @IsDateString()
  to?: string;
}
