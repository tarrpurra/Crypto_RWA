export const MANTLE_MAINNET = {
  chainId: 5000,
  rpcUrl: "https://rpc.mantle.xyz",

  assets: {
    USDY: "0x5bE26527e817998A7206475496fDE1E68957c5A6",
    mUSD: "0xab575258d37EaA5C8956EfABe71F4eE8F6397cF3",
    mETH: "0xcDA86A272531e8640cD7F1a92c01839911B90bb0",
    USDC: "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9",
    WMNT: "0x78c1b0C915c4FAA5FffA6CAbf0219DA63d7f4cb8",
    ETH_L2: "0xdEAddEaDdeadDEadDEADDEAddEADDEAddead1111",
  },

  ondo: {
    usdyRedemptionPriceOracle: "0xA96abbe61AfEdEB0D14a20440Ae7100D9aB4882f",
    blocklist: "0xdBd7a7d8807f0C98c9A58f7732f2799c8587e5c6",
    status: "verified_address_selector_pending",
  },

  merchantMoe: {
    classicRouter: "0xeaEE7EE68874218c3558b40063c42B82D3E7232a",
    lbRouter: "0x013e138EF6008ae5FDFDE29700e3f2Bc61d21E3a",
    aggregatorRouter: "0x45A62B090DF48243F12A21897e7ed91863E2c86b",
    factory: "0x5bef015ca9424a7c07b68490616a4c1f094bedec",
    lbFactory: "0xa6630671775c4EA2743840F9A5016dCf2A104054",
    status: "verified_mainnet",
  },

  agni: {
    factory: "0x25780dc8Fc3cfBD75F33bFDAB65e969b603b2035",
    swapRouter: "0x319B69888b0d11cEC22caA5034e25FfFBDc88421",
    quoter: "0x9488C05a7b75a6FefdcAE4f11a33467bcBA60177",
    quoterV2: "0xc4aaDc921E1cdb66c5300Bc158a313292923C0cb",
    candidateFees: [100, 500, 3000, 10000],
    status: "verified_mainnet",
  },

  pyth: {
    contract: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729",
    ethUsdFeedId: "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
  },
} as const;

export const MANTLE_SEPOLIA = {
  chainId: 5003,
  rpcUrl: "https://rpc.sepolia.mantle.xyz",

  agni: {
    factory: "0xA9AcD50B042A72c33d05fDcC8ad209d3aD361762",
    swapRouter: "0xe38cfa32cCd918d94E2e20230dFaD1A4Fd8aEF16",
    quoter: "0xA82F8dC4704d3512b120de70480219761F24B6Eb",
    quoterV2: "0x9Da17239a4170f50A5A2c11813BD0C601b5c9693",
    status: "candidate_verify_before_use",
  },

  ondo: {
    status: "unverified_do_not_use_without_manual_verification",
  },

  merchantMoe: {
    status: "unverified_do_not_use_without_manual_verification",
  },
} as const;
