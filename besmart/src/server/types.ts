declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        email: string | null;
        display_name: string | null;
      };
    }
  }
}

export {};
