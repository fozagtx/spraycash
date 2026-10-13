import hre from "hardhat";
import { expect, use } from "chai";
import chaiAsPromised from "chai-as-promised";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import {
  encodeAbiParameters,
  encodeFunctionData,
  getAddress,
  parseUnits,
  stringToHex,
  type Address,
  type Hex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

use(chaiAsPromised);

const INR = stringToHex("INR", { size: 32 });
const NGN = stringToHex("NGN", { size: 32 });
const RATE_INR = 8342000000n; // 83.42 with 8 decimals
const USD = (n: string) => parseUnits(n, 6);
const MONTH = 30n * 24n * 3600n;

function report(currencies: Hex[], values: bigint[], sources: number[], observedAt: bigint): Hex {
  return encodeAbiParameters(
    [{ type: "bytes32[]" }, { type: "uint256[]" }, { type: "uint8[]" }, { type: "uint64" }],
    [currencies, values, sources, observedAt],
  );
}

function metadata(owner: Address): Hex {
  // workflowId (32) | workflowName (10) | workflowOwner (20)
  return `0x${"11".repeat(32)}${"22".repeat(10)}${owner.slice(2).toLowerCase()}` as Hex;
}

async function deploy() {
  const [admin, creForwarder, employer, stranger] = await hre.viem.getWalletClients();
  const publicClient = await hre.viem.getPublicClient();
  const forwarder = await hre.viem.deployContract("SpraycashForwarder");
  const usd = await hre.viem.deployContract("SpraycashUSD", [forwarder.address]);
  const fx = await hre.viem.deployContract("FxRateReceiver", [creForwarder.account.address]);
  const payroll = await hre.viem.deployContract("SpraycashPayroll", [usd.address, fx.address, forwarder.address]);

  const asCre = await hre.viem.getContractAt("FxRateReceiver", fx.address, { client: { wallet: creForwarder } });
  const pushRate = async (currencies = [INR], values = [RATE_INR], sources = [2]) => {
    const now = BigInt(await time.latest());
    await asCre.write.onReport([metadata(admin.account.address), report(currencies, values, sources, now)]);
  };

  const usdAsEmployer = await hre.viem.getContractAt("SpraycashUSD", usd.address, { client: { wallet: employer } });
  const payrollAsEmployer = await hre.viem.getContractAt("SpraycashPayroll", payroll.address, {
    client: { wallet: employer },
  });
  await usdAsEmployer.write.faucet();
  await usdAsEmployer.write.approve([payroll.address, 2n ** 256n - 1n]);

  return { admin, creForwarder, employer, stranger, publicClient, forwarder, usd, fx, payroll, pushRate, payrollAsEmployer };
}

type Ctx = Awaited<ReturnType<typeof deploy>>;

async function createPayslip(ctx: Ctx, amount = USD("1500"), duration = MONTH, claimWindow = 7n * 86400n) {
  const claimKey = generatePrivateKey();
  const claimSigner = privateKeyToAccount(claimKey);
  const [rate, updatedAt] = await ctx.fx.read.getRate([INR]);
  await ctx.payrollAsEmployer.write.createPayslip([INR, rate, updatedAt, amount, 0n, duration, claimSigner.address, claimWindow]);
  const id = (await ctx.payroll.read.nextId()) - 1n;
  return { id, claimSigner };
}

async function signClaim(ctx: Ctx, id: bigint, claimSigner: ReturnType<typeof privateKeyToAccount>, freelancer: Address) {
  const digest = await ctx.payroll.read.claimDigest([id, freelancer]);
  return claimSigner.signMessage({ message: { raw: digest } });
}

async function forwardCall(ctx: Ctx, signer: ReturnType<typeof privateKeyToAccount>, to: Address, data: Hex) {
  const chainId = await ctx.publicClient.getChainId();
  const nonce = await ctx.forwarder.read.nonces([signer.address]);
  const deadline = BigInt(await time.latest()) + 3600n;
  const gas = 500_000n;
  const signature = await signer.signTypedData({
    domain: { name: "SpraycashForwarder", version: "1", chainId, verifyingContract: ctx.forwarder.address },
    types: {
      ForwardRequest: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "gas", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint48" },
        { name: "data", type: "bytes" },
      ],
    },
    primaryType: "ForwardRequest",
    message: { from: signer.address, to, value: 0n, gas, nonce, deadline: Number(deadline), data },
  });
  // The admin wallet plays the relayer and pays the gas.
  return ctx.forwarder.write.execute([
    { from: signer.address, to, value: 0n, gas, deadline: Number(deadline), data, signature },
  ]);
}

describe("FxRateReceiver", () => {
  it("accepts reports only from the CRE forwarder", async () => {
    const ctx = await deploy();
    await ctx.pushRate();
    const [value, updatedAt, sources] = await ctx.fx.read.getRate([INR]);
    expect(value).to.equal(RATE_INR);
    expect(sources).to.equal(2);
    expect(updatedAt > 0n).to.equal(true);

    const asStranger = await hre.viem.getContractAt("FxRateReceiver", ctx.fx.address, {
      client: { wallet: ctx.stranger },
    });
    await expect(
      asStranger.write.onReport([metadata(ctx.admin.account.address), report([INR], [1n], [1], 10n ** 12n)]),
    ).to.be.rejectedWith("InvalidSender");
  });

  it("ignores replayed or older reports and enforces workflow owner", async () => {
    const ctx = await deploy();
    await ctx.pushRate();
    const asCre = await hre.viem.getContractAt("FxRateReceiver", ctx.fx.address, {
      client: { wallet: ctx.creForwarder },
    });
    await asCre.write.onReport([metadata(ctx.admin.account.address), report([INR], [1n], [2], 1n)]);
    expect((await ctx.fx.read.getRate([INR]))[0]).to.equal(RATE_INR);

    await ctx.fx.write.setExpectedWorkflowOwner([ctx.employer.account.address]);
    await expect(
      asCre.write.onReport([metadata(ctx.admin.account.address), report([INR], [1n], [2], 10n ** 12n)]),
    ).to.be.rejectedWith("InvalidWorkflowOwner");
    await asCre.write.onReport([metadata(ctx.employer.account.address), report([NGN], [150000000000n], [1], 10n ** 12n)]);
    expect((await ctx.fx.read.getRate([NGN]))[2]).to.equal(1);
  });

  it("supports the IReceiver interface", async () => {
    const ctx = await deploy();
    // bytes4(keccak256("onReport(bytes,bytes)")) xor nothing else = interface id
    expect(await ctx.fx.read.supportsInterface(["0x805f2132"])).to.equal(true);
    expect(await ctx.fx.read.supportsInterface(["0x01ffc9a7"])).to.equal(true);
  });
});

describe("SpraycashPayroll", () => {
  it("locks the quoted rate and streams pay every second", async () => {
    const ctx = await deploy();
    await ctx.pushRate();
    const { id } = await createPayslip(ctx, USD("3000"), 3000n);
    const p = await ctx.payroll.read.getPayslip([id]);
    expect(p.lockedRate).to.equal(RATE_INR);
    expect(p.deposit).to.equal(USD("3000"));
    expect(getAddress(p.employer)).to.equal(getAddress(ctx.employer.account.address));

    await time.increase(100);
    const earned = await ctx.payroll.read.earned([id]);
    expect(earned).to.equal(USD("100")); // 1 USD per second
    // Later rate updates do not change a locked payslip.
    await ctx.pushRate([INR], [9000000000n], [2]);
    expect((await ctx.payroll.read.getPayslip([id])).lockedRate).to.equal(RATE_INR);
  });

  it("rejects stale rates, changed quotes, unknown currencies and over-budget payslips", async () => {
    const ctx = await deploy();
    const signer = privateKeyToAccount(generatePrivateKey()).address;
    await expect(
      ctx.payrollAsEmployer.write.createPayslip([INR, RATE_INR, 0n, USD("1"), 0n, MONTH, signer, 86400n]),
    ).to.be.rejectedWith("UnsupportedCurrency");

    await ctx.pushRate();
    const [rate, updatedAt] = await ctx.fx.read.getRate([INR]);
    await expect(
      ctx.payrollAsEmployer.write.createPayslip([INR, rate + 1n, updatedAt, USD("1"), 0n, MONTH, signer, 86400n]),
    ).to.be.rejectedWith("QuoteChanged");
    await expect(
      ctx.payrollAsEmployer.write.createPayslip([INR, rate, updatedAt, USD("1000000"), 0n, MONTH, signer, 86400n]),
    ).to.be.rejectedWith("InsufficientBalance");

    await time.increase(601);
    await expect(
      ctx.payrollAsEmployer.write.createPayslip([INR, rate, updatedAt, USD("1"), 0n, MONTH, signer, 86400n]),
    ).to.be.rejectedWith("StaleRate");
  });

  it("binds a freelancer with the claim-link key and withdraws gaslessly via the forwarder", async () => {
    const ctx = await deploy();
    await ctx.pushRate();
    const { id, claimSigner } = await createPayslip(ctx, USD("3000"), 3000n);

    const freelancer = privateKeyToAccount(generatePrivateKey());
    expect(await ctx.publicClient.getBalance({ address: freelancer.address })).to.equal(0n);

    // A signature for a different account must not bind this one.
    const wrongSig = await signClaim(ctx, id, claimSigner, ctx.stranger.account.address);
    await expect(
      forwardCall(ctx, freelancer, ctx.payroll.address, encodeFunctionData({
        abi: ctx.payroll.abi, functionName: "claim", args: [id, wrongSig],
      })),
    ).to.be.rejected;

    const sig = await signClaim(ctx, id, claimSigner, freelancer.address);
    await forwardCall(ctx, freelancer, ctx.payroll.address, encodeFunctionData({
      abi: ctx.payroll.abi, functionName: "claim", args: [id, sig],
    }));
    expect(getAddress((await ctx.payroll.read.getPayslip([id])).freelancer)).to.equal(freelancer.address);
    expect(await ctx.payroll.read.payslipsOfFreelancer([freelancer.address])).to.deep.equal([id]);

    await time.increase(500);
    await forwardCall(ctx, freelancer, ctx.payroll.address, encodeFunctionData({
      abi: ctx.payroll.abi, functionName: "withdraw", args: [id],
    }));
    const balance = await ctx.usd.read.balanceOf([freelancer.address]);
    expect(balance >= USD("500") && balance <= USD("505")).to.equal(true);
    expect(await ctx.publicClient.getBalance({ address: freelancer.address })).to.equal(0n);

    const events = await ctx.payroll.getEvents.Withdrawn();
    expect(events[0].args.localAmount).to.equal((balance * RATE_INR) / 10n ** 8n);
  });

  it("stop keeps earned pay with the freelancer and refunds the rest instantly", async () => {
    const ctx = await deploy();
    await ctx.pushRate();
    const before = await ctx.usd.read.balanceOf([ctx.employer.account.address]);
    const { id, claimSigner } = await createPayslip(ctx, USD("3000"), 3000n);

    const freelancer = privateKeyToAccount(generatePrivateKey());
    await forwardCall(ctx, freelancer, ctx.payroll.address, encodeFunctionData({
      abi: ctx.payroll.abi, functionName: "claim", args: [id, await signClaim(ctx, id, claimSigner, freelancer.address)],
    }));

    await time.setNextBlockTimestamp((await ctx.payroll.read.getPayslip([id])).start + 1000n);
    await ctx.payrollAsEmployer.write.stop([id]);
    const after = await ctx.usd.read.balanceOf([ctx.employer.account.address]);
    expect(before - after).to.equal(USD("1000"));

    await time.increase(1000);
    expect(await ctx.payroll.read.withdrawable([id])).to.equal(USD("1000"));
    await expect(ctx.payrollAsEmployer.write.stop([id])).to.be.rejectedWith("AlreadyStopped");

    await forwardCall(ctx, freelancer, ctx.payroll.address, encodeFunctionData({
      abi: ctx.payroll.abi, functionName: "withdraw", args: [id],
    }));
    expect(await ctx.usd.read.balanceOf([freelancer.address])).to.equal(USD("1000"));
    expect(await ctx.usd.read.balanceOf([ctx.payroll.address])).to.equal(0n);
  });

  it("refunds an unclaimed payslip after the link expires, and the link stops working", async () => {
    const ctx = await deploy();
    await ctx.pushRate();
    const before = await ctx.usd.read.balanceOf([ctx.employer.account.address]);
    const { id, claimSigner } = await createPayslip(ctx, USD("3000"), 3000n, 600n);

    await expect(ctx.payroll.write.refundUnclaimed([id])).to.be.rejectedWith("ClaimNotExpired");
    await time.increase(601);
    await ctx.payroll.write.refundUnclaimed([id]);
    expect(await ctx.usd.read.balanceOf([ctx.employer.account.address])).to.equal(before);

    const freelancer = privateKeyToAccount(generatePrivateKey());
    await expect(
      forwardCall(ctx, freelancer, ctx.payroll.address, encodeFunctionData({
        abi: ctx.payroll.abi, functionName: "claim", args: [id, await signClaim(ctx, id, claimSigner, freelancer.address)],
      })),
    ).to.be.rejected;
    expect((await ctx.payroll.read.getPayslip([id])).voided).to.equal(true);
  });

  it("only the employer can stop and only the freelancer can withdraw", async () => {
    const ctx = await deploy();
    await ctx.pushRate();
    const { id } = await createPayslip(ctx);
    const asStranger = await hre.viem.getContractAt("SpraycashPayroll", ctx.payroll.address, {
      client: { wallet: ctx.stranger },
    });
    await expect(asStranger.write.stop([id])).to.be.rejectedWith("NotEmployer");
    await expect(asStranger.write.withdraw([id])).to.be.rejectedWith("NotFreelancer");
    await expect(asStranger.write.withdraw([999n])).to.be.rejectedWith("UnknownPayslip");
  });

  it("lets the owner tune the max rate age within bounds", async () => {
    const ctx = await deploy();
    await ctx.payroll.write.setMaxRateAge([60n]);
    expect(await ctx.payroll.read.maxRateAge()).to.equal(60n);
    await expect(ctx.payroll.write.setMaxRateAge([1n])).to.be.rejectedWith("InvalidMaxRateAge");
  });
});

describe("SpraycashUSD", () => {
  it("faucet tops up low balances only", async () => {
    const ctx = await deploy();
    expect(await ctx.usd.read.balanceOf([ctx.employer.account.address])).to.equal(USD("25000"));
    const asEmployer = await hre.viem.getContractAt("SpraycashUSD", ctx.usd.address, { client: { wallet: ctx.employer } });
    await expect(asEmployer.write.faucet()).to.be.rejectedWith("FaucetNotNeeded");
  });
});
