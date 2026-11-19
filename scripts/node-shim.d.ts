// Minimal, hand-maintained Node declarations for scripts/ only.
//
// @types/node is intentionally not installed (approved stack, see tests/node-shim.d.ts). This
// file declares just the Node APIs that scripts/rotation/adapters.ts and scripts/rotate-secrets.ts
// use. It is picked up by scripts/tsconfig.json only; the root tests project does not include it,
// which is why the unit-tested files under scripts/rotation must not import node:* modules.
//
// Keep free of top-level import/export so the declarations remain global.
declare module "node:fs" {
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function writeFileSync(path: string, data: string, options?: { mode?: number }): void;
  export function copyFileSync(from: string, to: string): void;
  export function renameSync(from: string, to: string): void;
  export function existsSync(path: string): boolean;
  export function unlinkSync(path: string): void;
}
declare module "node:path" {
  export function dirname(path: string): string;
  export function join(...paths: string[]): string;
  export function resolve(...paths: string[]): string;
}
declare module "node:crypto" {
  export function randomBytes(size: number): { toString(encoding: "base64url"): string };
}
declare module "node:child_process" {
  interface ChildStream {
    on(event: "data", listener: (chunk: { toString(): string }) => void): void;
  }
  export interface ChildProcess {
    stdin: { write(data: string): void; end(): void; on(event: "error", listener: (e: Error) => void): void };
    stdout: ChildStream;
    stderr: ChildStream;
    on(event: "error", listener: (e: Error) => void): void;
    on(event: "close", listener: (code: number | null) => void): void;
  }
  export function spawn(
    command: string,
    args: string[],
    options: { cwd?: string; env?: Record<string, string>; shell?: boolean },
  ): ChildProcess;
}
declare module "node:readline/promises" {
  export function createInterface(options: { input: unknown; output: unknown }): {
    question(query: string): Promise<string>;
    close(): void;
  };
}
declare const process: {
  argv: string[];
  execPath: string;
  env: Record<string, string | undefined>;
  exitCode: number | undefined;
  stdin: { isTTY?: boolean };
  stdout: { write(text: string): boolean };
  stderr: { write(text: string): boolean };
  cwd(): string;
};
interface ImportMeta {
  readonly dirname: string;
}
