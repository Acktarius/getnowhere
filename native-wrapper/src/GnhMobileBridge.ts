/**
 * Expo host: Bare worklet lifecycle + WebView ↔ IPC bridge.
 * Lazy-loads react-native-bare-kit so TurboModules init after RN runtime is ready.
 * @see docs/architecture/mobile-p2p-runtime.md
 */

import { loadWorkletBundleBytes } from "./loadWorkletBundle";
import { tokensEqual } from "./tokensEqual";

export type SidecarWireMessage = Record<string, unknown> & { type: string };

type BareKitModule = typeof import("react-native-bare-kit");
type BareWorklet = InstanceType<BareKitModule["Worklet"]>;

export class GnhMobileBridge {
  readonly bridgeToken: string;
  private worklet: BareWorklet | null = null;
  private bareKit: BareKitModule | null = null;
  private startPromise: Promise<void> | null = null;
  private lineBuf = "";
  private eventHandlers = new Set<(msg: SidecarWireMessage) => void>();

  constructor(bridgeToken?: string) {
    this.bridgeToken =
      bridgeToken ??
      globalThis.crypto?.randomUUID?.() ??
      `gnh-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
    const { Worklet } = await this.loadBareKit();
    const w = new Worklet();
    w.IPC.on("data", (data: Uint8Array) => {
      this.onIpcData(data);
    });
    const bytes = await loadWorkletBundleBytes();
    w.start("/app.bundle", bytes, [this.bridgeToken]);
    this.worklet = w;
  }

  private onIpcData(data: Uint8Array): void {
    this.lineBuf += new TextDecoder().decode(data);
    let nl = this.lineBuf.indexOf("\n");
    while (nl >= 0) {
      const line = this.lineBuf.slice(0, nl);
      this.lineBuf = this.lineBuf.slice(nl + 1);
      if (line.trim()) {
        try {
          const msg = JSON.parse(line) as SidecarWireMessage;
          this.emitEvent(msg);
        } catch {
          /* ignore malformed */
        }
      }
      nl = this.lineBuf.indexOf("\n");
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
    this.lineBuf = "";
    this.eventHandlers.clear();
  }
}
