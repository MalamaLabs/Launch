import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, network } = hre;
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();

  log("Deploying MalamaOFT...");

  // LayerZero endpoints from official definitions
  let lzEndpoint = "";
  if (network.name === "baseSepolia") {
    lzEndpoint = "0x6EDCE6540c4aC9B1c0ddb19Ebbd725C2CBF3bE04";
  } else if (network.name === "baseMainnet") {
    lzEndpoint = "0x1a44076050125825900e736c501f859c50fE728c"; 
  } else {
    // mock endpoint deployed natively for hardhat
    const endpointDeploy = await deploy("LZEndpointMock", {
      from: deployer,
      args: [],
    });
    lzEndpoint = endpointDeploy.address;
  }

  const deployResult = await deploy("MalamaOFT", {
    from: deployer,
    args: [lzEndpoint, deployer], // _lzEndpoint, _delegate
    log: true,
    autoMine: true, 
  });

  log(`MalamaOFT deployed at: ${deployResult.address}`);
};

export default func;
func.tags = ["MalamaOFT"];
