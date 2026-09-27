/**
 * Env var selecting the Threads LLM model. Per-env override; the code
 * never pins a provider model — the operator sets a concrete model
 * per environment (see .env.example).
 */
export const THREADS_LLM_MODEL_ENV = 'THREADS_LLM_MODEL';

/**
 * Fallback model when THREADS_LLM_MODEL is unset. Deliberately
 * provider-neutral: no `provider/model` id is hardcoded anywhere.
 */
export const DEFAULT_THREADS_LLM_MODEL = 'threads-llm-default';

export function resolveThreadsLlmModel(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const raw = (env[THREADS_LLM_MODEL_ENV] ?? '').trim();
  return raw.length > 0 ? raw : DEFAULT_THREADS_LLM_MODEL;
}

export interface ThreadsLlmConfigProps {
  readonly llmEnabled: boolean;
  readonly publishingEnabled: boolean;
  readonly rejectNonLatin: boolean;
  readonly dailyCap: number;
  readonly llmMaxAttempts: number;
  readonly model: string;
}

/**
 * Threads LLM config (single row id=1, SIN target).
 * LLM generation ONLY when llmEnabled AND publishingEnabled.
 */
export class ThreadsLlmConfig {
  public constructor(private props: ThreadsLlmConfigProps) {}

  public static default(
    env: NodeJS.ProcessEnv = process.env,
  ): ThreadsLlmConfig {
    return new ThreadsLlmConfig({
      llmEnabled: false,
      publishingEnabled: false,
      rejectNonLatin: false,
      dailyCap: 60,
      llmMaxAttempts: 3,
      model: resolveThreadsLlmModel(env),
    });
  }

  public get llmEnabled(): boolean {
    return this.props.llmEnabled;
  }

  public get publishingEnabled(): boolean {
    return this.props.publishingEnabled;
  }

  public get dailyCap(): number {
    return this.props.dailyCap;
  }

  public get llmMaxAttempts(): number {
    return this.props.llmMaxAttempts;
  }

  public get model(): string {
    return this.props.model;
  }

  public shouldGenerateLlm(): boolean {
    return this.props.llmEnabled && this.props.publishingEnabled;
  }

  public patch(patch: Partial<ThreadsLlmConfigProps>): void {
    this.props = { ...this.props, ...patch };
  }

  public toView(): ThreadsLlmConfigProps {
    return { ...this.props };
  }
}
