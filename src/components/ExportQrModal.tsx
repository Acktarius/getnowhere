import { WalletQrCode } from "@/components/qr/WalletQrCode";
import { useSecretsModalTimer } from "@/hooks/useSecretsModalTimer";

type Props = {
  open: boolean;
  uri: string;
  onClose: () => void;
};

/** Timed export-QR dialog: QR only; Need more time / auto-close. */
export function ExportQrModal({ open, uri, onClose }: Props) {
  const { needMoreEnabled, needMoreOpacity, requestMoreTime, fadeMs } =
    useSecretsModalTimer({ open, onClose });

  if (!open) return null;

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal__panel">
          <h3 style={{ fontSize: 17, marginBottom: 8 }}>Export QR</h3>
          <WalletQrCode value={uri} />
          <div
            className="row-flex"
            style={{ marginTop: 20, gap: 8, flexWrap: "wrap" }}
          >
            <button
              type="button"
              className="btn btn--primary"
              onClick={onClose}
            >
              Got it
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              disabled={!needMoreEnabled}
              style={{
                opacity: needMoreOpacity,
                transition: `opacity ${fadeMs}ms linear`,
              }}
              onClick={requestMoreTime}
            >
              Need more time
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
