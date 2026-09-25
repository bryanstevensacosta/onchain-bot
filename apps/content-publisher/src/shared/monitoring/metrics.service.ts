/**
 * MetricsService (Tramo 2, todo 1).
 *
 * Prometheus-shape counters/gauges without the prom-client dependency
 * (the /metrics exporter + Pino logging land with the observability
 * todo). Staging dashboards (todo 10) read queue depth, publish rate,
 * LLM latency, dedup hits and failures from here.
 */
export class MetricsService {
  private readonly counters = new Map<string, number>();
  private readonly gauges = new Map<string, number>();

  public inc(name: string, by = 1): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + by);
  }

  public setGauge(name: string, value: number): void {
    this.gauges.set(name, value);
  }

  public getCounter(name: string): number {
    return this.counters.get(name) ?? 0;
  }

  public getGauge(name: string): number | null {
    return this.gauges.get(name) ?? null;
  }

  public snapshot(): Record<string, number> {
    return {
      ...Object.fromEntries(this.counters),
      ...Object.fromEntries(this.gauges),
    };
  }
}
