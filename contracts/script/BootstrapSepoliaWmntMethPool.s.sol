// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {IERC20} from "src/interfaces/IERC20.sol";
import {IAgniFactory} from "src/interfaces/IAgniFactory.sol";
import {IAgniNonfungiblePositionManager} from "src/interfaces/IAgniNonfungiblePositionManager.sol";

contract BootstrapSepoliaWmntMethPool is Script {
    struct Config {
        uint256 deployerPk;
        address positionManager;
        address factory;
        address wmnt;
        address meth;
        uint24 fee;
        uint160 sqrtPriceX96;
        int24 tickLower;
        int24 tickUpper;
        uint256 amountWmntDesired;
        uint256 amountMethDesired;
        address recipient;
        uint256 deadline;
    }

    function run() external {
        Config memory cfg = _loadConfig();
        (address token0, address token1, uint256 amount0Desired, uint256 amount1Desired) = _sortedInputs(cfg);

        vm.startBroadcast(cfg.deployerPk);

        IERC20(cfg.wmnt).approve(cfg.positionManager, cfg.amountWmntDesired);
        IERC20(cfg.meth).approve(cfg.positionManager, cfg.amountMethDesired);

        address pool = IAgniNonfungiblePositionManager(cfg.positionManager).createAndInitializePoolIfNecessary(
            token0, token1, cfg.fee, cfg.sqrtPriceX96
        );

        (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1) = IAgniNonfungiblePositionManager(
            cfg.positionManager
        ).mint(
            IAgniNonfungiblePositionManager.MintParams({
                token0: token0,
                token1: token1,
                fee: cfg.fee,
                tickLower: cfg.tickLower,
                tickUpper: cfg.tickUpper,
                amount0Desired: amount0Desired,
                amount1Desired: amount1Desired,
                amount0Min: 0,
                amount1Min: 0,
                recipient: cfg.recipient,
                deadline: cfg.deadline
            })
        );

        vm.stopBroadcast();

        console2.log("PositionManager:", cfg.positionManager);
        console2.log("Factory:", cfg.factory);
        console2.log("WMNT:", cfg.wmnt);
        console2.log("mETH:", cfg.meth);
        console2.log("Pool:", pool);
        console2.log("FactoryPool:", IAgniFactory(cfg.factory).getPool(cfg.wmnt, cfg.meth, cfg.fee));
        console2.log("Fee:", uint256(cfg.fee));
        console2.log("Position tokenId:", tokenId);
        console2.log("Liquidity:", uint256(liquidity));
        console2.log("Amount0 used:", amount0);
        console2.log("Amount1 used:", amount1);
    }

    function _loadConfig() internal view returns (Config memory cfg) {
        cfg.deployerPk = vm.envUint("PRIVATE_KEY");
        cfg.positionManager = vm.envAddress("POSITION_MANAGER_ADDRESS");
        cfg.factory = vm.envOr("FACTORY_ADDRESS", vm.envAddress("AGNI_SEPOLIA_FACTORY_ADDRESS"));
        cfg.wmnt = vm.envAddress("SEPOLIA_WMNT_ADDRESS");
        cfg.meth = vm.envAddress("SEPOLIA_METH_ADDRESS");
        cfg.fee = uint24(vm.envOr("POOL_FEE", uint256(500)));
        cfg.sqrtPriceX96 = uint160(vm.envUint("INITIAL_SQRT_PRICE_X96"));
        cfg.tickLower = int24(vm.envInt("TICK_LOWER"));
        cfg.tickUpper = int24(vm.envInt("TICK_UPPER"));
        cfg.amountWmntDesired = vm.envUint("WMNT_AMOUNT_DESIRED");
        cfg.amountMethDesired = vm.envUint("METH_AMOUNT_DESIRED");
        cfg.recipient = vm.envOr("POSITION_RECIPIENT", address(vm.addr(cfg.deployerPk)));
        cfg.deadline = vm.envOr("POSITION_DEADLINE", uint256(block.timestamp + 1 days));
    }

    function _sortedInputs(Config memory cfg)
        internal
        pure
        returns (address token0, address token1, uint256 amount0Desired, uint256 amount1Desired)
    {
        if (cfg.wmnt < cfg.meth) {
            return (cfg.wmnt, cfg.meth, cfg.amountWmntDesired, cfg.amountMethDesired);
        }
        return (cfg.meth, cfg.wmnt, cfg.amountMethDesired, cfg.amountWmntDesired);
    }
}
