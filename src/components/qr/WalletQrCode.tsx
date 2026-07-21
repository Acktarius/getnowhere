/**
 * Branded QR tile — gold Conceal mark for addresses, grey for payment IDs.
 * Ports conceal-next-wallet WalletQrCode + contact-expand logo pairing.
 */
import { DottedQrCode } from "@/components/qr/DottedQrCode";

const base = import.meta.env.BASE_URL;

/** Gold / orange Conceal mark — use for CCX address (and payment URI) QRs. */
export const QR_LOGO_ADDRESS = `${base}brand/conceal-mark-orange.svg`;
/** Grey / steel Conceal mark — use for raw payment-ID QRs. */
export const QR_LOGO_PAYMENT_ID = `${base}brand/conceal-mark.svg`;

export type WalletQrKind = "address" | "paymentId";

export function WalletQrCode({
  value,
  size = 180,
  kind = "address",
  logoSrc,
  className,
  /**
   * Stretch to ≥85% of the app screen width.
   * Default on — display QRs need to be large enough to scan.
   */
  wide = true,
}: {
  value: string;
  size?: number;
  /** Selects gold (address) vs grey (payment ID) logo when logoSrc is omitted. */
  kind?: WalletQrKind;
  logoSrc?: string;
  className?: string;
  wide?: boolean;
}) {
  const resolvedLogo =
    logoSrc ?? (kind === "paymentId" ? QR_LOGO_PAYMENT_ID : QR_LOGO_ADDRESS);

  return (
    <div
      className={[wide ? "wallet-qr wallet-qr--wide" : "wallet-qr", className]
        .filter(Boolean)
        .join(" ")}
    >
      <DottedQrCode
        value={value}
        size={size}
        fill={wide}
        fgColor="#171513"
        bgColor="#ffffff"
        logoSrc={resolvedLogo}
      />
    </div>
  );
}
