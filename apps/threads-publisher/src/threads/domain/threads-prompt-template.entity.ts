import { resolveThreadsLlmModel } from './threads-llm-config.entity';

export interface ThreadsPromptTemplateProps {
  readonly id: string;
  readonly name: string;
  readonly content: string;
  readonly model: string;
  readonly maxTokens: number;
  readonly temperature: number;
  readonly vision: boolean;
}

/**
 * Threads prompt template seed (backend parity: threads-default).
 * The model is env/DB-configured (THREADS_LLM_MODEL via
 * ThreadsLlmConfig), never pinned to a provider here; an explicit
 * override may be passed for seeds/migrations.
 */
export class ThreadsPromptTemplate {
  public constructor(private readonly props: ThreadsPromptTemplateProps) {}

  public static defaultSeed(modelOverride?: string): ThreadsPromptTemplate {
    return new ThreadsPromptTemplate({
      id: 'threads-default',
      name: 'threads-default',
      content: 'Rewrite for Threads in under 500 chars: {{original}}',
      model: modelOverride ?? resolveThreadsLlmModel(),
      maxTokens: 2000,
      temperature: 0.7,
      vision: false,
    });
  }

  public get id(): string {
    return this.props.id;
  }

  public render(vars: { original: string; title?: string }): string {
    return this.props.content
      .split('{{original}}')
      .join(vars.original)
      .split('{{title}}')
      .join(vars.title ?? '');
  }

  public toView(): ThreadsPromptTemplateProps {
    return { ...this.props };
  }
}
