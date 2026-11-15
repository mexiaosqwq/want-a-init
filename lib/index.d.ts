import type { Context } from '@deepseek-ai/cordis'
import type z from '@deepseek-ai/schemastery'

export declare const name = 'init-command'
export declare const inject: string[]

/** Producer kind of the /init injected-context message (never `user`). */
export declare const SOURCE_KIND: string

export interface InitOptions {
  force: boolean
  minimal: boolean
  detailed: boolean
  /** true when both minimal and detailed were given (pure-options mode only) */
  conflict: boolean
  /** true when rawInput is non-empty free-form guidance rather than bare option tokens */
  naturalLanguage: boolean
}

export declare function parseOptions(rawInput: unknown): InitOptions
export declare function buildPrompt(cwd: string, rawInput: unknown): string

/** Plugin config — defaults live in the schemastery schema (`enabled` defaults to true). */
export interface InitConfig {
  /** Gate the persistent agents-md-maintenance system-prompt section (default true). */
  enabled: boolean
}

export declare const Config: z<InitConfig>
export declare function apply(ctx: Context, config?: Partial<InitConfig>): void
