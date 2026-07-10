// Browser stubs for node-only imports pulled in by @grafloria/engine's TemplateConverter
export function readFile(): Promise<never> {
  return Promise.reject(new Error('fs not available in browser harness'));
}
export function writeFile(): Promise<never> {
  return Promise.reject(new Error('fs not available in browser harness'));
}
export function mkdir(): Promise<never> {
  return Promise.reject(new Error('fs not available in browser harness'));
}
export function join(...parts: string[]): string {
  return parts.join('/');
}
export function resolve(...parts: string[]): string {
  return parts.join('/');
}
export function dirname(p: string): string {
  return p.split('/').slice(0, -1).join('/');
}
export function basename(p: string): string {
  return p.split('/').pop() || '';
}
export default { readFile, writeFile, mkdir, join, resolve, dirname, basename };
