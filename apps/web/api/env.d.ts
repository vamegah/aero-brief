// Minimal stand-in for @types/node, which is not a dependency of this repo.
// Declares only what the relay reads.
declare const process: {
  readonly env: Record<string, string | undefined>;
};
