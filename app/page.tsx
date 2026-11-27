import Hero from "@/components/home/hero/Hero";
import HomeSections from "@/components/home/sections/HomeSections";

export default function HomePage() {
  return (
    <main className="flex flex-col bg-black">
      <Hero />
      <HomeSections />
    </main>
  );
}
