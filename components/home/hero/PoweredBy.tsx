import Image from "next/image";

const PARTNERS = [
  { name: "midnight", logo: "/logos/midnight.svg", logoSide: "left" },
  { name: "Cardano", logo: "/logos/cardano.svg", logoSide: "right" },
  { name: "Lace", logo: "/logos/lace.svg", logoSide: "left" },
] as const;

export default function PoweredBy() {
  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-sm tracking-wide text-slate-400 sm:text-base">Powered by</p>
      <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-3 sm:gap-x-6">
        {PARTNERS.map((p, i) => (
          <li key={p.name} className="flex items-center gap-5 sm:gap-6">
            {i > 0 && <span aria-hidden className="hidden h-7 w-px bg-white/35 sm:block" />}
            <span
              className={`flex items-center gap-2.5 text-xl font-medium text-white sm:text-2xl ${
                p.logoSide === "right" ? "flex-row-reverse" : ""
              }`}
            >
              <Image src={p.logo} alt="" width={32} height={32} unoptimized className="size-7 sm:size-8" />
              {p.name}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
