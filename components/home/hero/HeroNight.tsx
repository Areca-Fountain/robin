import { StarsBackground } from "@/components/animate-ui/backgrounds/stars";

/**
 * The night sky. The hero is always dark, so there is no theme switch here
 * (the site does not use next-themes). Colours: deep navy at the horizon fading to black.
 */
export default function HeroNight() {
  return (
    <StarsBackground
      starColor="#fff"
      className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,#0d2347_0%,#050b1a_45%,#000_100%)]"
    />
  );
}
