import { NextResponse } from 'next/server'

export async function GET(req: Request, { params }: { params: Promise<{ did: string }> }) {
  const { did } = await params
  
  if (!did) {
    return NextResponse.json({ error: 'DID is required' }, { status: 400 })
  }

  await new Promise(r => setTimeout(r, 1000))
  
  const char = did.slice(-1)
  
  let status = 'ACTIVE'
  let hardwareOnline = true
  
  if (char === '1' || did.includes('pending')) {
    status = 'PENDING'
    hardwareOnline = Math.random() > 0.4 
  } else if (char === '2' || did.includes('suspended')) {
    status = 'SUSPENDED'
    hardwareOnline = false
  }

  return NextResponse.json({
    did,
    status,
    hardwareOnline,
    reputation: 98,
    firstReading: hardwareOnline ? new Date(Date.now() - 3600000).toISOString() : null,
    uptime30d: 99.9,
    recentReadings: [
      { timestamp: Date.now() - 5000, value: 25.4, type: 'temperature' },
      { timestamp: Date.now() - 15000, value: 25.5, type: 'temperature' },
      { timestamp: Date.now() - 25000, value: 25.8, type: 'temperature' },
      { timestamp: Date.now() - 35000, value: 25.3, type: 'temperature' },
      { timestamp: Date.now() - 45000, value: 25.6, type: 'temperature' },
    ],
    malamaEarnedToday: 80,
    malamaEarnedAllTime: 4200,
    lco2Batches: ['batch-8d9f1...', 'batch-8e4a2...'],
    marketsSettled: 12,
    health: {
      temperature: 42.5, 
      signalDb: -65,
      storageUsedPct: 15
    },
    lastError: status === 'SUSPENDED' ? 'ATECC608A I2C Timeout Validation Failure (Attempt 4)' : null
  })
}
