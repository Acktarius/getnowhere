import { useEffect, useState } from "react";
import { createConcealAccount } from "@/services/conceal/ConcealWalletAdapter";
import { contactsPersistenceReady } from "@/services/contacts/contactsPersistence";
import { useContactsStore } from "@/state/contactsStore";

/**
 * Seeds demo contacts only on a brand-new install (no persisted contacts yet).
 * Once contacts have been saved or hydrated, this never re-fills an empty list.
 */
export function useSeedDemoContacts() {
  const contacts = useContactsStore((s) => s.contacts);
  const hydrated = useContactsStore((s) => s.hydrated);
  const addContact = useContactsStore((s) => s.addContact);
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (!hydrated || contacts.length > 0 || seeded) return;
    if (contactsPersistenceReady()) return;
    let cancelled = false;
    setSeeded(true);
    (async () => {
      try {
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
        });
      } catch {
        // WASM init or duplicate-seed race — silently skip.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contacts.length, addContact, seeded, hydrated]);
}
