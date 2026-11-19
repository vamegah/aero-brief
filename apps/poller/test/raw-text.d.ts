// Vite `?raw` imports, used by digest-cron.test.ts to read wrangler.jsonc as text.
declare module "*.jsonc?raw" {
  const text: string;
  export default text;
}
