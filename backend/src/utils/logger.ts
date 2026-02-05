import winston from 'winston';

export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug'
}

export class Logger {
  private logger: winston.Logger;

  constructor(level: LogLevel = LogLevel.INFO) {
    this.logger = winston.createLogger({
      level,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json(),
        winston.format.printf(({ timestamp, level, message, stack }) => {
          return `${timestamp} [${level.toUpperCase()}]: ${message}${stack ? '\\n' + stack : ''}`;
        })
      ),
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        }),
        new winston.transports.File({
          filename: 'logs/app.log',
          maxsize: 5242880, // 5MB
          maxFiles: 5,
        }),
        new winston.transports.File({
          filename: 'logs/error.log',
          level: 'error',
          maxsize: 5242880,
          maxFiles: 5,
        }),
      ],
    });
  }

  error(message: string, ...args: any[]): void {
    this.logger.error(message, ...args);
  }

  warn(message: string, ...args: any[]): void {
    this.logger.warn(message, ...args);
  }

  info(message: string, ...args: any[]): void {
    this.logger.info(message, ...args);
  }

  debug(message: string, ...args: any[]): void {
    this.logger.debug(message, ...args);
  }

  http(message: string, ...args: any[]): void {
    this.logger.http(message, ...args);
  }

  verbose(message: string, ...args: any[]): void {
    this.logger.verbose(message, ...args);
  }

  silly(message: string, ...args: any[]): void {
    this.logger.silly(message, ...args);
  }
}

export default Logger;
