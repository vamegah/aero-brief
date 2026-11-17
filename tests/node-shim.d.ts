// Minimal, hand-maintained stand-in for @types/node.
//
// Kept this way by user choice, to stay within the approved stack: the root tsconfig
// inherits `types: ["@cloudflare/workers-types"]` and @types/node is intentionally not installed.
//
// Scope: applies only to the root tests/ project (picked up via "include": ["tests"] in the
// root tsconfig.json). Workspace packages and apps do not use it.
//
// Maintenance: declares only the Node APIs that tests/repo-guard.test.ts uses today. If the
// guard (or another root test) uses a new Node API, extend this file to match.
//
// This file must stay free of top-level import/export so the declarations remain global.

declare module "node:fs" {
  export interface Dirent {
    readonly name: string;
    isDirectory(): boolean;
    isFile(): boolean;
  }
  export function readdirSync(path: string, options: { withFileTypes: true }): Dirent[];
  export function readFileSync(path: string, encoding: "utf8"): string;
}

declare module "node:path" {
  export const sep: string;
  export function dirname(path: string): string;
  export function join(...paths: string[]): string;
  export function relative(from: string, to: string): string;
  export function resolve(...paths: string[]): string;
}

declare module "node:url" {
  export function fileURLToPath(url: string): string;
}

interface ImportMeta {
  readonly url: string;
}
