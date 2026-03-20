import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre;
  const { deploy, log } = deployments;
  const { deployer, aiValidator } = await getNamedAccounts();

  log("Deploying SensorDIDRegistry...");

  const validatorAddress = aiValidator || deployer; 

  const deployResult = await deploy("SensorDIDRegistry", {
    from: deployer,
    args: [deployer, validatorAddress],
    log: true,
    autoMine: true, 
  });

  log(`SensorDIDRegistry deployed at: ${deployResult.address}`);
};

export default func;
func.tags = ["SensorDIDRegistry"];
