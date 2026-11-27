import Image from "next/image";
import GlowBadge from "./GlowBadge";
import HeroNight from "./HeroNight";
import ParallaxLayer from "./ParallaxLayer";
import PoweredBy from "./PoweredBy";

/**
 * Home page hero. Layers, back to front:
 *   1. night sky + stars   (slowest on scroll)
 *   2. headline / badge    (slower than the page, fades out)
 *   3. mountain            (closest, moves almost with the page, grows slightly)
 *   4. horizon mist
 * The navbar floats over it (Navbar is `fixed` on "/").
 */
export default function Hero() {
  return (
    <section
      data-parallax-root
      className="relative isolate min-h-[max(100svh,640px)] overflow-hidden bg-black"
    >
      {/* 1. sky */}
      <ParallaxLayer speed={0.5} className="absolute inset-0 -z-10">
        <HeroNight />
      </ParallaxLayer>

      {/* soft blue glow behind the headline */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[18%] -z-10 h-[40vmin] w-[80vmin] -translate-x-1/2 rounded-full bg-sky-500/10 blur-[90px]"
      />

      {/* 2. text */}
      <ParallaxLayer
        speed={0.35}
        fade={1.3}
        className="relative z-10 mx-auto flex min-h-[max(100svh,640px)] max-w-6xl flex-col items-center px-4 pb-24 pt-[clamp(7.5rem,21svh,16rem)] text-center"
      >
        <h1 className="text-[clamp(2.6rem,10.4vw,9.25rem)] font-bold leading-[0.98] tracking-[-0.045em]">
          <span className="-mx-[0.1em] -mb-[0.22em] block overflow-hidden">
            <span
              className="anim-line px-[0.1em] pb-[0.22em] bg-gradient-to-b from-white via-neutral-200 to-neutral-400 bg-clip-text text-transparent"
              style={{ "--delay": "0.15s" } as React.CSSProperties}
            >
              Introducing
            </span>
          </span>
          <span className="-mx-[0.1em] -mb-[0.22em] block overflow-hidden">
            <span
              className="anim-line whitespace-nowrap px-[0.1em] pb-[0.22em] bg-gradient-to-b from-white via-neutral-200 to-neutral-400 bg-clip-text text-transparent"
              style={{ "--delay": "0.3s" } as React.CSSProperties}
            >
              Private Letters
            </span>
          </span>
        </h1>

        <div
          className="anim-rise mt-[clamp(1.75rem,6svh,4rem)] max-w-full"
          style={{ "--delay": "0.75s" } as React.CSSProperties}
        >
          <GlowBadge href="#get-started">Experience the End of PDF Service Letters Era</GlowBadge>
        </div>

        <div className="anim-rise mt-8 sm:mt-10" style={{ "--delay": "0.95s" } as React.CSSProperties}>
          <PoweredBy />
        </div>
      </ParallaxLayer>

      {/* 3. mountain */}
      <ParallaxLayer
        speed={0.12}
        grow={0.08}
        origin="50% 100%"
        className="pointer-events-none absolute inset-x-0 bottom-0 z-[5]"
      >
        <div className="anim-mountain flex justify-center">
          <Image
            src="/images/mountain.webp"
            alt=""
            width={1249}
            height={700}
            priority
            sizes="100vw"
            className="h-auto w-[max(118%,980px)] max-w-none shrink-0"
          />
        </div>
      </ParallaxLayer>

      {/* 4. mist at the horizon */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-[6] h-[28%] bg-gradient-to-t from-sky-300/25 via-sky-700/10 to-transparent"
      />
    </section>
  );
}