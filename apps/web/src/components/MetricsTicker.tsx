'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Activity, Radio, Coins, Database, Zap } from 'lucide-react'

export default function MetricsTicker() {
  const [metrics, setMetrics] = useState({
    activeNodes: 142,
    readingsToday: 24508,
    marketsSettled: 48,
    lco2Minted: 12500,
    malamaPrice: 0.124
  })

  useEffect(() => {
    const interval = setInterval(() => {
      setMetrics(prev => ({
        activeNodes: prev.activeNodes + (Math.random() > 0.8 ? 1 : 0),
        readingsToday: prev.readingsToday + Math.floor(Math.random() * 5),
        marketsSettled: prev.marketsSettled,
        lco2Minted: prev.lco2Minted + Math.floor(Math.random() * 10),
        malamaPrice: prev.malamaPrice + (Math.random() * 0.002 - 0.001)
      }))
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay: 0.6 }}
      className="flex flex-wrap justify-center gap-4 mt-8"
    >
      <MetricItem icon={<Radio className="w-4 h-4 text-malama-teal" />} label="Active Nodes" value={metrics.activeNodes} />
      <MetricItem icon={<Activity className="w-4 h-4 text-malama-amber" />} label="Readings Today" value={metrics.readingsToday.toLocaleString()} />
      <MetricItem icon={<Database className="w-4 h-4 text-blue-400" />} label="LCO2 Minted" value={metrics.lco2Minted.toLocaleString() + " kg"} />
      <MetricItem icon={<Zap className="w-4 h-4 text-yellow-400" />} label="Markets Settled" value={metrics.marketsSettled} />
      <MetricItem icon={<Coins className="w-4 h-4 text-green-400" />} label="$MALAMA" value={"$" + Math.max(0.01, metrics.malamaPrice).toFixed(3)} />
    </motion.div>
  )
}

function MetricItem({ icon, label, value }: { icon: React.ReactNode, label: string, value: string | number }) {
  return (
    <div className="flex items-center space-x-3 bg-malama-card/50 backdrop-blur-sm border border-gray-800/50 px-5 py-3 rounded-full">
      {icon}
      <span className="text-gray-400 text-sm font-medium">{label}:</span>
      <AnimatePresence mode="popLayout">
        <motion.span 
          key={value}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          className="text-white font-bold font-mono text-sm"
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </div>
  )
}
