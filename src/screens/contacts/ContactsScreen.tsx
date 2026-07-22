import { Search, UserPlus, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BottomNav } from "@/components/BottomNav";
import { ContactCard } from "@/components/ContactCard";
import { EmptyState } from "@/components/EmptyState";
import { TopBar } from "@/components/TopBar";
import { AddContactSheet } from "@/screens/contacts/AddContactSheet";
import { useContactsStore } from "@/state/contactsStore";
import { useWalletStore } from "@/state/walletStore";
import type { RelationshipStatus } from "@/types/models";

const FILTERS: { value: "all" | RelationshipStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "eligible", label: "Eligible" },
  { value: "archived", label: "Archived" },
  { value: "blocked", label: "Blocked" },
];

export function ContactsScreen() {
  const navigate = useNavigate();
  const contacts = useContactsStore((s) => s.contacts);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | RelationshipStatus>("all");
  const [adding, setAdding] = useState(false);
  const initialized = useWalletStore((s) => s.initialized);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contacts
      .filter((c) =>
        filter === "all" ? true : c.relationshipStatus === filter,
      )
      .filter((c) =>
        q
          ? c.alias.toLowerCase().includes(q) ||
            c.ccxAddress.toLowerCase().includes(q)
          : true,
      )
      .sort((a, b) =>
        (b.lastInteractionAt ?? b.updatedAt).localeCompare(
          a.lastInteractionAt ?? a.updatedAt,
        ),
      );
  }, [contacts, query, filter]);

  return (
    <div className="screen">
      <TopBar
        title="Contacts"
        subtitle={initialized ? undefined : "Wallet not initialized"}
        trailing={
          <button
            className="topbar__icon-btn"
            onClick={() => setAdding(true)}
            aria-label="Add contact"
          >
            <UserPlus size={18} />
          </button>
        }
        bordered
      />
      <div className="screen-scroll">
        <div className="section" style={{ paddingTop: 12 }}>
          <div style={{ position: "relative" }}>
            <Search
              size={16}
              style={{
                position: "absolute",
                left: 14,
                top: 12,
                color: "var(--text-faint)",
              }}
            />
            <input
              className="input"
              style={{ paddingLeft: 38 }}
              placeholder="Search alias or address"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="section" style={{ paddingTop: 12 }}>
          <div
            className="row-flex"
            style={{ gap: 6, overflowX: "auto", paddingBottom: 4 }}
          >
            {FILTERS.map((f) => (
              <button
                key={f.value}
                className={`btn btn--sm btn--pill no-shrink ${filter === f.value ? "btn--primary" : "btn--secondary"}`}
                onClick={() => setFilter(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="section" style={{ paddingTop: 16 }}>
          {filtered.length === 0 ? (
            contacts.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No contacts yet"
                body="Add a counterpart by their Conceal address and exchange payment IDs to establish a private relationship."
                action={
                  <button
                    className="btn btn--primary btn--sm"
                    onClick={() => setAdding(true)}
                  >
                    <UserPlus size={15} /> Add first contact
                  </button>
                }
              />
            ) : (
              <EmptyState
                icon={Users}
                title="No matches"
                body="Try a different search or filter."
              />
            )
          ) : (
            <div className="card card--flush stagger">
              {filtered.map((c) => (
                <ContactCard key={c.id} contact={c} />
              ))}
            </div>
          )}
        </div>
      </div>

      <AddContactSheet
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={(id) => {
          setAdding(false);
          navigate(`/contacts/${id}`);
        }}
      />
      <BottomNav />
    </div>
  );
}
