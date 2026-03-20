// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract LZEndpointMock {
    address public delegate;

    function setDelegate(address _delegate) external {
        delegate = _delegate;
    }

    // Mock LZ quote
    function quote(
        uint32, 
        address, 
        bytes calldata, 
        bytes calldata
    ) external pure returns (uint256 nativeFee, uint256 lzTokenFee) {
        return (1, 0); // nominal fee
    }

    // Mock LZ send. In V2, `send` does not directly decrease sender's token balance? 
    // Actually, OFT calls `_debit` before calling `endpoint.send`. 
    // `endpoint.send` simply accepts the payload.
    // LZEndpoint signature: send(SendParam, Fee, address payable, address) -> (MessagingReceipt)
    function send(
        uint32 /* dstEid */,
        address /* receiver */,
        bytes calldata /* payload */,
        bytes calldata /* options */,
        address /* refundAddress */
    ) external payable returns (uint64, bytes32, uint256) {
        return (1, bytes32(0), 0); // generic MessagingReceipt structure representation mock
    }
}
