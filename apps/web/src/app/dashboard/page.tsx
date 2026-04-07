import { ShieldCheck, Network, Cpu, TrendingUp, Award, CheckCircle2, Lock, ChevronRight, Activity, MapPin } from 'lucide-react'

export default function Dashboard() {
  const currentStatus = "Authorized" // Mock State: Identified -> Authorized -> Enabled
  const hexes = ["85289493fffffff"]
  const dataSubscribers = 340 // Need 1000 to enable Level 2

  const levels = [
    { title: "Level 1: Network Growth", desc: "Acquire 1,000 active subscribers to achieve Enablement.", active: true, icon: Network },
    { title: "Level 2: Network Planning", desc: "Identify Host locations and scan coverage gaps.", active: false, icon: MapPin },
    { title: "Level 3: Infrastructure Enablement", desc: "Coordinate deployment of 1 physical AirNode.", active: false, icon: Cpu },
    { title: "Level 4: Network Deployment", desc: "Bring infrastructure online and stabilize tracking.", active: false, icon: Activity },
    { title: "Level 5: Market Leadership", desc: "Achieve 10% market share to unlock Master Builder.", active: false, icon: TrendingUp },
  ]

  return (
    <div className="min-h-screen bg-black text-gray-200 p-6 md:p-12 font-sans selection:bg-malama-teal selection:text-black">
      
      {/* Header */}
      <header className="max-w-6xl mx-auto flex items-center justify-between border-b border-gray-800 pb-8 mb-10">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tighter">Command Center</h1>
          <p className="text-malama-teal font-mono mt-1 text-sm">{hexes.length} Active Nodes Managed</p>
        </div>
        <div className="flex space-x-3 items-center">
          <div className="text-right mr-3 hidden sm:block">
            <p className="text-xs text-gray-500 font-bold uppercase tracking-widest">Network Status</p>
            <p className="text-white font-bold text-lg">{currentStatus}</p>
          </div>
          <div className="w-12 h-12 bg-malama-deep border border-malama-teal/30 rounded-full flex items-center justify-center shadow-[0_0_15px_rgba(68,187,164,0.2)]">
            <ShieldCheck className="text-malama-teal w-6 h-6" />
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Progress & Status */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Status Tracker */}
          <section className="bg-malama-card border border-gray-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-malama-teal to-blue-600"></div>
            <h2 className="text-xl font-bold text-white mb-6 uppercase tracking-wider">Level 1 Enablement Track</h2>
            
            <div className="flex flex-col md:flex-row justify-between mb-8 relative">
              <div className="absolute top-1/2 left-0 w-full h-1 bg-gray-800 -z-10 hidden md:block"></div>
              {/* Tracker Nodes */}
              <div className="flex flex-col items-center bg-malama-card p-2 z-10">
                <CheckCircle2 className="w-10 h-10 text-malama-teal mb-2 bg-malama-card rounded-full" />
                <span className="font-bold text-white">Identified</span>
                <span className="text-xs text-gray-500 mt-1">KYC Initialized</span>
              </div>
              <div className="flex flex-col items-center bg-malama-card p-2 z-10">
                <div className="w-10 h-10 rounded-full border-4 border-malama-teal flex items-center justify-center bg-malama-teal/20 mb-2">
                  <div className="w-3 h-3 bg-malama-teal rounded-full animate-pulse"></div>
                </div>
                <span className="font-bold text-malama-teal">Authorized</span>
                <span className="text-xs text-malama-teal/70 mt-1">Building Demand</span>
              </div>
              <div className="flex flex-col items-center bg-malama-card p-2 z-10 opacity-40">
                <Lock className="w-10 h-10 text-gray-600 mb-2 bg-malama-card" />
                <span className="font-bold text-gray-400">Enabled</span>
                <span className="text-xs text-gray-500 mt-1">Unlock Rewards</span>
              </div>
            </div>

            <div className="bg-malama-deep p-6 rounded-2xl border border-gray-800">
               <div className="flex justify-between items-end mb-4">
                 <div>
                   <h3 className="font-bold text-gray-300">Subscriber Acquisition</h3>
                   <p className="text-sm text-gray-500">Reach 1,000 active subs to achieve Enablement.</p>
                 </div>
                 <div className="text-right text-malama-teal font-mono text-xl">{dataSubscribers}<span className="text-gray-500 text-sm">/1000</span></div>
               </div>
               <div className="w-full h-3 bg-gray-900 rounded-full overflow-hidden">
                 <div className="h-full bg-malama-teal rounded-full" style={{ width: `${(dataSubscribers/1000)*100}%` }}></div>
               </div>
               <button className="mt-5 w-full py-3 bg-white text-black rounded-lg font-black text-sm hover:bg-gray-200 transition-colors">
                 Get My Affiliate Link
               </button>
            </div>
          </section>

          {/* Core Progression Path */}
          <section className="space-y-4">
            <h2 className="text-xl font-bold text-white ml-2">Network Builder Progression</h2>
            <div className="space-y-3">
              {levels.map((lvl, idx) => (
                <div key={idx} className={`p-6 rounded-2xl border flex items-center transition-all ${lvl.active ? 'bg-malama-card border-malama-teal/40 shadow-[0_0_20px_rgba(68,187,164,0.05)]' : 'bg-gray-900/40 border-gray-800 opacity-60 grayscale'}`}>
                  <div className={`w-14 h-14 rounded-full flex items-center justify-center mr-5 flex-shrink-0 ${lvl.active ? 'bg-malama-teal/10' : 'bg-gray-800'}`}>
                    <lvl.icon className={`w-6 h-6 ${lvl.active ? 'text-malama-teal' : 'text-gray-500'}`} />
                  </div>
                  <div className="flex-1">
                    <h3 className={`font-bold text-lg ${lvl.active ? 'text-white' : 'text-gray-400'}`}>{lvl.title}</h3>
                    <p className="text-sm text-gray-500 mt-1">{lvl.desc}</p>
                  </div>
                  {lvl.active ? (
                    <ChevronRight className="w-6 h-6 text-malama-teal ml-4" />
                  ) : (
                    <Lock className="w-6 h-6 text-gray-600 ml-4" />
                  )}
                </div>
              ))}
            </div>
          </section>

        </div>

        {/* Right Column: Earnings & Stats */}
        <div className="space-y-8">
          
          <section className="bg-malama-card border border-gray-800 rounded-3xl p-8 shadow-xl">
            <div className="flex items-center space-x-3 mb-6">
              <Award className="w-8 h-8 text-malama-amber" />
              <h2 className="text-xl font-bold text-white uppercase">Projected Rewards</h2>
            </div>
            
            <div className="space-y-6">
              <div>
                <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-1">Subscription Revenue</p>
                <p className="text-3xl font-mono font-black text-white">$0.00 <span className="text-sm text-gray-500">/mo</span></p>
              </div>
              <div className="h-px bg-gray-800 w-full"></div>
              <div>
                <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-1">Affiliate Bounties</p>
                <p className="text-3xl font-mono font-black text-white">${dataSubscribers * 60} <span className="text-sm text-gray-500">Total</span></p>
              </div>
              <div className="h-px bg-gray-800 w-full"></div>
              <div>
                <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-1">Hardware Commisions</p>
                <p className="text-3xl font-mono font-black text-white">0% <span className="text-sm text-gray-500">12.5% at Lvl 3</span></p>
              </div>
            </div>

            <div className="mt-8 p-4 bg-malama-amber/10 border border-malama-amber/30 rounded-xl">
              <p className="text-xs text-malama-amber/90 font-bold leading-relaxed">
                Reach <span className="text-malama-amber">Enabled</span> Status to begin unlocking real-time $MALAMA emissions and hardware deployment rights.
              </p>
            </div>
          </section>

          {/* Active Hexes List */}
          <section className="bg-malama-card border border-gray-800 rounded-3xl p-8 shadow-xl">
            <h2 className="text-lg font-bold text-gray-300 mb-4">Your Territories</h2>
            <div className="space-y-3">
              {hexes.map(hex => (
                <div key={hex} className="p-4 bg-malama-deep border border-gray-700 rounded-xl flex items-center justify-between group hover:border-malama-teal transition-colors cursor-pointer">
                  <div className="flex items-center space-x-3">
                    <MapPin className="w-5 h-5 text-gray-500 group-hover:text-malama-teal transition-colors" />
                    <span className="font-mono text-gray-300 group-hover:text-white transition-colors">{hex}</span>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-600 group-hover:text-malama-teal" />
                </div>
              ))}
            </div>
          </section>

        </div>
      </div>
    </div>
  )
}
