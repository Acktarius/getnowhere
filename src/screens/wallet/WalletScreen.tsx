import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Download,
  Lock,
  RefreshCw,
  Upload,
  Wallet as WalletIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { BottomNav } from "@/components/BottomNav";
import { EmptyState } from "@/components/EmptyState";
import { ReceiveSheet } from "@/components/ReceiveSheet";
import { SendSheet } from "@/components/SendSheet";
import { Sheet } from "@/components/Sheet";
import { TopBar } from "@/components/TopBar";
import { WalletBalanceCard } from "@/components/WalletBalanceCard";
import { useCopy } from "@/hooks/useCopy";
import { walletService } from "@/services";
import { useSettingsStore } from "@/state/settingsStore";
import { useWalletStore } from "@/state/walletStore";
import type { Transaction } from "@/types/models";
import { formatCCX, shortAddress, timeAgo } from "@/utils/format";

export function WalletScreen() {
  const wallet = useWalletStore();
  const hideBalances = useSettingsStore((s) => s.privacy.hideBalancesByDefault);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [loadingTx, setLoadingTx] = useState(true);
  const [sendOpen, setSendOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [copied, copy] = useCopy();

  useEffect(() => {
    if (!wallet.initialized) return;
    walletService.getTransactions().then((t) => {
      setTxs(t);
      setLoadingTx(false);
    });
  }, [wallet.initialized, wallet.balanceTotal]);

  if (!wallet.initialized) {
    return (
      <div className="screen">
        <TopBar title="Wallet" bordered />
        <div className="screen-scroll">
          <EmptyState
            icon={WalletIcon}
            title="No wallet yet"
            body="Create or restore a wallet to start managing CCX and establishing private relationships."
          />
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="screen">
      <TopBar
        title="Wallet"
        subtitle={wallet.network}
        trailing={
          <button
            className="topbar__icon-btn"
            onClick={() => wallet.resync()}
            aria-label="Resync"
          >
            <RefreshCw
              size={17}
              className={wallet.syncStatus === "syncing" ? "spin" : ""}
            />
          </button>
        }
        bordered
      />
      <div
        className="screen-scroll stack stack--gap-4"
        style={{ padding: "16px 16px 32px" }}
      >
        <div className="fade-in-up">
          <WalletBalanceCard
            wallet={wallet}
            hideByDefault={hideBalances}
            onResync={() => wallet.resync()}
            onToggleLock={() => wallet.lock()}
          />
        </div>

        <div className="row-flex" style={{ gap: 10 }}>
          <button
            className="btn btn--secondary grow"
            onClick={() => setReceiveOpen(true)}
          >
            <ArrowDownToLine size={16} /> Receive
          </button>
          <button
            className="btn btn--primary grow"
            onClick={() => setSendOpen(true)}
            disabled={wallet.locked}
          >
            <ArrowUpFromLine size={16} /> Send
          </button>
        </div>

        <div className="card card--flush fade-in-up">
          <div className="row" style={{ paddingBottom: 8 }}>
            <div className="row__main">
              <div className="card__title" style={{ margin: 0 }}>
                Your address
              </div>
            </div>
            <button
              className="btn btn--sm btn--ghost"
              onClick={() => copy(wallet.address)}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <div
            className="mono"
            style={{
              fontSize: 12,
              padding: "0 16px 16px",
              wordBreak: "break-all",
              color: "var(--text-muted)",
            }}
          >
            {wallet.address}
          </div>
        </div>

        <div className="section" style={{ padding: 0 }}>
          <div className="section__head" style={{ padding: 0 }}>
            <span className="section__title">History</span>
          </div>
          {loadingTx ? (
            <div className="card card--flush">
              {[0, 1, 2].map((i) => (
                <div className="row" key={i}>
                  <div
                    className="skeleton sk-circle"
                    style={{ width: 32, height: 32 }}
                  />
                  <div className="grow stack stack--gap-2">
                    <span
                      className="skeleton sk-line"
                      style={{ width: "40%" }}
                    />
                    <span className="skeleton sk-line sk-line--sm" />
                  </div>
                  <span className="skeleton sk-line" style={{ width: 50 }} />
                </div>
              ))}
            </div>
          ) : txs.length === 0 ? (
            <EmptyState
              title="No transactions yet"
              body="Incoming and outgoing CCX transfers will appear here."
            />
          ) : (
            <div className="card card--flush stagger">
              {txs.map((tx) => (
                <div className="row" key={tx.id}>
                  <div
                    className="row__avatar"
                    style={{
                      width: 36,
                      height: 36,
                      fontSize: 14,
                      background:
                        tx.type === "incoming"
                          ? "var(--primary-soft)"
                          : "var(--bg-elev-2)",
                      color:
                        tx.type === "incoming"
                          ? "var(--primary)"
                          : "var(--text-muted)",
                    }}
                  >
                    {tx.type === "incoming" ? (
                      <Download size={15} />
                    ) : (
                      <Upload size={15} />
                    )}
                  </div>
                  <div className="row__main">
                    <div className="row__title">
                      {tx.type === "incoming" ? "Received" : "Sent"}
                      {tx.state === "pending" && (
                        <span
                          className="pill pill--pending"
                          style={{ marginLeft: 4 }}
                        >
                          pending
                        </span>
                      )}
                    </div>
                    <div className="row__sub">
                      {tx.counterparty ? shortAddress(tx.counterparty) : "—"}
                    </div>
                  </div>
                  <div className="row__meta">
                    <span
                      className="mono"
                      style={{
                        color:
                          tx.type === "incoming"
                            ? "var(--primary)"
                            : "var(--text)",
                        fontSize: 13,
                      }}
                    >
                      {tx.type === "incoming" ? "+" : "−"}
                      {formatCCX(tx.amount)}
                    </span>
                    <span className="faint" style={{ fontSize: 11 }}>
                      {timeAgo(tx.timestamp)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Sheet
        open={sendOpen}
        title="Send CCX"
        onClose={() => setSendOpen(false)}
      >
        {wallet.locked ? (
          <div className="card card--pad-md center stack stack--gap-2">
            <Lock size={18} style={{ color: "var(--text-faint)" }} />
            <div className="muted">Unlock the wallet to send.</div>
            <button
              className="btn btn--sm btn--primary"
              onClick={() => wallet.unlock("")}
            >
              Unlock
            </button>
          </div>
        ) : (
          <SendSheet
            wallet={wallet}
            onSent={async () => {
              await wallet.refreshBalance();
              const t = await walletService.getTransactions();
              setTxs(t);
            }}
            onClose={() => setSendOpen(false)}
          />
        )}
      </Sheet>

      <Sheet
        open={receiveOpen}
        title="Receive CCX"
        onClose={() => setReceiveOpen(false)}
      >
        <ReceiveSheet address={wallet.address} />
      </Sheet>

      <BottomNav />
    </div>
  );
}
