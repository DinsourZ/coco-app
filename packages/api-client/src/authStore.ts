import type { AccessRole } from '@coco/protocol';

export type AuthListener = () => void;

/**
 * Role-scoped in-memory bearer token store.
 *
 * Security invariant preserved from CoCo OS:
 * - Access tokens live strictly in volatile process memory.
 * - Tokens are never written to URLs, cookies, logs, or plaintext disk storage.
 * - Each role (`console`, `approver`, `audit`) is isolated; generation counters
 *   invalidate stale in-flight requests and approvals across token changes.
 */
export class InMemoryAuthStore {
  private readonly tokens: Record<AccessRole, string> = {
    console: '',
    approver: '',
    audit: '',
  };

  private readonly listeners = new Set<AuthListener>();
  private revision = 0;
  private readonly roleRevisions: Record<AccessRole, number> = {
    console: 0,
    approver: 0,
    audit: 0,
  };

  getToken(role: AccessRole): string {
    return this.tokens[role];
  }

  hasToken(role: AccessRole): boolean {
    return this.tokens[role].length > 0;
  }

  setToken(role: AccessRole, token: string): void {
    this.tokens[role] = token.trim();
    this.revision += 1;
    this.roleRevisions[role] += 1;
    this.notify();
  }

  clearRole(role: AccessRole): void {
    if (!this.tokens[role]) return;
    this.setToken(role, '');
  }

  clearAll(): void {
    this.tokens.console = '';
    this.tokens.approver = '';
    this.tokens.audit = '';
    this.revision += 1;
    this.roleRevisions.console += 1;
    this.roleRevisions.approver += 1;
    this.roleRevisions.audit += 1;
    this.notify();
  }

  getRevision(role?: AccessRole): number {
    return role ? this.roleRevisions[role] : this.revision;
  }

  subscribe(listener: AuthListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }
}
