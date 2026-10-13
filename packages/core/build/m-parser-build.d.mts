import type { Plugin as EsbuildPlugin } from "esbuild";
import type { Plugin as VitePlugin } from "vite";

export declare const LOCALE_TEMPLATE: RegExp;
export declare const EMPTY_TEMPLATE: string;
export declare const PERFORMANCE_NOW: string;
export declare const GERMAN_PROBE: string;
export declare const mParserEsbuild: EsbuildPlugin;
export declare function mParserVite(): VitePlugin;
