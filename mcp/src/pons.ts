import {
  encodeFunctionData,
  erc20Abi,
  keccak256,
  toHex,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { v2FactoryAbi } from "./abi/v2Factory.js";
import { launchAndBuyAbi } from "./abi/launchAndBuy.js";
import { launchDeployerAbi } from "./abi/launchDeployer.js";
import { memeHookAbi } from "./abi/memeHook.js";
import { buybackVaultAbi } from "./abi/buybackVault.js";
import { NATIVE_PAIR_TOKEN, V2_FACTORY_FIRST_LOG_BLOCK } from "./evmchain.js";

/**
 * Pons (ponsfamily.com) launchpad on Robinhood Chain.
 *
 * Contract addresses read from the chain; ABI files under ./abi are the
 * Sourcify-verified ABIs (provenance header in each). Protocol *parameters*
 * (fees, thresholds, approved pair tokens) are read live at call time, never
 * hard-coded — the owner can change them and the on-chain values are the truth.
 *
 * V2 model: fixed 1B supply bonding curve, graduating into a permanently
 * locked Uniswap V4 pool once the threshold is raised. No bonding-curve
 * migration step the creator must run — graduation is anyone-callable.
 */

export const PONS = {
  v2Factory: "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e",
  memeHook: "0xe5e702641ea86f4ae6cc3cdaed2b886f976be044",
  feeEscrow: "0xd3afeb2a57f70ef218aa82451c51b2fb0416ac9e",
  buybackVault: "0x42df2a798f82289e177311362e8f5ccc45c1219c",
} as const;

export const BASIS_POINTS = 10_000n;

/** Fixed by the V2 launch config; read live and asserted. */
export const EXPECTED_SUPPLY = 1_000_000_000n;

export const METADATA_LIMITS = { name: 64, symbol: 16, logo: 512, description: 2048, social: 256 } as const;

const MAX_TOTAL_TRADE_FEE_BPS = 2_000n;

export interface Socials {
  twitter: string;
  telegram: string;
  discord: string;
  website: string;
  farcaster: string;
}

export const EMPTY_SOCIALS: Socials = { twitter: "", telegram: "", discord: "", website: "", farcaster: "" };

export interface FeePolicySnapshot {
  protocolFeeRecipient: Address;
  protocolFeeShareBps: number;
  buybackBurnBps: number;
  hookFeeBps: number;
  maxInternalPriceImpactBps: number;
}

export interface LaunchConfig {
  supply: bigint;
  curveFeeBps: bigint;
  phantomQuote: bigint;
  graduationThreshold: bigint;
  poolFee: number;
  tickSpacing: number;
  enabled: boolean;
}

export interface LaunchContext {
  configId: bigint;
  config: LaunchConfig;
  policy: FeePolicySnapshot;
  launchFee: bigint;
  launchEnabled: boolean;
  canLaunch: boolean;
  maxCreatorTaxBps: bigint;
  snipeTaxStartBps: bigint;
  snipeTaxSeconds: bigint;
  economics: Hex;
  launchDeployer: Address;
  launchForwarder: Address;
}

export interface PairToken {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  native: boolean;
  phantomQuote: bigint;
  graduationThreshold: bigint;
  expectedDecimals: number;
}

/** Everything the factory would consult for a launch, read in one multicall. */
export async function readLaunchContext(
  client: PublicClient,
  configId: bigint,
  account: Address,
): Promise<LaunchContext> {
  const [config, policy, launchFee, launchEnabled, canLaunch, maxCreatorTaxBps, startBps, seconds, economics, launchDeployer, launchForwarder] =
    await client.multicall({
      contracts: [
        { address: PONS.v2Factory, abi: v2FactoryAbi, functionName: "getLaunchConfig", args: [configId] },
        { address: PONS.memeHook, abi: memeHookAbi, functionName: "currentFeePolicy" },
        { address: PONS.v2Factory, abi: v2FactoryAbi, functionName: "launchFee" },
        { address: PONS.v2Factory, abi: v2FactoryAbi, functionName: "launchEnabled" },
        { address: PONS.v2Factory, abi: v2FactoryAbi, functionName: "canLaunch", args: [account] },
        { address: PONS.v2Factory, abi: v2FactoryAbi, functionName: "maxCreatorTaxBps" },
        { address: PONS.v2Factory, abi: v2FactoryAbi, functionName: "snipeTaxStartBps" },
        { address: PONS.v2Factory, abi: v2FactoryAbi, functionName: "snipeTaxSeconds" },
        {
          address: PONS.v2Factory,
          abi: v2FactoryAbi,
          functionName: "previewLaunchEconomics",
          args: [configId, NATIVE_PAIR_TOKEN],
        },
        { address: PONS.v2Factory, abi: v2FactoryAbi, functionName: "launchDeployer" },
        { address: PONS.v2Factory, abi: v2FactoryAbi, functionName: "launchForwarder" },
      ],
      allowFailure: false,
    });
  return {
    configId,
    config: { ...config } as LaunchConfig,
    policy: { ...policy } as FeePolicySnapshot,
    launchFee,
    launchEnabled,
    canLaunch,
    maxCreatorTaxBps,
    snipeTaxStartBps: startBps,
    snipeTaxSeconds: seconds,
    economics,
    launchDeployer,
    launchForwarder,
  };
}

/** Economics digest for the chosen quote asset; pins the launch terms on-chain. */
export async function readEconomicsGuard(client: PublicClient, configId: bigint, pairToken: Address): Promise<Hex> {
  return client.readContract({
    address: PONS.v2Factory,
    abi: v2FactoryAbi,
    functionName: "previewLaunchEconomics",
    args: [configId, pairToken],
  });
}

// ---- approved quote assets ("pairs": ETH plus approved tokenized equities,
// index funds and stablecoins) ----

/**
 * The approved pair-token list is owner-managed and has no enumerator, so it is
 * reconstructed by folding `PairTokenApprovalUpdated` over the factory's whole
 * log history, then confirmed token-by-token against `approvedPairTokens`.
 */
export async function readPairTokens(client: PublicClient, configId: bigint): Promise<PairToken[]> {
  const head = await client.getBlockNumber();
  const logs = await client.getLogs({
    address: PONS.v2Factory,
    event: {
      type: "event",
      name: "PairTokenApprovalUpdated",
      inputs: [
        { type: "address", name: "pairToken", indexed: true },
        { type: "bool", name: "approved", indexed: false },
      ],
    },
    fromBlock: V2_FACTORY_FIRST_LOG_BLOCK,
    toBlock: head,
  });

  const order: Address[] = [];
  const state = new Map<Address, boolean>();
  for (const log of logs) {
    const args = (log as { args?: { pairToken?: Address; approved?: boolean } }).args;
    if (!args?.pairToken || args.approved === undefined) continue;
    const address = args.pairToken.toLowerCase() as Address;
    if (!state.has(address)) order.push(address);
    state.set(address, args.approved);
  }
  const candidates = order.filter((a) => state.get(a));
  if (candidates.length === 0) throw new Error("the factory reports no approved quote assets");

  const confirmations = await client.multicall({
    contracts: candidates.map((address) => ({
      address: PONS.v2Factory,
      abi: v2FactoryAbi,
      functionName: "approvedPairTokens" as const,
      args: [address] as const,
    })),
    allowFailure: false,
  });
  const approved = candidates.filter((_, i) => confirmations[i] === true);

  const economics = await client.multicall({
    contracts: approved.flatMap((address) => [
      { address: PONS.v2Factory, abi: v2FactoryAbi, functionName: "pairTokenEconomics" as const, args: [address] as const },
      { address, abi: erc20Abi, functionName: "symbol" as const },
      { address, abi: erc20Abi, functionName: "name" as const },
      { address, abi: erc20Abi, functionName: "decimals" as const },
    ]),
    allowFailure: true,
  });

  const config = await client.readContract({
    address: PONS.v2Factory,
    abi: v2FactoryAbi,
    functionName: "getLaunchConfig",
    args: [configId],
  });

  const tokens: PairToken[] = [
    {
      address: NATIVE_PAIR_TOKEN,
      symbol: "ETH",
      name: "Native ETH",
      decimals: 18,
      native: true,
      phantomQuote: (config as { phantomQuote: bigint }).phantomQuote,
      graduationThreshold: (config as { graduationThreshold: bigint }).graduationThreshold,
      expectedDecimals: 18,
    },
  ];
  for (const [i, address] of approved.entries()) {
    const ec = economics[i * 4];
    const symbol = economics[i * 4 + 1];
    const name = economics[i * 4 + 2];
    const decimals = economics[i * 4 + 3];
    if (ec.status !== "success") continue;
    const [phantomQuote, graduationThreshold, expectedDecimals] = ec.result as readonly [bigint, bigint, number];
    tokens.push({
      address,
      symbol: symbol.status === "success" ? String(symbol.result) : address.slice(0, 8),
      name: name.status === "success" ? String(name.result) : "",
      decimals: decimals.status === "success" ? Number(decimals.result) : 18,
      native: false,
      phantomQuote,
      graduationThreshold,
      expectedDecimals,
    });
  }
  return tokens;
}

export function resolvePairToken(tokens: readonly PairToken[], raw: string): PairToken {
  const wanted = raw.trim();
  if (wanted === "") throw new Error("pair needs a symbol or an address");
  if (wanted.startsWith("0x") && wanted.length === 42) {
    const address = wanted.toLowerCase() as Address;
    const match = tokens.find((t) => t.address.toLowerCase() === address);
    if (match) return match;
    throw new Error(`${wanted} is not an approved quote asset — pons_pairs lists them all`);
  }
  const matches = tokens.filter((t) => t.symbol.toLowerCase() === wanted.toLowerCase());
  if (matches.length === 1) return matches[0] as PairToken;
  if (matches.length === 0) throw new Error(`no approved quote asset is called ${wanted} — pons_pairs lists them all`);
  throw new Error(`${matches.length} approved assets are called ${wanted} — pass the address instead`);
}

// ---- launch construction ----

export interface TokenParams {
  name: string;
  symbol: string;
  logo: string;
  description: string;
  socials: Socials;
  creatorFeeRecipient: Address;
  creatorTaxBps: number;
  buybackEnabled: boolean;
  expectedEconomics: Hex;
  salt: Hex;
}

export interface LaunchIntent {
  params: TokenParams;
  configId: bigint;
  pair: PairToken;
  /** Opening buy in the pair asset's base units; 0 = no dev buy. */
  devBuy: bigint;
  slippageBps: bigint;
  recipient: Address;
}

export function saltFor(name: string, symbol: string, nonce = ""): Hex {
  return keccak256(toHex(`${name} ${symbol} ${nonce}`));
}

function byteLength(s: string): number {
  return Buffer.byteLength(s, "utf8");
}

/** Reject a launch the factory would reject, before anything is built. */
export function validateLaunch(intent: LaunchIntent, context: LaunchContext): void {
  const { params } = intent;
  if (params.name.trim() === "" || params.symbol.trim() === "") {
    throw new Error("a launch needs both a name and a symbol");
  }
  const limits: [string, string, number][] = [
    ["name", params.name, METADATA_LIMITS.name],
    ["symbol", params.symbol, METADATA_LIMITS.symbol],
    ["logo", params.logo, METADATA_LIMITS.logo],
    ["description", params.description, METADATA_LIMITS.description],
    ["twitter", params.socials.twitter, METADATA_LIMITS.social],
    ["telegram", params.socials.telegram, METADATA_LIMITS.social],
    ["discord", params.socials.discord, METADATA_LIMITS.social],
    ["website", params.socials.website, METADATA_LIMITS.social],
    ["farcaster", params.socials.farcaster, METADATA_LIMITS.social],
  ];
  const over = limits.find(([, v, l]) => byteLength(v) > l);
  if (over) throw new Error(`${over[0]} is ${byteLength(over[1])} bytes; the contract accepts ${over[2]}`);

  if (!context.config.enabled) throw new Error(`launch config ${context.configId} is disabled`);
  if (!context.canLaunch) throw new Error("launching is currently disabled and this address is not whitelisted");

  const creatorTax = BigInt(params.creatorTaxBps);
  if (creatorTax > context.maxCreatorTaxBps) {
    throw new Error(`creator tax is ${params.creatorTaxBps} bps; the factory currently caps it at ${context.maxCreatorTaxBps}`);
  }
  if (context.config.curveFeeBps + creatorTax > MAX_TOTAL_TRADE_FEE_BPS) {
    throw new Error(`curve fee ${context.config.curveFeeBps} bps + creator tax ${params.creatorTaxBps} bps exceeds the ${MAX_TOTAL_TRADE_FEE_BPS} bps combined ceiling`);
  }
  if (BigInt(context.policy.hookFeeBps) + creatorTax > MAX_TOTAL_TRADE_FEE_BPS) {
    throw new Error(`pool hook fee ${context.policy.hookFeeBps} bps + creator tax ${params.creatorTaxBps} bps exceeds the ${MAX_TOTAL_TRADE_FEE_BPS} bps combined ceiling`);
  }
  if (!intent.pair.native && intent.pair.decimals !== intent.pair.expectedDecimals) {
    throw new Error(
      `${intent.pair.symbol} reports ${intent.pair.decimals} decimals but the factory sized its economics for ${intent.pair.expectedDecimals}`,
    );
  }
  if (intent.devBuy < 0n) throw new Error("dev buy cannot be negative");
}

export interface CurveState {
  quoteReserve: bigint;
  tokenReserve: bigint;
  reservedTokens: bigint;
  curveFeeBps: bigint;
  creatorTaxBps: bigint;
}

/** The curve as it stands the instant it is created. */
export function openingCurveState(config: LaunchConfig, pair: PairToken, creatorTaxBps: number): CurveState {
  const phantomQuote = pair.native ? config.phantomQuote : pair.phantomQuote;
  const threshold = pair.native ? config.graduationThreshold : pair.graduationThreshold;
  return {
    quoteReserve: phantomQuote,
    tokenReserve: config.supply,
    reservedTokens: (config.supply * phantomQuote) / (phantomQuote + threshold),
    curveFeeBps: config.curveFeeBps,
    creatorTaxBps: BigInt(creatorTaxBps),
  };
}

/** Constant-product output for an exact input, net of feeBps on the input (PonsV2BondingCurveMath). */
export function getAmountOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint, feeBps: bigint): bigint {
  if (amountIn <= 0n) throw new Error("curve cannot price a trade: empty input");
  if (reserveIn <= 0n || reserveOut <= 0n) throw new Error("curve cannot price a trade: no liquidity");
  const amountInWithFee = amountIn * (BASIS_POINTS - feeBps);
  const out = (amountInWithFee * reserveOut) / (reserveIn * BASIS_POINTS + amountInWithFee);
  if (out === 0n) throw new Error("curve cannot price a trade: zero output");
  return out;
}

export interface BuyQuote {
  offered: bigint;
  spent: bigint;
  refund: bigint;
  tokensOut: bigint;
  clamped: boolean;
}

/** `Math.mulDiv(x, y, d, Rounding.Ceil)`, the curve's own gross-up. */
function mulDivCeil(x: bigint, y: bigint, denominator: bigint): bigint {
  const product = x * y;
  return product % denominator === 0n ? product / denominator : product / denominator + 1n;
}

/** Input required for an exact output; rounds up, exactly as the library does. */
export function getAmountIn(amountOut: bigint, reserveIn: bigint, reserveOut: bigint, feeBps: bigint): bigint {
  if (amountOut <= 0n) throw new Error("curve cannot price a trade: empty output");
  if (reserveIn <= 0n || reserveOut <= amountOut) throw new Error("curve cannot price a trade: no liquidity");
  if (feeBps >= BASIS_POINTS) throw new Error("curve cannot price a trade: no liquidity");
  const numerator = amountOut * reserveIn * BASIS_POINTS;
  const denominator = (reserveOut - amountOut) * (BASIS_POINTS - feeBps);
  return numerator / denominator + 1n;
}

/**
 * Price an opening buy. Mirrors PonsV2BondingCurve.buy: the fee legs come off
 * the input, the remainder swaps against the full reserves, and a fill crossing
 * into the reserved allocation is clamped to it with the input grossed back up
 * (the surplus is refunded in the same transaction).
 *
 * The opening buy goes through the launch router, which exempts its recipient
 * from the snipe tax, so this prices at snipeTax = 0.
 */
export function quoteBuy(state: CurveState, offered: bigint): BuyQuote {
  if (offered <= 0n) throw new Error("dev buy must be positive");
  const sellable = state.tokenReserve > state.reservedTokens ? state.tokenReserve - state.reservedTokens : 0n;
  if (sellable === 0n) throw new Error("curve cannot price a trade: nothing sellable");

  const feeLegs = (amount: bigint): bigint => (amount * (state.curveFeeBps + state.creatorTaxBps)) / BASIS_POINTS;

  let spent = offered;
  let net = offered - feeLegs(spent);
  let tokensOut = getAmountOut(net, state.quoteReserve, state.tokenReserve, 0n);

  let clamped = false;
  if (tokensOut > sellable) {
    clamped = true;
    tokensOut = sellable;
    const exactNet = getAmountIn(sellable, state.quoteReserve, state.tokenReserve, 0n);
    const grossed = mulDivCeil(exactNet, BASIS_POINTS, BASIS_POINTS - state.curveFeeBps - state.creatorTaxBps);
    spent = grossed < offered ? grossed : offered;
    net = spent - feeLegs(spent);
  }

  return { offered, spent, refund: offered - spent, tokensOut, clamped };
}

export function withSlippage(amount: bigint, slippageBps: bigint): bigint {
  if (slippageBps <= 0n) return amount;
  if (slippageBps >= BASIS_POINTS) return 0n;
  return (amount * (BASIS_POINTS - slippageBps)) / BASIS_POINTS;
}

export interface LaunchEconomics {
  launchFee: bigint;
  devBuy: bigint;
  value: bigint;
  tokensOut: bigint;
  minTokensOut: bigint;
  supplyShareBps: bigint;
  reservedTokens: bigint;
  sellableTokens: bigint;
}

export function previewEconomics(intent: LaunchIntent, context: LaunchContext): LaunchEconomics {
  const state = openingCurveState(context.config, intent.pair, intent.params.creatorTaxBps);
  const sellable = state.tokenReserve - state.reservedTokens;
  if (intent.devBuy === 0n) {
    return {
      launchFee: context.launchFee,
      devBuy: 0n,
      value: context.launchFee,
      tokensOut: 0n,
      minTokensOut: 0n,
      supplyShareBps: 0n,
      reservedTokens: state.reservedTokens,
      sellableTokens: sellable,
    };
  }
  // The router exempts the buy recipient from the snipe tax, so price at 0.
  const quote = quoteBuy(state, intent.devBuy);
  return {
    launchFee: context.launchFee,
    devBuy: quote.spent,
    value: intent.pair.native ? context.launchFee + intent.devBuy : context.launchFee,
    tokensOut: quote.tokensOut,
    minTokensOut: withSlippage(quote.tokensOut, intent.slippageBps),
    supplyShareBps: (quote.tokensOut * BASIS_POINTS) / context.config.supply,
    reservedTokens: state.reservedTokens,
    sellableTokens: sellable,
  };
}

/** The struct PonsV2LaunchDeployer hashes into the CREATE2 address. */
function deploymentStruct(intent: LaunchIntent, context: LaunchContext, deployer: Address) {
  const { params, pair } = intent;
  return {
    pairToken: pair.address,
    // The factory substitutes the deployer for a zero recipient in the CREATE2 preimage.
    creatorFeeRecipient: params.creatorFeeRecipient === NATIVE_PAIR_TOKEN ? deployer : params.creatorFeeRecipient,
    originalDeployer: deployer,
    feePolicy: PONS.memeHook,
    policy: context.policy,
    feeEscrow: PONS.feeEscrow,
    buybackVault: PONS.buybackVault,
    phantomQuote: pair.native ? context.config.phantomQuote : pair.phantomQuote,
    curveFeeBps: context.config.curveFeeBps,
    creatorTaxBps: BigInt(params.creatorTaxBps),
    buybackEnabled: params.buybackEnabled,
    graduationThreshold: pair.native ? context.config.graduationThreshold : pair.graduationThreshold,
    supply: context.config.supply,
    salt: params.salt,
    name: params.name,
    symbol: params.symbol,
    logo: params.logo,
    description: params.description,
    socials: params.socials,
  };
}

/** Where this launch will land, knowable before anything is sent. */
export async function predictLaunchAddresses(
  client: PublicClient,
  intent: LaunchIntent,
  context: LaunchContext,
  deployer: Address,
): Promise<{ token: Address; curve: Address; taken: boolean }> {
  const [token, curve] = await client.readContract({
    address: context.launchDeployer,
    abi: launchDeployerAbi,
    functionName: "predictLaunchAddresses",
    args: [deploymentStruct(intent, context, deployer)],
  });
  const code = await client.getCode({ address: curve });
  return { token, curve, taken: code !== undefined && code !== "0x" };
}

interface BuiltTx {
  to: Address;
  data: Hex;
  value: bigint;
  approveTo?: Address;
  approveAmount?: bigint;
}

/**
 * Build the launch transaction.
 *
 * With no dev buy the factory is called directly — it demands msg.value ==
 * launchFee exactly. With a dev buy the call goes through the factory's
 * trusted launchForwarder (PonsV2LaunchAndBuy), which exempts the recipient
 * from the 99% opening snipe tax; a launch left unbought has been bought out
 * inside two blocks on this chain.
 *
 * For an ERC-20 quote (stock pairs), the router pulls the buy with
 * transferFrom, so an ERC-20 approve of the forwarder must land first; the
 * return value tells the caller to send that approve in a preceding tx.
 */
export function buildLaunchTx(intent: LaunchIntent, context: LaunchContext, economics: LaunchEconomics): BuiltTx {
  const { params } = intent;
  const tokenParams = {
    name: params.name,
    symbol: params.symbol,
    logo: params.logo,
    description: params.description,
    socials: params.socials,
    creatorFeeRecipient: params.creatorFeeRecipient,
    creatorTaxBps: params.creatorTaxBps,
    buybackEnabled: params.buybackEnabled,
    expectedEconomics: params.expectedEconomics,
    salt: params.salt,
  };
  if (intent.devBuy === 0n) {
    return {
      to: PONS.v2Factory,
      data: encodeFunctionData({
        abi: v2FactoryAbi,
        functionName: "launchToken",
        args: [tokenParams, intent.configId, intent.pair.address, []],
      }),
      value: context.launchFee,
    };
  }
  return {
    to: context.launchForwarder,
    data: encodeFunctionData({
      abi: launchAndBuyAbi,
      functionName: "launchAndBuy",
      args: [tokenParams, intent.configId, intent.pair.address, intent.devBuy, economics.minTokensOut, intent.recipient, []],
    }),
    value: economics.value,
    approveTo: intent.pair.native ? undefined : intent.pair.address,
    approveAmount: intent.pair.native ? undefined : intent.devBuy,
  };
}

// ---- post-launch fee management ----

/** GraduationPhase enum values on the factory. */
export const PHASE_NAMES = ["curve (not graduated)", "swept", "graduated to Uniswap V4 pool", "rescued"] as const;

export interface LaunchedToken {
  token: Address;
  curve: Address;
  deployer: Address;
  creatorFeeRecipient: Address;
  pairToken: Address;
  graduationThreshold: bigint;
  poolFee: number;
  tickSpacing: number;
  creatorTaxBps: number;
  buybackEnabled: boolean;
  phase: number;
  sweptQuote: bigint;
  sweptTokens: bigint;
  sweptAt: bigint;
  exists: boolean;
}

/** Full on-chain record for one launched token. */
export async function readLaunchedToken(client: PublicClient, token: Address): Promise<LaunchedToken> {
  const r = await client.readContract({
    address: PONS.v2Factory,
    abi: v2FactoryAbi,
    functionName: "getLaunchedToken",
    args: [token],
  });
  return r as unknown as LaunchedToken;
}

export interface PendingRecipientChange {
  newRecipient: Address;
  effectiveAt: bigint;
  expiresAt: bigint;
}

/** A protocol-owner-proposed recipient override, if one is pending. */
export async function readPendingRecipientChange(client: PublicClient, token: Address): Promise<PendingRecipientChange | null> {
  const [newRecipient, effectiveAt, expiresAt] = await client.readContract({
    address: PONS.v2Factory,
    abi: v2FactoryAbi,
    functionName: "pendingCreatorFeeRecipient",
    args: [token],
  });
  if (newRecipient === NATIVE_PAIR_TOKEN) return null;
  return { newRecipient, effectiveAt, expiresAt };
}

export interface BuybackVaultInfo {
  totalLocked: bigint;
  totalReleased: bigint;
  releasable: bigint;
  vestedAmount: bigint;
  vestingStart: bigint;
  vestingDuration: bigint;
}

/** Reward vault state for one token's buyback vest. */
export async function readBuybackVaultInfo(client: PublicClient, token: Address): Promise<BuybackVaultInfo> {
  const [totalLocked, totalReleased, releasable, vestedAmount, vestingStart, vestingDuration] = await client.multicall({
    contracts: [
      { address: PONS.buybackVault, abi: buybackVaultAbi, functionName: "totalLocked", args: [token] },
      { address: PONS.buybackVault, abi: buybackVaultAbi, functionName: "totalReleased", args: [token] },
      { address: PONS.buybackVault, abi: buybackVaultAbi, functionName: "releasable", args: [token] },
      { address: PONS.buybackVault, abi: buybackVaultAbi, functionName: "vestedAmount", args: [token] },
      { address: PONS.buybackVault, abi: buybackVaultAbi, functionName: "vestingStart", args: [token] },
      { address: PONS.buybackVault, abi: buybackVaultAbi, functionName: "VESTING_DURATION" },
    ],
    allowFailure: false,
  });
  return { totalLocked, totalReleased, releasable, vestedAmount, vestingStart, vestingDuration };
}

/**
 * Transfer the creator-fee receiving address. Immediate; callable only by the
 * current recipient. The factory forwards the change to the curve (pre-
 * graduation) or the pool hook (post-graduation) and re-points the reward
 * vault beneficiary, so accrued and vested rewards follow the new address.
 */
export function buildTransferRecipientTx(token: Address, newRecipient: Address): BuiltTx {
  return {
    to: PONS.v2Factory,
    data: encodeFunctionData({
      abi: v2FactoryAbi,
      functionName: "transferCreatorFeeRecipient",
      args: [token, newRecipient],
    }),
    value: 0n,
  };
}

/**
 * Toggle the reward vault for one launch. Enabling is creator-only (it spends
 * the creator's own fee bucket); the protocol owner may only ever disable.
 */
export function buildSetBuybackTx(token: Address, enabled: boolean): BuiltTx {
  return {
    to: PONS.v2Factory,
    data: encodeFunctionData({
      abi: v2FactoryAbi,
      functionName: "setBuybackEnabled",
      args: [token, enabled],
    }),
    value: 0n,
  };
}
