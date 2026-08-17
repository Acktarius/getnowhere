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
import { useNavNotificationBadges } from "@/hooks/useNavNotificationBadges";
import { useSettingsStore } from "@/state/settingsStore";
import { useWalletStore } from "@/state/walletStore";
import { formatCCX, shortAddress, timeAgo } from "@/utils/format";

export function WalletScreen() {
  const initialized = useWalletStore((s) => s.initialized);
  const address = useWalletStore((s) => s.address);
  const network = useWalletStore((s) => s.network);
  const locked = useWalletStore((s) => s.locked);
  const syncStatus = useWalletStore((s) => s.syncStatus);
  const lastSyncError = useWalletStore((s) => s.lastSyncError);
  const balanceTotal = useWalletStore((s) => s.balanceTotal);
  const balanceAvailable = useWalletStore((s) => s.balanceAvailable);
  const balancePending = useWalletStore((s) => s.balancePending);
  const transactions = useWalletStore((s) => s.transactions);
  const transactionsLoading = useWalletStore((s) => s.transactionsLoading);
  const refreshTransactions = useWalletStore((s) => s.refreshTransactions);
  const refreshBalance = useWalletStore((s) => s.refreshBalance);
  const resync = useWalletStore((s) => s.resync);
  const lock = useWalletStore((s) => s.lock);
  const unlock = useWalletStore((s) => s.unlock);
  const navBadges = useNavNotificationBadges();
  const hideBalances = useSettingsStore((s) => s.privacy.hideBalancesByDefault);
  const [sendOpen, setSendOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [expandedTxId, setExpandedTxId] = useState<string | null>(null);
  const [copied, copy] = useCopy();

  useEffect(() => {
    if (!initialized) return;
    if (transactions.length === 0 && !transactionsLoading) {
      void refreshTransactions();
    }
  }, [
    initialized,
    transactions.length,
    transactionsLoading,
    refreshTransactions,
  ]);

  if (!initialized) {
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
        <BottomNav {...navBadges} />
      </div>
    );
  }

  return (
    <div
      className="screen"
      style={{ height: "100dvh", maxHeight: "100dvh", overflow: "hidden" }}
    >
      <TopBar
        title="Wallet"
        subtitle={network}
        trailing={
          <button
            className="topbar__icon-btn"
            onClick={() => resync()}
            aria-label="Resync"
          >
            <RefreshCw
              size={17}
              className={syncStatus === "syncing" ? "spin" : ""}
            />
          </button>
        }
        bordered
      />
      <div
        className="stack stack--gap-4"
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          padding: "16px 16px 0",
        }}
      >
        <div className="stack stack--gap-4" style={{ flexShrink: 0 }}>
          {syncStatus === "error" && lastSyncError && (
            <div
              className="card"
              style={{
                borderColor: "var(--danger)",
                background: "var(--danger-soft)",
                padding: "12px 14px",
              }}
            >
              <div
                className="row"
                style={{ padding: 0, alignItems: "flex-start", gap: 10 }}
              >
                <RefreshCw
                  size={16}
                  style={{
                    color: "var(--danger)",
                    marginTop: 1,
                    flexShrink: 0,
                  }}
                />
                <div className="grow stack" style={{ gap: 4 }}>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: 13.5,
                      color: "var(--danger)",
                    }}
                  >
                    Sync failed
                  </div>
                  <div
                    className="mono"
                    style={{
                      fontSize: 11.5,
                      color: "var(--text-muted)",
                      wordBreak: "break-word",
                    }}
                  >
                    {lastSyncError}
                  </div>
                </div>
                <button
                  className="btn btn--sm btn--ghost"
                  style={{ flexShrink: 0 }}
                  onClick={() => resync()}
                >
                  Retry
                </button>
              </div>
            </div>
          )}
          <div className="fade-in-up">
            <WalletBalanceCard
              wallet={{
                balanceTotal,
                balanceAvailable,
                balancePending,
                syncStatus,
                locked,
              }}
              hideByDefault={hideBalances}
              onResync={() => resync()}
              onToggleLock={() => lock()}
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
              disabled={locked}
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
                onClick={() => copy(address)}
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
              {address}
            </div>
          </div>

          <div className="section" style={{ padding: 0 }}>
            <div className="section__head" style={{ padding: 0 }}>
              <span className="section__title">History</span>
            </div>
          </div>
        </div>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            paddingBottom: 32,
          }}
        >
          {transactionsLoading ? (
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
          ) : transactions.length === 0 ? (
            <EmptyState
              title="No transactions yet"
              body="Incoming and outgoing CCX transfers will appear here."
            />
          ) : (
            <div className="card card--flush stagger">
              {transactions.map((tx) => {
                const open = expandedTxId === tx.id;
                return (
                  <div key={tx.id} className="tx-row">
                    <button
                      type="button"
                      className="row row--clickable tx-row__main"
                      onClick={() => setExpandedTxId(open ? null : tx.id)}
                      aria-expanded={open}
                    >
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
                          {tx.contactHint && (
                            <span
                              role="img"
                              className={[
                                "tx-contact-dot",
                                `tx-contact-dot--${tx.contactHint.action}`,
                                tx.zeroConf ? "tx-contact-dot--zeroconf" : "",
                              ]
                                .filter(Boolean)
                                .join(" ")}
                              title={
                                tx.contactHint.action === "create"
                                  ? "Contact create"
                                  : tx.contactHint.action === "register"
                                    ? "Contact register"
                                    : "Contact revoke"
                              }
                              aria-label={
                                tx.contactHint.action === "create"
                                  ? "Contact create"
                                  : tx.contactHint.action === "register"
                                    ? "Contact register"
                                    : "Contact revoke"
                              }
                            />
                          )}
                          {tx.kind === "miner"
                            ? "Miner reward"
                            : tx.kind === "deposit"
                              ? "Deposit"
                              : tx.kind === "withdrawal"
                                ? "Withdrawal"
                                : tx.kind === "fusion"
                                  ? "Optimization"
                                  : tx.type === "incoming"
                                    ? "Received"
                                    : "Sent"}
                          {tx.state === "pending" && (
                            <span
                              className="pill pill--pending"
                              style={{ marginLeft: 4 }}
                            >
                              pending
                            </span>
                          )}
                          {tx.zeroConf && (
                            <span
                              className="pill pill--zeroconf"
                              style={{ marginLeft: 4 }}
                              title="Mempool preview — not final"
                            >
                              0-conf
                            </span>
                          )}
                        </div>
                        <div className="row__sub">
                          {tx.counterparty
                            ? shortAddress(tx.counterparty)
                            : "—"}
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
                    </button>
                    {open && tx.hash && (
                      <div className="tx-row__detail">
                        <span className="faint" style={{ fontSize: 11 }}>
                          txHash
                        </span>
                        <button
                          type="button"
                          className="tx-row__hash mono"
                          onClick={() => copy(tx.hash)}
                          title="Copy transaction hash"
                        >
                          {tx.hash}
                          {copied ? " · copied" : ""}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <Sheet
        open={sendOpen}
        title="Send CCX"
        onClose={() => setSendOpen(false)}
      >
        {locked ? (
          <div className="card card--pad-md center stack stack--gap-2">
            <Lock size={18} style={{ color: "var(--text-faint)" }} />
            <div className="muted">Unlock the wallet to send.</div>
            <button
              className="btn btn--sm btn--primary"
              onClick={() => unlock("")}
            >
              Unlock
            </button>
          </div>
        ) : (
          <SendSheet
            wallet={{ balanceAvailable, address }}
            onSent={async () => {
              await refreshBalance();
              await refreshTransactions();
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
        <ReceiveSheet address={address} />
      </Sheet>

      <BottomNav {...navBadges} />
    </div>
  );
}
