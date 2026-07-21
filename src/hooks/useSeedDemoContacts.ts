import { useEffect, useState } from "react";
import { createConcealAccount } from "@/services/conceal/ConcealWalletAdapter";
import { useContactsStore } from "@/state/contactsStore";

// Seeds a couple of demo contacts with REAL CCX addresses (generated via
// the SDK's createAccount) so the home screen isn't empty on first run.
// Real app starts with no contacts.
export function useSeedDemoContacts() {
  const contacts = useContactsStore((s) => s.contacts);
  const addContact = useContactsStore((s) => s.addContact);
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (contacts.length > 0 || seeded) return;
    let cancelled = false;
    setSeeded(true);
    (async () => {
      try {
        // Generate real CCX addresses via the SDK (WASM). We only use the
        // address, discarding the keys — these are demo counterparties.
        const [acctA, acctB] = await Promise.all([
          createConcealAccount("english"),
          createConcealAccount("english"),
        ]);
        if (cancelled) return;
        await addContact({
          alias: "Cipher",
          ccxAddress: acctA.address,
          paymentIdFrom:
            "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
          paymentIdTo:
            "0f1e2d3c4b5a6978f1e2d3c4b5a6978f1e2d3c4b5a6978f1e2d3c4b5a6978f1e",
          notes: "Met on the Conceal testnet.",
        });
        if (cancelled) return;
        await addContact({
          alias: "Harbor",
          ccxAddress: acctB.address,
          paymentIdFrom:
            "11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff",
          // paymentIdTo intentionally missing — shows the pending edge state.
        });
      } catch {
        // WASM init or duplicate-seed race — silently skip.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contacts.length, addContact, seeded]);
}
