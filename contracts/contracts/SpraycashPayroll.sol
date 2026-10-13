// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ERC2771Context} from "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import {Context} from "@openzeppelin/contracts/utils/Context.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {FxRateReceiver} from "./FxRateReceiver.sol";

/// @title SpraycashPayroll
/// @notice Escrowed payslips that stream dollars (AUSD by Agora on Monad) to a freelancer every second, at an FX rate
/// locked from a fresh Chainlink CRE report at the moment the employer hits pay.
///
/// Lifecycle: create (employer funds) -> claim (freelancer binds their account via the claim link)
/// -> withdraw (any time, earned so far) -> stop (employer; earned stays, unearned refunds)
/// or refundUnclaimed (link expired unclaimed; everything refunds).
contract SpraycashPayroll is ERC2771Context, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Payslip {
        address employer;
        address freelancer; // zero until the claim link is used
        address claimSigner; // public half of the key embedded in the claim link
        bytes32 currency; // e.g. "INR" as bytes32
        uint256 lockedRate; // local per USD, 8 decimals
        uint128 deposit; // USD, 6 decimals
        uint128 withdrawn;
        uint128 refunded;
        uint64 start;
        uint64 end;
        uint64 stoppedAt; // zero while running
        uint64 claimDeadline;
        uint64 createdBlock;
        uint64 rateBlock; // block of the CRE report whose rate was locked
        bool voided; // refunded because the link expired unclaimed
    }

    uint64 public constant MIN_RATE_AGE = 30;
    uint64 public constant MAX_RATE_AGE_LIMIT = 1 days;

    IERC20 public immutable usd;
    FxRateReceiver public immutable fx;

    /// @notice Reports older than this cannot be locked into a new payslip.
    uint64 public maxRateAge = 10 minutes;

    uint256 public nextId = 1;
    mapping(uint256 id => Payslip) private _payslips;
    mapping(address employer => uint256[]) private _employerPayslips;
    mapping(address freelancer => uint256[]) private _freelancerPayslips;

    event PayslipCreated(
        uint256 indexed id,
        address indexed employer,
        bytes32 indexed currency,
        uint256 lockedRate,
        uint128 deposit,
        uint64 start,
        uint64 end,
        uint64 claimDeadline,
        address claimSigner
    );
    event PayslipClaimed(uint256 indexed id, address indexed freelancer);
    event Withdrawn(uint256 indexed id, address indexed freelancer, uint128 amount, uint256 localAmount);
    event PayslipStopped(uint256 indexed id, uint128 earned, uint128 refunded);
    event UnclaimedRefunded(uint256 indexed id, uint128 refunded);
    event MaxRateAgeUpdated(uint64 maxRateAge);

    error UnsupportedCurrency(bytes32 currency);
    error StaleRate(uint64 updatedAt, uint64 maxRateAge);
    error QuoteChanged(uint256 currentRate, uint64 currentUpdatedAt);
    error InsufficientBalance(uint256 balance, uint256 needed);
    error InvalidAmount();
    error InvalidDuration();
    error InvalidClaimSigner();
    error UnknownPayslip(uint256 id);
    error NotEmployer();
    error NotFreelancer();
    error AlreadyClaimed();
    error ClaimExpired();
    error ClaimNotExpired();
    error InvalidClaimSignature();
    error AlreadyStopped();
    error AlreadyEnded();
    error Voided();
    error NothingToWithdraw();
    error InvalidMaxRateAge();

    constructor(IERC20 usd_, FxRateReceiver fx_, address trustedForwarder)
        ERC2771Context(trustedForwarder)
        Ownable(msg.sender)
    {
        usd = usd_;
        fx = fx_;
    }

    // ---------------------------------------------------------------- employer

    /// @notice Funds and starts a payslip at the currently reported rate.
    /// @param quotedRate / quotedAt The rate and report timestamp the employer saw. If a newer
    /// report landed in between, the call reverts with QuoteChanged instead of silently re-pricing.
    /// @param start Unix start time; anything in the past starts now.
    /// @param claimSigner Address of the one-time key embedded in the claim link.
    /// @param claimWindow Seconds the freelancer has to open the link before the employer can refund.
    function createPayslip(
        bytes32 currency,
        uint256 quotedRate,
        uint64 quotedAt,
        uint128 amount,
        uint64 start,
        uint64 duration,
        address claimSigner,
        uint64 claimWindow
    ) external nonReentrant returns (uint256 id) {
        return _createPayslip(currency, quotedRate, quotedAt, amount, start, duration, claimSigner, claimWindow);
    }

    struct Permit {
        uint256 deadline;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    /// @notice Same as createPayslip, but first applies an EIP-2612 permit signed by the employer, so
    /// funding with AUSD (Agora) needs a single gasless request and no separate approval.
    /// A permit that fails (e.g. already used, front-run) is ignored if the allowance is already enough.
    function createPayslipWithPermit(
        bytes32 currency,
        uint256 quotedRate,
        uint64 quotedAt,
        uint128 amount,
        uint64 start,
        uint64 duration,
        address claimSigner,
        uint64 claimWindow,
        Permit calldata permit
    ) external nonReentrant returns (uint256 id) {
        try IERC20Permit(address(usd)).permit(
            _msgSender(), address(this), amount, permit.deadline, permit.v, permit.r, permit.s
        ) {} catch {}
        return _createPayslip(currency, quotedRate, quotedAt, amount, start, duration, claimSigner, claimWindow);
    }

    function _createPayslip(
        bytes32 currency,
        uint256 quotedRate,
        uint64 quotedAt,
        uint128 amount,
        uint64 start,
        uint64 duration,
        address claimSigner,
        uint64 claimWindow
    ) private returns (uint256 id) {
        (uint256 rate, uint64 updatedAt,, uint64 updatedBlock) = fx.getRate(currency);
        if (rate == 0) revert UnsupportedCurrency(currency);
        if (block.timestamp > uint256(updatedAt) + maxRateAge) revert StaleRate(updatedAt, maxRateAge);
        if (rate != quotedRate || updatedAt != quotedAt) revert QuoteChanged(rate, updatedAt);
        if (amount == 0) revert InvalidAmount();
        if (duration == 0) revert InvalidDuration();
        if (claimSigner == address(0)) revert InvalidClaimSigner();

        address employer = _msgSender();
        uint256 balance = usd.balanceOf(employer);
        if (balance < amount) revert InsufficientBalance(balance, amount);

        uint64 nowTs = uint64(block.timestamp);
        if (start < nowTs) start = nowTs;

        id = nextId++;
        Payslip storage p = _payslips[id];
        p.employer = employer;
        p.claimSigner = claimSigner;
        p.currency = currency;
        p.lockedRate = rate;
        p.deposit = amount;
        p.start = start;
        p.end = start + duration;
        p.claimDeadline = nowTs + claimWindow;
        p.createdBlock = uint64(block.number);
        p.rateBlock = updatedBlock;
        _employerPayslips[employer].push(id);

        usd.safeTransferFrom(employer, address(this), amount);

        emit PayslipCreated(id, employer, currency, rate, amount, start, p.end, p.claimDeadline, claimSigner);
    }

    /// @notice Stops pay now. Earned pay stays claimable by the freelancer; the rest refunds instantly.
    function stop(uint256 id) external nonReentrant {
        Payslip storage p = _get(id);
        if (_msgSender() != p.employer) revert NotEmployer();
        if (p.voided) revert Voided();
        if (p.stoppedAt != 0) revert AlreadyStopped();
        if (block.timestamp >= p.end) revert AlreadyEnded();

        p.stoppedAt = uint64(block.timestamp);
        uint128 earnedTotal = _earned(p);
        uint128 refund = p.deposit - earnedTotal;
        p.refunded = refund;

        if (refund > 0) usd.safeTransfer(p.employer, refund);
        emit PayslipStopped(id, earnedTotal, refund);
    }

    /// @notice Refunds everything when the claim link expired without being used.
    function refundUnclaimed(uint256 id) external nonReentrant {
        Payslip storage p = _get(id);
        if (p.freelancer != address(0)) revert AlreadyClaimed();
        if (p.voided) revert Voided();
        if (block.timestamp <= p.claimDeadline) revert ClaimNotExpired();

        uint128 refund = p.deposit - p.refunded;
        p.voided = true;
        p.refunded = p.deposit;
        if (p.stoppedAt == 0) p.stoppedAt = uint64(block.timestamp);

        if (refund > 0) usd.safeTransfer(p.employer, refund);
        emit UnclaimedRefunded(id, refund);
    }

    // -------------------------------------------------------------- freelancer

    /// @notice Binds the caller's account to the payslip. `claimSignature` is an EIP-191 signature
    /// by the claim-link key over claimDigest(id, caller), so only someone holding the link can bind,
    /// and a relayer or observer cannot redirect the payslip to another account.
    function claim(uint256 id, bytes calldata claimSignature) external {
        Payslip storage p = _get(id);
        if (p.freelancer != address(0)) revert AlreadyClaimed();
        if (p.voided) revert Voided();
        if (block.timestamp > p.claimDeadline) revert ClaimExpired();

        address freelancer = _msgSender();
        bytes32 digest = MessageHashUtils.toEthSignedMessageHash(claimDigest(id, freelancer));
        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, claimSignature);
        if (err != ECDSA.RecoverError.NoError || recovered != p.claimSigner) revert InvalidClaimSignature();

        p.freelancer = freelancer;
        _freelancerPayslips[freelancer].push(id);
        emit PayslipClaimed(id, freelancer);
    }

    /// @notice Withdraws everything earned so far.
    function withdraw(uint256 id) external nonReentrant returns (uint128 amount) {
        Payslip storage p = _get(id);
        if (_msgSender() != p.freelancer) revert NotFreelancer();
        amount = _withdrawable(p);
        if (amount == 0) revert NothingToWithdraw();

        p.withdrawn += amount;
        usd.safeTransfer(p.freelancer, amount);
        emit Withdrawn(id, p.freelancer, amount, toLocal(amount, p.lockedRate));
    }

    // ------------------------------------------------------------------- views

    function claimDigest(uint256 id, address freelancer) public view returns (bytes32) {
        return keccak256(abi.encode("Spraycash claim", block.chainid, address(this), id, freelancer));
    }

    function getPayslip(uint256 id) external view returns (Payslip memory) {
        return _get(id);
    }

    function earned(uint256 id) external view returns (uint128) {
        return _earned(_get(id));
    }

    function withdrawable(uint256 id) external view returns (uint128) {
        return _withdrawable(_get(id));
    }

    function payslipsOfEmployer(address employer) external view returns (uint256[] memory) {
        return _employerPayslips[employer];
    }

    function payslipsOfFreelancer(address freelancer) external view returns (uint256[] memory) {
        return _freelancerPayslips[freelancer];
    }

    /// @notice USD (6 decimals) -> local currency (6 decimals) at an 8-decimal rate.
    function toLocal(uint256 usdAmount, uint256 rate) public pure returns (uint256) {
        return (usdAmount * rate) / 1e8;
    }

    // ------------------------------------------------------------------- admin

    function setMaxRateAge(uint64 maxRateAge_) external onlyOwner {
        if (maxRateAge_ < MIN_RATE_AGE || maxRateAge_ > MAX_RATE_AGE_LIMIT) revert InvalidMaxRateAge();
        maxRateAge = maxRateAge_;
        emit MaxRateAgeUpdated(maxRateAge_);
    }

    // ---------------------------------------------------------------- internal

    function _get(uint256 id) private view returns (Payslip storage p) {
        p = _payslips[id];
        if (p.employer == address(0)) revert UnknownPayslip(id);
    }

    function _earned(Payslip storage p) private view returns (uint128) {
        uint256 until = p.end;
        if (p.stoppedAt != 0 && p.stoppedAt < until) until = p.stoppedAt;
        if (block.timestamp < until) until = block.timestamp;
        if (until <= p.start) return 0;
        return uint128((uint256(p.deposit) * (until - p.start)) / (p.end - p.start));
    }

    function _withdrawable(Payslip storage p) private view returns (uint128) {
        if (p.voided || p.freelancer == address(0)) return 0;
        return _earned(p) - p.withdrawn;
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
