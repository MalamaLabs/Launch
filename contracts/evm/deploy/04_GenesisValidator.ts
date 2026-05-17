import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, network } = hre
  const { deploy, get } = deployments
  const { deployer } = await getNamedAccounts()

  console.log(`\n🚀 Deploying GenesisValidator on ${network.name}`)
  console.log(`   Deployer: ${deployer}`)

  // ── Payment token ─────────────────────────────────────────────────────────
  // Testnet: MockUSDC (deployed by 00_MockUSDC.ts)
  // Mainnet: real Circle USDC on Base — MUST match contract.paymentToken()
  //          Set BASE_USDC_ADDRESS env to override if you redeploy to a different address.
  let usdcAddress: string
  if (network.name === 'baseSepolia' || network.name === 'hardhat' || network.name === 'localhost') {
    const mockUsdc = await get('MockUSDC')
    usdcAddress = mockUsdc.address
    console.log(`   MockUSDC: ${usdcAddress}`)
  } else {
    // Base Mainnet Circle USDC — 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
    // Override via BASE_USDC_ADDRESS if your GenesisValidator contract was
    // deployed against a different address (e.g. bridged USDC.e).
    usdcAddress = process.env.BASE_USDC_ADDRESS || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
    console.log(`   USDC (mainnet): ${usdcAddress}`)
  }

  // ── Treasury ──────────────────────────────────────────────────────────────
  const treasury = process.env.TREASURY_ADDRESS
  if (!treasury) {
    throw new Error('TREASURY_ADDRESS env var is required — do not default to deployer on mainnet')
  }

  // ── Mint price ────────────────────────────────────────────────────────────
  // $2,000 USDC — 6 decimals → 2_000_000_000
  // Override via HEX_PRICE_USDC_UNITS for testing (e.g. HEX_PRICE_USDC_UNITS=1000000 = $1)
  const mintPrice = process.env.HEX_PRICE_USDC_UNITS
    ? BigInt(process.env.HEX_PRICE_USDC_UNITS)
    : 2_000_000_000n

  // ── Base URI ──────────────────────────────────────────────────────────────
  // Fallback for tokens that don't yet have a per-token IPFS URI.
  // Points at the dagwelldev-api image endpoint; tokenId is appended at read time.
  // Example: https://api.dagwelldev.com/hexes/nft-image/42
  const baseURI = process.env.NFT_BASE_URI || 'https://api.dagwelldev.com/hexes/nft-image/'

  console.log(`   Treasury:  ${treasury}`)
  console.log(`   MintPrice: ${mintPrice} (USDC base units)`)
  console.log(`   BaseURI:   ${baseURI}`)

  const result = await deploy('GenesisValidator', {
    from: deployer,
    args: [usdcAddress, treasury, mintPrice, baseURI],
    log: true,
    waitConfirmations: network.name === 'baseSepolia' ? 2 : 5,
  })

  if (!result.newlyDeployed) {
    console.log(`\nℹ️  GenesisValidator already deployed at ${result.address} — skipped`)
    return
  }

  console.log(`\n✅ GenesisValidator deployed: ${result.address}`)
  console.log(`\nAdd to your .env:`)
  console.log(`GENESIS_VALIDATOR_ADDRESS_${network.name.toUpperCase()}=${result.address}`)
  if (network.name === 'baseSepolia') {
    console.log(`USDC_ADDRESS_SEPOLIA=${usdcAddress}`)
  }

  // ── Basescan verification ─────────────────────────────────────────────────
  if (process.env.BASESCAN_API_KEY) {
    // Pause a moment — Basescan indexer needs a few seconds after deployment
    await new Promise(r => setTimeout(r, 10_000))
    try {
      await hre.run('verify:verify', {
        address: result.address,
        constructorArguments: [usdcAddress, treasury, mintPrice, baseURI],
      })
      console.log('✅ Contract verified on Basescan')
    } catch (e: any) {
      console.warn('⚠️  Verification failed (may already be verified):', e.message)
    }
  }
}

func.tags = ['GenesisValidator']
// MockUSDC is only needed on test networks; 00_MockUSDC.ts skips itself on mainnet.
func.dependencies = ['MockUSDC']
export default func
