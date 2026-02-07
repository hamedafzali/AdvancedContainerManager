export declare enum LogLevel {
    ERROR = "error",
    WARN = "warn",
    INFO = "info",
    DEBUG = "debug"
}
export declare class Logger {
    private logger;
    constructor(level?: LogLevel);
    error(message: string, ...args: any[]): void;
    warn(message: string, ...args: any[]): void;
    info(message: string, ...args: any[]): void;
    debug(message: string, ...args: any[]): void;
    http(message: string, ...args: any[]): void;
    verbose(message: string, ...args: any[]): void;
    silly(message: string, ...args: any[]): void;
}
export default Logger;
//# sourceMappingURL=logger.d.ts.map