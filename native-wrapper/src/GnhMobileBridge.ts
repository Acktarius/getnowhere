/**
 * Expo host: Bare worklet lifecycle + WebView ↔ IPC bridge.
 * Lazy-loads react-native-bare-kit so TurboModules init after RN runtime is ready.
 * @see docs/architecture/mobile-p2p-runtime.md
 */

import { assertNonEmptyBridgeToken, createBridgeToken } from "./bridgeToken";
import { IpcLineProcessor } from "./ipcLineProcessor";
import { loadWorkletBundleBytes } from "./loadWorkletBundle";
import { tokensEqual } from "./tokensEqual";

export type SidecarWireMessage = Record<string, unknown> & { type: string };

/** Normalize BareKit IPC `data` (typed unknown in bare-events) to bytes. */
function ipcBytes(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) return data;
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  throw new TypeError("BareKit IPC data must be a byte view");
}

type BareKitModule = typeof import("react-native-bare-kit");
type BareWorklet = InstanceType<BareKitModule["Worklet"]>;

export class GnhMobileBridge {
  readonly bridgeToken: string;
  private worklet: BareWorklet | null = null;
  private bareKit: BareKitModule | null = null;
  private startPromise: Promise<void> | null = null;
  private ipcProcessor: IpcLineProcessor | null = null;
  private eventHandlers = new Set<(msg: SidecarWireMessage) => void>();

  constructor(bridgeToken?: string) {
    this.bridgeToken = bridgeToken
      ? assertNonEmptyBridgeToken(bridgeToken)
      : createBridgeToken();
  }

  private async loadBareKit(): Promise<BareKitModule> {
    if (!this.bareKit) {
      this.bareKit = await import("react-native-bare-kit");
    }
    return this.bareKit;
  }

  onEvent(handler: (msg: SidecarWireMessage) => void): () => void {
    this.eventHandlers.add(handler);
    return () => {
      this.eventHandlers.delete(handler);
    };
  }

  private emitEvent(msg: SidecarWireMessage): void {
    for (const h of this.eventHandlers) {
      try {
        h(msg);
      } catch {
        /* ignore handler errors */
      }
    }
  }

  /** Start Bare worklet from packed bundle bytes. */
  async ensureStarted(): Promise<void> {
    if (this.worklet) return;
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.doStart();
    try {
      await this.startPromise;
    } catch (e) {
      this.startPromise = null;
      throw e;
    }
  }

  private async doStart(): Promise<void> {
    assertNonEmptyBridgeToken(this.bridgeToken);
    const { Worklet } = await this.loadBareKit();
    const w = new Worklet();
    this.ipcProcessor = new IpcLineProcessor(
      (msg) => this.emitEvent(msg),
      () => this.handleIpcOverflow(),
    );
    w.IPC.on("data", (data: unknown) => {
      this.onIpcData(ipcBytes(data));
    });
    const bytes = await loadWorkletBundleBytes();
    w.start("/app.bundle", bytes, [this.bridgeToken]);
    this.worklet = w;
  }

  private onIpcData(data: Uint8Array): void {
    this.ipcProcessor?.push(data);
  }

  private handleIpcOverflow(): void {
    const w = this.worklet;
    this.worklet = null;
    this.startPromise = null;
    try {
      w?.terminate();
    } catch {
      /* ignore */
    }
  }

  sendCommand(cmd: SidecarWireMessage): void {
    if (!this.worklet) {
      throw new Error("Bare worklet not started");
    }
    const payload = { ...cmd, token: this.bridgeToken };
    this.worklet.IPC.write(
      new TextEncoder().encode(`${JSON.stringify(payload)}\n`),
    );
  }

  /** Validate WebView postMessage and forward to worklet. Returns false if rejected. */
  handleWebViewMessage(raw: string): boolean {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return false;
    }
    if (parsed.channel !== "gnh-bridge" || parsed.direction !== "command") {
      return false;
    }
    const token = typeof parsed.token === "string" ? parsed.token : "";
    if (!tokensEqual(token, this.bridgeToken)) {
      return false;
    }
    const { channel: _c, direction: _d, token: _t, ...cmd } = parsed;
    if (typeof cmd.type !== "string") return false;
    try {
      this.sendCommand(cmd as SidecarWireMessage);
    } catch {
      return false;
    }
    return true;
  }

  destroy(): void {
    try {
      this.worklet?.terminate();
    } catch {
      /* ignore */
    }
    this.worklet = null;
    this.bareKit = null;
    this.startPromise = null;
    this.ipcProcessor?.reset();
    this.ipcProcessor = null;
    this.eventHandlers.clear();
  }
}
