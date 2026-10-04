import { instanceToPlain, plainToInstance } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength, validateSync } from 'class-validator';

class EnvVars {
  @IsOptional() @IsInt() @Min(1) @Max(65535)
  PORT: number = 3000;

  @IsString() @MinLength(1)
  DATABASE_URL!: string;

  @IsString() @MinLength(32, { message: 'JWT_ACCESS_SECRET minimal 32 karakter' })
  JWT_ACCESS_SECRET!: string;

  @IsString() @MinLength(32, { message: 'JWT_REFRESH_SECRET minimal 32 karakter' })
  JWT_REFRESH_SECRET!: string;

  @IsOptional() @IsInt() @Min(60)
  JWT_ACCESS_TTL_SECONDS: number = 900;

  @IsOptional() @IsInt() @Min(1)
  JWT_REFRESH_TTL_DAYS: number = 30;

  /** Origin admin web yang diizinkan CORS, dipisah koma. */
  @IsOptional() @IsString()
  CORS_ORIGINS: string = 'http://localhost:5173';

  /** Selisih zona waktu operasional dari UTC (menit) untuk batas "hari ini". WIB = 420. */
  @IsOptional() @IsInt() @Min(-720) @Max(840)
  TZ_OFFSET_MINUTES: number = 420;

  /** Jumlah proxy di depan API (Railway = 1). 0 bila diakses langsung. */
  @IsOptional() @IsInt() @Min(0) @Max(5)
  TRUST_PROXY: number = 0;

  @IsOptional() @IsString()
  SWAGGER_ENABLED?: string;

  /** Level log minimum. Default: debug (dev), info (production), silent (test). */
  @IsOptional() @IsIn(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
  LOG_LEVEL?: string;
}

export function validateEnv(raw: Record<string, unknown>) {
  const config = plainToInstance(EnvVars, raw, { enableImplicitConversion: true });
  const errors = validateSync(config, { skipMissingProperties: false });
  if (errors.length) {
    const detail = errors.flatMap((e) => Object.values(e.constraints ?? {})).join('; ');
    throw new Error(`Konfigurasi environment tidak valid: ${detail}`);
  }
  return { ...raw, ...instanceToPlain(config) };
}
