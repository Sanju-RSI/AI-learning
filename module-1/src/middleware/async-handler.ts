import type { NextFunction, Request, Response } from 'express';

export function asyncHandler(
  work: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    work(req, res, next).catch(next);
  };
}
