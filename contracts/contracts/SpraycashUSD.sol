// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC2771Context} from "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import {Context} from "@openzeppelin/contracts/utils/Context.sol";

/// @title SpraycashUSD
/// @notice Demo dollar token for testnet payroll (6 decimals, like USDC).
/// Anyone can top up a low balance from the faucet so demos never run dry.
/// Supports gasless calls through the Spraycash forwarder (ERC-2771).
contract SpraycashUSD is ERC20, ERC2771Context {
    uint256 public constant FAUCET_AMOUNT = 25_000e6;
    uint256 public constant FAUCET_THRESHOLD = 1_000e6;

    error FaucetNotNeeded(uint256 balance);

    constructor(address trustedForwarder) ERC20("Spraycash USD", "scUSD") ERC2771Context(trustedForwarder) {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Tops the caller up to a demo balance when they are running low.
    function faucet() external {
        address account = _msgSender();
        uint256 balance = balanceOf(account);
        if (balance >= FAUCET_THRESHOLD) revert FaucetNotNeeded(balance);
        _mint(account, FAUCET_AMOUNT);
    }

    function _msgSender() internal view override(Context, ERC2771Context) returns (address) {
        return ERC2771Context._msgSender();
    }

    function _msgData() internal view override(Context, ERC2771Context) returns (bytes calldata) {
        return ERC2771Context._msgData();
    }

    function _contextSuffixLength() internal view override(Context, ERC2771Context) returns (uint256) {
        return ERC2771Context._contextSuffixLength();
    }
}
