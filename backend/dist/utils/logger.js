"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = exports.LogLevel = void 0;
const winston_1 = __importDefault(require("winston"));
var LogLevel;
(function (LogLevel) {
    LogLevel["ERROR"] = "error";
    LogLevel["WARN"] = "warn";
    LogLevel["INFO"] = "info";
    LogLevel["DEBUG"] = "debug";
})(LogLevel || (exports.LogLevel = LogLevel = {}));
class Logger {
    constructor(level = LogLevel.INFO) {
        this.logger = winston_1.default.createLogger({
            level,
            format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.errors({ stack: true }), winston_1.default.format.json(), winston_1.default.format.printf(({ timestamp, level, message, stack }) => {
                return `${timestamp} [${level.toUpperCase()}]: ${message}${stack ? '\\n' + stack : ''}`;
            })),
            transports: [
                new winston_1.default.transports.Console({
                    format: winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.simple())
                }),
                new winston_1.default.transports.File({
                    filename: 'logs/app.log',
                    maxsize: 5242880, // 5MB
                    maxFiles: 5,
                }),
                new winston_1.default.transports.File({
                    filename: 'logs/error.log',
                    level: 'error',
                    maxsize: 5242880,
                    maxFiles: 5,
                }),
            ],
        });
    }
    error(message, ...args) {
        this.logger.error(message, ...args);
    }
    warn(message, ...args) {
        this.logger.warn(message, ...args);
    }
    info(message, ...args) {
        this.logger.info(message, ...args);
    }
    debug(message, ...args) {
        this.logger.debug(message, ...args);
    }
    http(message, ...args) {
        this.logger.http(message, ...args);
    }
    verbose(message, ...args) {
        this.logger.verbose(message, ...args);
    }
    silly(message, ...args) {
        this.logger.silly(message, ...args);
    }
}
exports.Logger = Logger;
exports.default = Logger;
