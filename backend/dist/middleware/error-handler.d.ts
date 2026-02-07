import { Request, Response, NextFunction } from 'express';
export interface AppError extends Error {
    statusCode?: number;
    status?: number;
    code?: string;
    details?: any;
}
export declare function errorHandler(err: AppError, req: Request, res: Response, next: NextFunction): void;
export declare function notFoundHandler(req: Request, res: Response, next: NextFunction): void;
export declare function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>): (req: any, res: any, next: any) => void;
export default errorHandler;
//# sourceMappingURL=error-handler.d.ts.map