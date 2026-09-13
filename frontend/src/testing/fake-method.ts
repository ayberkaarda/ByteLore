type Outcome<T> =
  | { readonly kind: 'value'; readonly value: T }
  | { readonly kind: 'error'; readonly error: unknown };

/**
 * One programmable method on a hand-built test double: every call is recorded
 * with its arguments, and answers come off a one-shot queue first, falling
 * back to a standing answer once the queue is empty. Neither is set by
 * default, so a component test that calls a method nobody armed gets a clear
 * failure instead of `undefined` silently flowing into a template.
 *
 * Hand-rolled rather than built on a test-mocking library on purpose: the
 * fakes that use this live under `src/testing/`, which compiles as ordinary
 * application source (`tsconfig.app.json` and `tsconfig.typecheck.json` cover
 * every file under `src/`, not only what a build's entry point happens to
 * reach), so it must not gain a dependency the rest of the codebase does not
 * already carry there.
 *
 * It sits in its own file because more than one fake needs it, and a shared
 * helper reached by importing one unrelated double from another would tie
 * two test surfaces together for no reason.
 */
export class FakeMethod<Args extends readonly unknown[], T> {
  private readonly recordedCalls: Args[] = [];
  private readonly queue: Outcome<T>[] = [];
  private standing: Outcome<T> | null = null;

  /** Every call this method received, in order, for asserting call count and arguments. */
  get calls(): readonly Args[] {
    return this.recordedCalls;
  }

  /** The arguments of the most recent call, or `undefined` if it was never called. */
  get lastArgs(): Args | undefined {
    return this.recordedCalls.at(-1);
  }

  /** Queues one answer for the next call only. */
  mockResolvedValueOnce(value: T): void {
    this.queue.push({ kind: 'value', value });
  }

  /** Queues one failure for the next call only. */
  mockRejectedValueOnce(error: unknown): void {
    this.queue.push({ kind: 'error', error });
  }

  /** Sets the answer every call gets once the one-shot queue is empty. */
  mockResolvedValue(value: T): void {
    this.standing = { kind: 'value', value };
  }

  /** Sets the failure every call gets once the one-shot queue is empty. */
  mockRejectedValue(error: unknown): void {
    this.standing = { kind: 'error', error };
  }

  /** Records the call and resolves it against the queue, then the standing answer. */
  async resolveCall(...args: Args): Promise<T> {
    this.recordedCalls.push(args);
    const outcome = this.queue.shift() ?? this.standing;
    if (outcome === null) {
      throw new Error(
        'A fake method was called without a configured response ' +
          '(call mockResolvedValueOnce/mockResolvedValue or the *Rejected* counterpart first).',
      );
    }
    if (outcome.kind === 'error') {
      throw outcome.error;
    }
    return outcome.value;
  }
}
