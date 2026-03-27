/* tslint:disable */
/* eslint-disable */

/**
 * Build the mirador_universe from raw drug/threshold/regimen data.
 * Input: JSON { drugs, thresholds, regimens }
 * Output: JSON array of UniverseRecord
 */
export function wasm_build_universe(params_json: string): string;

/**
 * COMBINE drugs at tissue with synergy
 * Input: JSON { universe, drugs: ["VAN","RIF"], tissue, synergy_factor }
 * Output: JSON CombineResult or { error }
 */
export function wasm_combine_drugs(params_json: string): string;

/**
 * COMPARE — head-to-head drug comparison
 * Input: JSON { universe, drugs: ["VAN","RIF"], tissue }
 * Output: JSON CompareResult or { error }
 */
export function wasm_compare_drugs(params_json: string): string;

/**
 * COVER ... EVALUATE coherence
 * Input: JSON { universe, filters: [[key, value], ...], rank_dir: "DESC"|"ASC" }
 * Output: JSON array of CoverRow
 */
export function wasm_cover_evaluate(params_json: string): string;

/**
 * DECOMPOSE — full impedance breakdown
 * Input: JSON { universe, drug, tissue }
 * Output: JSON DecomposeResult or { error }
 */
export function wasm_decompose(params_json: string): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly wasm_build_universe: (a: number, b: number) => [number, number];
    readonly wasm_combine_drugs: (a: number, b: number) => [number, number];
    readonly wasm_compare_drugs: (a: number, b: number) => [number, number];
    readonly wasm_cover_evaluate: (a: number, b: number) => [number, number];
    readonly wasm_decompose: (a: number, b: number) => [number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
