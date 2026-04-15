import 'express';

declare global {
  namespace Express {
    export interface User {
      id: number;
      email: string;
      role: string;
    }

    export interface Request {
      user?: User;
    }
  }
}
