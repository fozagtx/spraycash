// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IReceiver} from "./IReceiver.sol";

/// @title FxRateReceiver
/// @notice Stores USD->local FX rates delivered as signed Chainlink CRE reports.
/// Only the configured CRE forwarder may write. Rates use 8 decimals (1 USD = rate / 1e8 local units).
contract FxRateReceiver is IReceiver, Ownable {
    struct Rate {
        uint256 value; // local currency per 1 USD, 8 decimals
        uint64 updatedAt; // block timestamp of the write
        uint64 observedAt; // when the workflow fetched the sources
        uint64 updatedBlock; // block of the write, so the UI can link the report transaction
        uint8 sources; // number of independent sources behind the value (1 or 2)
    }

    uint8 public constant DECIMALS = 8;

    address public forwarder;
    /// @notice When set, reports must come from a workflow owned by this address.
    address public expectedWorkflowOwner;

    mapping(bytes32 currency => Rate) private _rates;

    event RateUpdated(bytes32 indexed currency, uint256 value, uint8 sources, uint64 observedAt);
    event ForwarderUpdated(address forwarder);
    event ExpectedWorkflowOwnerUpdated(address owner);

    error InvalidSender(address sender);
    error InvalidWorkflowOwner(address owner);
    error LengthMismatch();
    error ZeroRate(bytes32 currency);

    constructor(address forwarder_) Ownable(msg.sender) {
        forwarder = forwarder_;
        emit ForwarderUpdated(forwarder_);
    }

    /// @inheritdoc IReceiver
    /// @dev report = abi.encode(bytes32[] currencies, uint256[] values, uint8[] sources, uint64 observedAt)
    function onReport(bytes calldata metadata, bytes calldata report) external override {
        if (msg.sender != forwarder) revert InvalidSender(msg.sender);
        if (expectedWorkflowOwner != address(0)) {
            address owner_ = _workflowOwner(metadata);
            if (owner_ != expectedWorkflowOwner) revert InvalidWorkflowOwner(owner_);
        }

        (bytes32[] memory currencies, uint256[] memory values, uint8[] memory sources, uint64 observedAt) =
            abi.decode(report, (bytes32[], uint256[], uint8[], uint64));
        if (currencies.length != values.length || currencies.length != sources.length) revert LengthMismatch();

        for (uint256 i = 0; i < currencies.length; i++) {
            if (values[i] == 0) revert ZeroRate(currencies[i]);
            Rate storage r = _rates[currencies[i]];
            // Ignore replays and out-of-order reports.
            if (observedAt <= r.observedAt) continue;
            r.value = values[i];
            r.sources = sources[i];
            r.observedAt = observedAt;
            r.updatedAt = uint64(block.timestamp);
            r.updatedBlock = uint64(block.number);
            emit RateUpdated(currencies[i], values[i], sources[i], observedAt);
        }
    }

    function getRate(bytes32 currency)
        external
        view
        returns (uint256 value, uint64 updatedAt, uint8 sources, uint64 updatedBlock)
    {
        Rate storage r = _rates[currency];
        return (r.value, r.updatedAt, r.sources, r.updatedBlock);
    }

    function rateOf(bytes32 currency) external view returns (Rate memory) {
        return _rates[currency];
    }

    function setForwarder(address forwarder_) external onlyOwner {
        forwarder = forwarder_;
        emit ForwarderUpdated(forwarder_);
    }

    function setExpectedWorkflowOwner(address owner_) external onlyOwner {
        expectedWorkflowOwner = owner_;
        emit ExpectedWorkflowOwnerUpdated(owner_);
    }

    function supportsInterface(bytes4 interfaceId) public pure override returns (bool) {
        return interfaceId == type(IReceiver).interfaceId || interfaceId == type(IERC165).interfaceId;
    }

    /// @dev CRE metadata layout: workflowId (32) | workflowName (10) | workflowOwner (20)
    function _workflowOwner(bytes calldata metadata) private pure returns (address owner_) {
        if (metadata.length < 62) return address(0);
        owner_ = address(bytes20(metadata[42:62]));
    }
}
