import { createLineReader, NdjsonLineTooLongError } from "./createLineReader";

type WireMessage = Record<string, unknown> & { type: string };

/** Bounded NDJSON reassembly for BareKit IPC → bridge events. */
export class IpcLineProcessor {
  private lineReader = createLineReader();
  private accepting = true;

  constructor(
    private readonly onMessage: (msg: WireMessage) => void,
    private readonly onOverflow: () => void,
  ) {}

  push(data: Uint8Array): void {
    if (!this.accepting) return;
    try {
      for (const raw of this.lineReader.push(data)) {
        this.onMessage(raw as WireMessage);
      }
    } catch (e) {
      if (e instanceof NdjsonLineTooLongError) {
        this.accepting = false;
        this.lineReader.reset();
        this.onOverflow();
      }
    }
  }

  reset(): void {
    this.accepting = true;
    this.lineReader.reset();
  }

  get isAccepting(): boolean {
    return this.accepting;
  }
}
