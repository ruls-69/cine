export interface HttpResponse {
  readonly status: number;
  readonly ok: boolean;
  readonly headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}
export type HttpTransport = (url: string, init: RequestInit) => Promise<HttpResponse>;
