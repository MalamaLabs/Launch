// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ISensorRegistry {
    function isValidForSettlement(bytes32 did) external view returns (bool);
}
