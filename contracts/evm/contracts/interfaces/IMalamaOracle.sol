// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IMalamaOracle {
    struct DataPoint {
        bytes32 hexId;
        uint256 date;
        bytes32 sensorDid;
        uint256 value;
        uint16 confidenceBps;
        bytes32 merkleRoot;
        string ipfsCID;
        uint256 timestamp;
        bool challenged;
    }

    event DataSubmitted(bytes32 indexed hexId, uint256 indexed date, bytes32 indexed sensorDid, uint256 value);
    event LowConfidenceAlert(bytes32 indexed hexId, uint256 indexed date, uint16 confidenceBps);
    event MarketResolved(bytes32 indexed marketId, uint256 value);
    event DataChallenged(bytes32 indexed hexId, uint256 indexed date, string evidence);

    function submitData(
        bytes32 hexId,
        uint256 date,
        bytes32 sensorDid,
        uint256 value,
        uint16 confidenceBps,
        bytes32 merkleRoot,
        string calldata ipfsCID
    ) external;

    function resolveMarket(bytes32 marketId, bytes32 hexId, uint256 date) external;
    function challengeData(bytes32 hexId, uint256 date, string calldata evidence) external;
    function submitAnchor(bytes32[] calldata batchIds, bytes32[] calldata merkleRoots, string[] calldata ipfsCIDs, uint256 timestamp, uint256 sensorCount) external;
    function getResolution(bytes32 marketId) external view returns (uint256 value, bool resolved);
    function getLatestHexData(bytes32 hexId, uint256 date) external view returns (DataPoint memory);
}
