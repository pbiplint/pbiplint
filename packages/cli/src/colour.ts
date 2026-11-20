/**
 * Whether the text report on stdout is coloured (#256), from whether stdout is a terminal and
 * the environment. `FORCE_COLOR` decides when it is set, as Node documents it
 * (https://nodejs.org/api/cli.html#force_color1-2-3): `1`, `true`, the empty string, `2`, or `3`
 * turns colour on, through a pipe too, and ignores `NO_COLOR`; any other value turns it off.
 * Otherwise a non-empty `NO_COLOR` (https://no-color.org/) or `TERM=dumb` turns it off, and
 * colour is on when stdout is a terminal. The caller keeps every other output plain.
 */
export function colourWanted(
  isTTY: boolean,
  env: Readonly<Record<string, string | undefined>>,
): boolean {
  const force = env.FORCE_COLOR;
  if (force !== undefined) return ["", "1", "true", "2", "3"].includes(force);
  if (env.NO_COLOR) return false;
  if (env.TERM === "dumb") return false;
  return isTTY;
}
