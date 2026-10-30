export function leavesOrigin(url: string, origin: string): boolean;
export function parseArgs(argv: string[]): {
  url: string;
  browser: string | undefined;
  noSandbox: boolean;
};
export function browserCandidates(
  platform: NodeJS.Platform,
  env: Record<string, string | undefined>,
): string[];
export const DEBUGGING_DISALLOWED: RegExp;
export function isWindowsSystem(
  platform: NodeJS.Platform,
  account: { username: string; homedir: string },
): boolean;
export const RUN_AS_USER: string;
