// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IMalamaOracle} from "./interfaces/IMalamaOracle.sol";
import {ISensorRegistry} from "./interfaces/ISensorRegistry.sol";
import {IMalamaOFT} from "./interfaces/IMalamaOFT.sol";

/**
 * @title MalamaOracle
 * @dev Manages off-chain sensor data ingestion and settlement lifecycle.
 */
contract MalamaOracle is IMalamaOracle {
    address public immutable aiValidator;
    ISensorRegistry public immutable sensorRegistry;
    IMalamaOFT public immutable malamaOFT;

    uint256 public constant CHALLENGE_WINDOW = 2 hours;
    uint256 public constant SETTLEMENT_FEE_BPS = 100; // 1%

    mapping(bytes32 => DataPoint) private dataPoints;
    mapping(bytes32 => uint256) private resolutions;
    mapping(bytes32 => bool) public marketResolved;

    event AnchorSubmitted(bytes32[] batchIds, bytes32[] merkleRoots, uint256 timestamp, uint256 sensorCount);

    error Unauthorized();
    error InvalidSensor();
    error InvalidConfidence();
    error DataPointExists();
    error DataPointNotFound();
    error ChallengeWindowActive();
    error ChallengeWindowExpired();
    error LowConfidence();
    error AlreadyResolved();
    error DataChallengedError();

    modifier onlyAIValidator() {
        if (msg.sender != aiValidator) revert Unauthorized();
        _;
    }

    constructor(
        address _sensorRegistry,
        address _aiValidator,
        address _malamaOFT
    ) {
        sensorRegistry = ISensorRegistry(_sensorRegistry);
        aiValidator = _aiValidator;
        malamaOFT = IMalamaOFT(_malamaOFT);
    }

    function _getDataKey(bytes32 hexId, uint256 date) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(hexId, date));
    }

    function submitData(
        bytes32 hexId,
        uint256 date,
        bytes32 sensorDid,
        uint256 value,
        uint16 confidenceBps,
        bytes32 merkleRoot,
        string calldata ipfsCID
    ) external onlyAIValidator {
        if (!sensorRegistry.isValidForSettlement(sensorDid)) revert InvalidSensor();
        if (confidenceBps > 10000) revert InvalidConfidence();

        bytes32 key = _getDataKey(hexId, date);
        if (dataPoints[key].timestamp != 0) revert DataPointExists();

        dataPoints[key] = DataPoint({
            hexId: hexId,
            date: date,
            sensorDid: sensorDid,
            value: value,
            confidenceBps: confidenceBps,
            merkleRoot: merkleRoot,
            ipfsCID: ipfsCID,
            timestamp: block.timestamp,
            challenged: false
        });

        emit DataSubmitted(hexId, date, sensorDid, value);

        if (confidenceBps < 9000) {
            emit LowConfidenceAlert(hexId, date, confidenceBps);
        }
    }

    function resolveMarket(bytes32 marketId, bytes32 hexId, uint256 date) external {
        if (marketResolved[marketId]) revert AlreadyResolved();
        
        bytes32 key = _getDataKey(hexId, date);
        DataPoint storage dp = dataPoints[key];
        
        if (dp.timestamp == 0) revert DataPointNotFound();
        if (dp.challenged) revert DataChallengedError();
        if (block.timestamp < dp.timestamp + CHALLENGE_WINDOW) revert ChallengeWindowActive();
        if (dp.confidenceBps < 9000) revert LowConfidence();

        marketResolved[marketId] = true;
        resolutions[marketId] = dp.value;

        uint256 burnAmount = (dp.value * SETTLEMENT_FEE_BPS) / 10000;
        if (burnAmount > 0) {
            malamaOFT.burnForBME(burnAmount);
        }

        emit MarketResolved(marketId, dp.value);
    }

    function challengeData(bytes32 hexId, uint256 date, string calldata evidence) external {
        bytes32 key = _getDataKey(hexId, date);
        DataPoint storage dp = dataPoints[key];
        
        if (dp.timestamp == 0) revert DataPointNotFound();
        if (block.timestamp >= dp.timestamp + CHALLENGE_WINDOW) revert ChallengeWindowExpired();

        dp.challenged = true;
        emit DataChallenged(hexId, date, evidence);
    }

    function submitAnchor(
        bytes32[] calldata batchIds,
        bytes32[] calldata merkleRoots,
        string[] calldata ipfsCIDs,
        uint256 timestamp,
        uint256 sensorCount
    ) external onlyAIValidator {
        emit AnchorSubmitted(batchIds, merkleRoots, timestamp, sensorCount);
    }

    function getResolution(bytes32 marketId) external view returns (uint256 value, bool resolved) {
        return (resolutions[marketId], marketResolved[marketId]);
    }

    function getLatestHexData(bytes32 hexId, uint256 date) external view returns (DataPoint memory) {
        bytes32 key = _getDataKey(hexId, date);
        DataPoint memory dp = dataPoints[key];
        if (dp.timestamp == 0) revert DataPointNotFound();
        return dp;
    }
}
