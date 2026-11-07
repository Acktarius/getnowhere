import { useContactsStore } from "@/state/contactsStore";
import { useSettingsStore } from "@/state/settingsStore";
import type { Contact } from "@/types/models";
import { ContactCategoryTagPills } from "./ContactCategoryTagPills";

type Props = { contact: Contact };

/** User category tags — local labels only, not room topics. */
export function ContactCategoryTagCard({ contact }: Props) {
  const updateContact = useContactsStore((s) => s.updateContact);
  const showTips = useSettingsStore((s) => s.showTips);

  return (
    <div className="card">
      <div className="card__title">Category</div>
      {showTips && (
        <p className="field__hint" style={{ marginBottom: 10 }}>
          Optional labels for organizing contacts — saved with your wallet
          backup. Select any that apply.
        </p>
      )}
      <ContactCategoryTagPills
        selected={contact.categoryTags ?? []}
        onChange={(categoryTags) =>
          updateContact(contact.id, {
            categoryTags: categoryTags.length > 0 ? categoryTags : undefined,
          })
        }
      />
    </div>
  );
}
