/// <reference types="vite/client" />

declare const process: {
  cwd(): string;
  env: Record<string, string | undefined>;
};

declare module 'node:fs' {
  export function readFileSync(path: string, encoding: BufferEncoding): string;
  export function writeFileSync(path: string, data: string, encoding?: BufferEncoding): void;
}

declare module 'node:path' {
  export function resolve(...paths: string[]): string;
}

declare module 'node:crypto' {
  export interface Hash {
    update(data: string | Uint8Array): this;
    digest(encoding: 'hex' | 'base64' | 'base64url'): string;
  }
  export function createHash(algorithm: string): Hash;
}

