import type { Metadata } from 'next'
import './sensors.css'
import HeroSection from '@/components/sensors/HeroSection'
import SpecTicker from '@/components/sensors/SpecTicker'
import UseCasesSection from '@/components/sensors/UseCasesSection'
import FeaturesSection from '@/components/sensors/FeaturesSection'
import ProductShowcase from '@/components/sensors/ProductShowcase'
import TechSection from '@/components/sensors/TechSection'
import SpecsSection from '@/components/sensors/SpecsSection'
import SystemSection from '@/components/sensors/SystemSection'
import DeploymentMap from '@/components/sensors/DeploymentMap'
import StatsSection from '@/components/sensors/StatsSection'
import CTASection from '@/components/sensors/CTASection'

export const metadata: Metadata = {
  title: 'Mālama Sensor Systems | Hardware-Signed Environmental Data',
  description:
    'Solar-powered environmental monitoring sensors with dual-radio (LoRa + NB-IoT) connectivity. Soil, atmosphere, and remote sensing — built for the harshest conditions.',
}

// "Obsidian Precision" sensor product landing. Now rendered inside the global
// Mālama nav/footer (see ChromeGate) so it's part of one connected site — the
// "Sensors" dropdown in the main nav links to the section anchors below.
export default function SensorsPage() {
  return (
    <div style={{ background: '#0a0a0a', color: '#f5f5f5' }}>
      <HeroSection />
      <SpecTicker />
      <UseCasesSection />
      <FeaturesSection />
      <ProductShowcase />
      <TechSection />
      <SpecsSection />
      <SystemSection />
      <DeploymentMap />
      <StatsSection />
      <CTASection />
    </div>
  )
}
