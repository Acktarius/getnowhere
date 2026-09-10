import Image from "next/image";

const shots = [
  { file: "1.png", alt: "Landing — Create or import a Conceal wallet" },
  { file: "2.png", alt: "Chat — A room with a purpose and a lifetime" },
  { file: "3.png", alt: "Wallet — Send, receive, and history" },
] as const;

/** Phone screenshots from Fastlane store listing. */
export function Screenshots() {
  return (
    <div className="my-8 grid grid-cols-1 gap-6 sm:grid-cols-3">
      {shots.map((shot) => (
        <figure key={shot.file} className="m-0">
          <Image
            src={`/screenshots/${shot.file}`}
            alt={shot.alt}
            width={390}
            height={844}
            className="h-auto w-full rounded-xl border border-fd-border shadow-sm"
          />
          <figcaption className="mt-2 text-center text-sm text-fd-muted-foreground">
            {shot.alt}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
