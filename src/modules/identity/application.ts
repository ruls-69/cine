import { errorMessage, sessionSchema } from '../../shared/contracts';
import type { HttpTransport } from '../../shared/application/http-port';

/** Owns session generations and polling order, independently of DOM rendering. */
export class SessionClient {
  private generation = 0;
  private stateRequest = 0;
  private etag = '';

  constructor(private readonly transport: HttpTransport, private readonly onExpired: () => void) {}

  invalidate(): void { this.etag = ''; }
  get stateETag(): string { return this.etag; }

  async request(path: string, data?: unknown): Promise<unknown> {
    if (path === 'login' || path === 'logout') {
      this.generation++;
      this.invalidate();
    }
    const generation = this.generation;
    const request = path === 'state' ? ++this.stateRequest : 0;
    const stale = (): boolean => path === 'state' && (generation !== this.generation || request !== this.stateRequest);
    const headers: Record<string, string> = data ? { 'Content-Type': 'application/json' } : {};
    if (path === 'state' && this.etag) headers['If-None-Match'] = this.etag;
    const response = await this.transport('/api/' + path, {
      method: data ? 'POST' : 'GET', headers, body: data ? JSON.stringify(data) : undefined,
    });
    if (stale() || (path === 'state' && response.status === 304)) return null;
    const body = await response.json();
    if (stale()) return null;
    if (!response.ok) {
      if (response.status === 401 && path !== 'login') {
        this.generation++;
        this.invalidate();
        this.onExpired();
      }
      throw new Error(errorMessage(body));
    }
    if (path === 'state') {
      const result = sessionSchema.safeParse(body);
      if (!result.success) throw new Error('El servidor devolvió datos de sesión inválidos.');
      this.etag = response.headers.get('ETag') || '';
      return result.data;
    }
    return body;
  }
}
