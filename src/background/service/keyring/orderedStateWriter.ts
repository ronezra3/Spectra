import cloneDeep from 'lodash/cloneDeep';

/** Serializes full-state writes; rejected writes do not prevent later retries. */
export class OrderedStateWriter<T> {
  private tail: Promise<void> = Promise.resolve();
  private latest: Promise<void> = Promise.resolve();

  constructor(private readonly write: (snapshot: T) => Promise<void>) {}

  enqueue(value: T): Promise<void> {
    // ObservableStore state may be modified again before this write starts.
    const snapshot = cloneDeep(value);
    const operation = this.tail.then(() => this.write(snapshot));
    this.tail = operation.catch(() => undefined);
    this.latest = operation;
    return operation;
  }

  /** Wait for the latest enqueued write, including its failure if any. */
  flush(): Promise<void> {
    return this.latest;
  }
}
