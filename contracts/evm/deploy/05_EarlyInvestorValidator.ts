import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'
import { ethers } from 'ethers'

/**
 * Deploy the EarlyInvestorValidator ERC-721 (bespoke investor plots).
 *
 * Mirrors 04_GenesisValidator.ts so this "just deploys" with the SAME controls
 * the live Genesis sale uses: the same Base USDC payment token, the same
 * treasury, and the same operator hot wallet relaying mints. The only structural
 * difference is access control — EarlyInvestorValidator is AccessControl (not
 * Ownable), matching the live MHNL model: a Safe holds DEFAULT_ADMIN_ROLE for
 * config/grants, the operator hot wallet holds MINTER_ROLE to relay mints.
 *
 * Role wiring (so it works the moment it lands):
 *   1. Constructor grants BOTH roles to the deployer, so the deploy tx itself
 *      can hand roles out without a second admin.
 *   2. MINTER_ROLE → operator hot wallet (EARLY_INVESTOR_OPERATOR_ADDRESS, or the
 *      Genesis backend signer; defaults to the deployer so the backend can mint
 *      immediately if it shares the deployer key).
 *   3. DEFAULT_ADMIN_ROLE (+ MINTER_ROLE) → Safe (EARLY_INVESTOR_ADMIN_ADDRESS,
 *      defaults to TREASURY_ADDRESS).
 *   4. Optionally renounce the deployer's roles once the Safe + operator are in
 *      place (EARLY_INVESTOR_RENOUNCE_DEPLOYER=true) — leave false until verified.
 *
 * Env:
 *   TREASURY_ADDRESS                  (required) USDC receiver + default Safe admin
 *   BASE_USDC_ADDRESS                 (mainnet)  override Circle USDC if needed
 *   EARLY_INVESTOR_MAX_SUPPLY         initial cap (default 50; raise via setMaxSupply)
 *   HEX_PRICE_USDC_UNITS              price in USDC base units (default 2_000_000_000 = $2,000)
 *   EARLY_INVESTOR_BASE_URI           tokenURI fallback base
 *   EARLY_INVESTOR_ADMIN_ADDRESS      Safe to hold DEFAULT_ADMIN_ROLE (default TREASURY_ADDRESS)
 *   EARLY_INVESTOR_OPERATOR_ADDRESS   hot wallet to hold MINTER_ROLE (default deployer)
 *   EARLY_INVESTOR_RENOUNCE_DEPLOYER  "true" to drop deployer roles post-wiring
 */
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, network } = hre
  const { deploy, get, execute, read } = deployments
  const { deployer } = await getNamedAccounts()

  console.log(`\n🚀 Deploying EarlyInvestorValidator on ${network.name}`)
  console.log(`   Deployer: ${deployer}`)

  // ── Payment token (identical resolution to Genesis) ────────────────────────
  let usdcAddress: string
  if (network.name === 'baseSepolia' || network.name === 'hardhat' || network.name === 'localhost') {
    const mockUsdc = await get('MockUSDC')
    usdcAddress = mockUsdc.address
    console.log(`   MockUSDC: ${usdcAddress}`)
  } else {
    // Base Mainnet Circle USDC — MUST match the value Genesis was deployed against.
    usdcAddress = process.env.BASE_USDC_ADDRESS || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
    console.log(`   USDC (mainnet): ${usdcAddress}`)
  }

  // ── Treasury ───────────────────────────────────────────────────────────────
  const treasury = process.env.TREASURY_ADDRESS
  if (!treasury) {
    throw new Error('TREASURY_ADDRESS env var is required — do not default to deployer on mainnet')
  }

  // ── Mint price (same $2,000 default as Genesis) ────────────────────────────
  const mintPrice = process.env.HEX_PRICE_USDC_UNITS
    ? BigInt(process.env.HEX_PRICE_USDC_UNITS)
    : 2_000_000_000n

  // ── Adjustable supply cap ──────────────────────────────────────────────────
  const maxSupply = process.env.EARLY_INVESTOR_MAX_SUPPLY
    ? BigInt(process.env.EARLY_INVESTOR_MAX_SUPPLY)
    : 50n

  // ── Base URI (tokenURI fallback; per-token IPFS URIs override at mint) ──────
  const baseURI =
    process.env.EARLY_INVESTOR_BASE_URI || 'https://api.dagwelldev.com/early-investor/nft-image/'

  // Deploy with deployer as admin so this same tx can wire roles to Safe/operator.
  const admin = deployer

  console.log(`   Treasury:  ${treasury}`)
  console.log(`   MintPrice: ${mintPrice} (USDC base units)`)
  console.log(`   MaxSupply: ${maxSupply}`)
  console.log(`   BaseURI:   ${baseURI}`)

  const result = await deploy('EarlyInvestorValidator', {
    from: deployer,
    args: [usdcAddress, treasury, mintPrice, maxSupply, baseURI, admin],
    log: true,
    waitConfirmations: network.name === 'baseSepolia' ? 2 : 5,
  })

  if (!result.newlyDeployed) {
    console.log(`\nℹ️  EarlyInvestorValidator already deployed at ${result.address} — skipped`)
    return
  }

  console.log(`\n✅ EarlyInvestorValidator deployed: ${result.address}`)

  // ── Role wiring ────────────────────────────────────────────────────────────
  const MINTER_ROLE = ethers.id('MINTER_ROLE')
  const DEFAULT_ADMIN_ROLE =
    '0x0000000000000000000000000000000000000000000000000000000000000000'

  const operator = (process.env.EARLY_INVESTOR_OPERATOR_ADDRESS || '').trim() || deployer
  const adminSafe = (process.env.EARLY_INVESTOR_ADMIN_ADDRESS || treasury).trim()

  const isSame = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

  // Operator hot wallet → MINTER_ROLE (the backend signer that relays mints).
  if (!isSame(operator, deployer)) {
    if (!(await read('EarlyInvestorValidator', 'hasRole', MINTER_ROLE, operator))) {
      console.log(`   Granting MINTER_ROLE → operator ${operator}`)
      await execute('EarlyInvestorValidator', { from: deployer, log: true }, 'grantRole', MINTER_ROLE, operator)
    }
  } else {
    console.log(`   Operator == deployer — deployer already holds MINTER_ROLE.`)
  }

  // Safe → DEFAULT_ADMIN_ROLE + MINTER_ROLE.
  if (!isSame(adminSafe, deployer)) {
    if (!(await read('EarlyInvestorValidator', 'hasRole', DEFAULT_ADMIN_ROLE, adminSafe))) {
      console.log(`   Granting DEFAULT_ADMIN_ROLE → Safe ${adminSafe}`)
      await execute('EarlyInvestorValidator', { from: deployer, log: true }, 'grantRole', DEFAULT_ADMIN_ROLE, adminSafe)
    }
    if (!(await read('EarlyInvestorValidator', 'hasRole', MINTER_ROLE, adminSafe))) {
      await execute('EarlyInvestorValidator', { from: deployer, log: true }, 'grantRole', MINTER_ROLE, adminSafe)
    }
  } else {
    console.log(`   Admin Safe == deployer — deployer already holds DEFAULT_ADMIN_ROLE.`)
  }

  // Optionally renounce the deployer's roles once Safe + operator are wired.
  // Guarded so we never strip the deployer while it is still the only admin.
  if (String(process.env.EARLY_INVESTOR_RENOUNCE_DEPLOYER).toLowerCase() === 'true') {
    const safeIsAdmin = !isSame(adminSafe, deployer) &&
      (await read('EarlyInvestorValidator', 'hasRole', DEFAULT_ADMIN_ROLE, adminSafe))
    if (!safeIsAdmin) {
      console.warn('   ⚠️  Skipping deployer renounce — no distinct Safe holds DEFAULT_ADMIN_ROLE yet.')
    } else {
      if (await read('EarlyInvestorValidator', 'hasRole', MINTER_ROLE, deployer)) {
        await execute('EarlyInvestorValidator', { from: deployer, log: true }, 'renounceRole', MINTER_ROLE, deployer)
      }
      console.log(`   Renouncing deployer DEFAULT_ADMIN_ROLE (Safe ${adminSafe} retains control)`)
      await execute('EarlyInvestorValidator', { from: deployer, log: true }, 'renounceRole', DEFAULT_ADMIN_ROLE, deployer)
    }
  }

  console.log(`\nAdd to your dagwelldev-api .env:`)
  const netEnv = network.name === 'baseMainnet' ? 'MAINNET' : 'SEPOLIA'
  console.log(`EARLY_INVESTOR_CONTRACT_ADDRESS_${netEnv}=${result.address}`)

  // ── Basescan verification ──────────────────────────────────────────────────
  if (process.env.BASESCAN_API_KEY) {
    await new Promise((r) => setTimeout(r, 10_000))
    try {
      await hre.run('verify:verify', {
        address: result.address,
        constructorArguments: [usdcAddress, treasury, mintPrice, maxSupply, baseURI, admin],
      })
      console.log('✅ Contract verified on Basescan')
    } catch (e: any) {
      console.warn('⚠️  Verification failed (may already be verified):', e.message)
    }
  }
}

func.tags = ['EarlyInvestorValidator']
// MockUSDC is only needed on test networks; 00_MockUSDC.ts skips itself on mainnet.
func.dependencies = ['MockUSDC']
export default func
