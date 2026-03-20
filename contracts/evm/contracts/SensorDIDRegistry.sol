// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title SensorDIDRegistry
 * @dev Manages environmental sensors using decentralized identifiers (DIDs) on Base.
 */
contract SensorDIDRegistry is AccessControl {
    bytes32 public constant AI_VALIDATOR_ROLE = keccak256("AI_VALIDATOR_ROLE");

    struct SensorDID {
        bytes32 did;
        bytes pubKey;
        bytes32 sensorType;
        bytes32 locationHash;
        uint256 calibrationTs;
        uint8 reputation;
        string ipfsCID;
        bool active;
    }

    mapping(bytes32 => SensorDID) private sensors;
    mapping(bytes32 => bool) public isRegistered;

    event SensorRegistered(bytes32 indexed did, bytes pubKey, bytes32 sensorType, bytes32 locationHash);
    event ReputationUpdated(bytes32 indexed did, uint8 oldReputation, uint8 newReputation);
    event SensorQuarantined(bytes32 indexed did);
    event SensorRecalibrated(bytes32 indexed did, uint256 newCalibrationTs, string newIpfsCID);
    event SensorDeactivated(bytes32 indexed did);

    error AlreadyRegistered();
    error NotRegistered();
    error Unauthorized();
    error InvalidReputation();
    error InvalidSensor();

    /**
     * @dev Constructor sets the sender as default admin.
     * @param admin The address of the initial admin.
     * @param aiValidator The address of the AI validator.
     */
    constructor(address admin, address aiValidator) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(AI_VALIDATOR_ROLE, aiValidator);
    }

    /**
     * @notice Registers a new sensor DID.
     * @dev Only accessible by an admin.
     * @param did The decentralized identifier of the sensor.
     * @param pubKey The public key associated with the sensor.
     * @param sensorType The model or type classification of the sensor.
     * @param locationHash The hashed location of the sensor.
     * @param ipfsCID IPFS hash containing sensor metadata.
     */
    function registerSensor(
        bytes32 did,
        bytes calldata pubKey,
        bytes32 sensorType,
        bytes32 locationHash,
        string calldata ipfsCID
    ) external {
        if (!hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) revert Unauthorized();
        if (isRegistered[did]) revert AlreadyRegistered();

        sensors[did] = SensorDID({
            did: did,
            pubKey: pubKey,
            sensorType: sensorType,
            locationHash: locationHash,
            calibrationTs: block.timestamp,
            reputation: 100,
            ipfsCID: ipfsCID,
            active: true
        });

        isRegistered[did] = true;

        emit SensorRegistered(did, pubKey, sensorType, locationHash);
    }

    /**
     * @notice Updates the reputation of an active sensor.
     * @dev Accessible by admin and ai validator. Quarantines if reputation falls too low.
     * @param did The sensor's DID.
     * @param newReputation The new reputation score [0, 100].
     */
    function updateReputation(bytes32 did, uint8 newReputation) external {
        if (!hasRole(AI_VALIDATOR_ROLE, msg.sender) && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) {
            revert Unauthorized();
        }
        if (!isRegistered[did]) revert NotRegistered();
        if (newReputation > 100) revert InvalidReputation();

        SensorDID storage sensor = sensors[did];
        uint8 oldReputation = sensor.reputation;
        sensor.reputation = newReputation;

        emit ReputationUpdated(did, oldReputation, newReputation);

        if (newReputation < 50 && sensor.active) {
            sensor.active = false;
            emit SensorQuarantined(did);
        }
    }

    /**
     * @notice Recalibrates a sensor, resetting its calibration timestamp and updating IPFS data.
     * @dev Only admin.
     * @param did The sensor's DID.
     * @param newIpfsCID IPFS CID of the new calibration certificate.
     */
    function recalibrate(bytes32 did, string calldata newIpfsCID) external {
        if (!hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) revert Unauthorized();
        if (!isRegistered[did]) revert NotRegistered();

        SensorDID storage sensor = sensors[did];
        sensor.calibrationTs = block.timestamp;
        sensor.ipfsCID = newIpfsCID;

        emit SensorRecalibrated(did, block.timestamp, newIpfsCID);
    }

    /**
     * @notice Deactivates a sensor.
     * @dev Only admin.
     * @param did The sensor's DID.
     */
    function deactivateSensor(bytes32 did) external {
        if (!hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) revert Unauthorized();
        if (!isRegistered[did]) revert NotRegistered();

        SensorDID storage sensor = sensors[did];
        sensor.active = false;

        emit SensorDeactivated(did);
    }

    /**
     * @notice Checks if a sensor is valid for settlement processing.
     * @dev Validity requires registered, active = true, and reputation >= 80.
     * @param did The sensor's DID.
     * @return True if valid for settlement.
     */
    function isValidForSettlement(bytes32 did) external view returns (bool) {
        if (!isRegistered[did]) return false;
        SensorDID memory sensor = sensors[did];
        return sensor.active && sensor.reputation >= 80;
    }

    /**
     * @notice Fetches the sensor memory struct.
     * @param did The sensor DID.
     * @return The SensorDID object.
     */
    function getSensor(bytes32 did) external view returns (SensorDID memory) {
        if (!isRegistered[did]) revert NotRegistered();
        return sensors[did];
    }
}
