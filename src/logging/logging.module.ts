import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { buildLoggerParams } from './logging.config.js';

@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        buildLoggerParams({ NODE_ENV: config.get<string>('NODE_ENV'), LOG_LEVEL: config.get<string>('LOG_LEVEL') }),
    }),
  ],
})
export class LoggingModule {}
