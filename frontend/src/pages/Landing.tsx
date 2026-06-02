"use client";

import { LandingNav } from "@/components/landing/LandingNav";
import { HeroSection } from "@/components/landing/HeroSection";
import { MetricsBar } from "@/components/landing/MetricsBar";
import { FeatureGrid } from "@/components/landing/FeatureGrid";
import { PerformanceChart } from "@/components/landing/PerformanceChart";
import { FinalCta } from "@/components/landing/FinalCta";
import { Footer } from "@/components/landing/Footer";

const Landing = () => {
  return (
    <div className="relative min-h-[100dvh] overflow-x-hidden bg-zinc-950 text-white">
      <LandingNav />
      <HeroSection />
      <MetricsBar />
      <FeatureGrid />
      <PerformanceChart />
      <FinalCta />
      <Footer />
    </div>
  );
};

export default Landing;
