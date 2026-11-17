import {
  needsRelationshipFuel,
  RELATIONSHIP_FUEL_HINT,
} from "@/lib/wallet/relationship-fuel";
import type { WalletState } from "@/types/models";

type Props = {
  balanceCcx: number;
  syncStatus: WalletState["syncStatus"];
};

/** Shown once sync has settled and the balance cannot fund one on-chain message. */
export function RelationshipFuelHint({ balanceCcx, syncStatus }: Props) {
  if (syncStatus !== "synced") return null;
  if (!needsRelationshipFuel(balanceCcx)) return null;
  return (
    <div className="card" role="status" style={{ padding: "12px 14px" }}>
      <p
        className="muted"
        style={{ fontSize: 13.5, lineHeight: 1.45, margin: 0 }}
      >
        {RELATIONSHIP_FUEL_HINT}
      </p>
    </div>
  );
}
