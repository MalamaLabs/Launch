import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { evmAddress, cardanoAddress, hexId } = body

    if (!evmAddress || !cardanoAddress || !hexId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    
    await new Promise(r => setTimeout(r, 2500))

    return NextResponse.json({ 
      success: true,
      genesisNumber: 247,
      transactionHash: '0xmock123hash456789abc...',
      message: 'Genesis node reserved successfully.'
    })
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    remaining: 53,
    total: 300,
    priceUSDC: 1500
  })
}
