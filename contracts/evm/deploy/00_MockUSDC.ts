import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'

// Only deploy MockUSDC on test networks — skip entirely on mainnet.
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, network } = hre
  const { deploy, log } = deployments
  const { deployer } = await getNamedAccounts()

  if (network.name !== 'baseSepolia' && network.name !== 'hardhat' && network.name !== 'localhost') {
    log(`Skipping MockUSDC on ${network.name} — use real USDC`)
    return
  }

  log(`Deploying MockUSDC on ${network.name}...`)

  const result = await deploy('MockUSDC', {
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
  })

  log(`MockUSDC deployed at: ${result.address}`)
  log(`\nFaucet tip: call MockUSDC.mint(<address>, 10000_000000) to top up a test wallet.`)
}

func.tags = ['MockUSDC']
export default func
