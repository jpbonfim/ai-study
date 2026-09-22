/// <reference path="../.astro/types.d.ts" />

declare namespace App {
  interface Locals {
    user?: {
      id: number;
      username: string;
      displayName: string;
      role: 'normal' | 'admin';
      createdAt: string;
    };
    sessionId?: string;
  }
}
