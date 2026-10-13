// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC2771Forwarder} from "@openzeppelin/contracts/metatx/ERC2771Forwarder.sol";

/// @title PaydayForwarder
/// @notice Lets the Payday relayer submit calls signed by passkey accounts that hold no gas.
/// The relayer pays gas; the signer stays the caller (ERC-2771), so the relayer can't act for anyone.
contract PaydayForwarder is ERC2771Forwarder {
    constructor() ERC2771Forwarder("PaydayForwarder") {}
}
