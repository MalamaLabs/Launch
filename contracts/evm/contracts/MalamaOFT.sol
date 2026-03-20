// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { OFT } from "@layerzerolabs/lz-evm-oapp-v2/contracts/oft/OFT.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract MalamaOFT is OFT {
    address public bmeOracle;
    address public rewardDistributor;

    uint256 public constant MAX_MINT_PER_EPOCH = 10_000_000 * 1e18;
    uint256 public constant EPOCH_DURATION = 30 days;

    uint256 public currentEpochStart;
    uint256 public mintedThisEpoch;

    event BMEBurn(address indexed from, uint256 amount);

    error Unauthorized();
    error MaxMintExceeded();

    constructor(
        address _lzEndpoint,
        address _delegate
    ) OFT("Malama", "MALAMA", _lzEndpoint, _delegate) Ownable(_delegate) {
        _mint(_delegate, 1_000_000_000 * 1e18); // 1B MALAMA to deployer
        currentEpochStart = block.timestamp;
    }

    function setBMEOracle(address _oracle) external onlyOwner {
        bmeOracle = _oracle;
    }

    function setRewardDistributor(address _distributor) external onlyOwner {
        rewardDistributor = _distributor;
    }

    function burnForBME(uint256 amount) external {
        if (msg.sender != bmeOracle) revert Unauthorized();
        // The oracle is authorized to execute BME burns from its own balance 
        // or through allowances. Here, burning directly from msg.sender.
        _burn(msg.sender, amount);
        emit BMEBurn(msg.sender, amount);
    }

    function mintReward(address to, uint256 amount) external {
        if (msg.sender != rewardDistributor) revert Unauthorized();

        if (block.timestamp >= currentEpochStart + EPOCH_DURATION) {
            currentEpochStart = block.timestamp;
            mintedThisEpoch = 0;
        }

        if (mintedThisEpoch + amount > MAX_MINT_PER_EPOCH) {
            revert MaxMintExceeded();
        }

        mintedThisEpoch += amount;
        _mint(to, amount);
    }
}
