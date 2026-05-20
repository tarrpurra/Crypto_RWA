// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {IERC20} from "src/interfaces/IERC20.sol";
import {IAgniFactory} from "src/interfaces/IAgniFactory.sol";
import {IAgniNonfungiblePositionManager} from "src/interfaces/IAgniNonfungiblePositionManager.sol";

contract BootstrapAgniMockPool is Script {
    struct Config {
        uint256 deployerPk;
        address positionManager;
        address factory;
        address tokenA;
        address tokenB;
        uint24 fee;
        uint160 sqrtPriceX96;
        int24 tickLower;
        int24 tickUpper;
        uint256 amountADesired;
        uint256 amountBDesired;
        address recipient;
        uint256 deadline;
    }

    struct BootstrapResult {
        address pool;
        address factoryPool;
        uint256 tokenId;
        uint128 liquidity;
        uint256 amount0;
        uint256 amount1;
    }

    function run() external {
        Config memory cfg = _loadConfig();
        (address token0, address token1, uint256 amount0Desired, uint256 amount1Desired) = _sortPoolInputs(cfg);

        vm.startBroadcast(cfg.deployerPk);

        IERC20(cfg.tokenA).approve(cfg.positionManager, cfg.amountADesired);
        IERC20(cfg.tokenB).approve(cfg.positionManager, cfg.amountBDesired);

        BootstrapResult memory result = _bootstrapPool(cfg, token0, token1, amount0Desired, amount1Desired);

        vm.stopBroadcast();

        console2.log("PositionManager:", cfg.positionManager);
        console2.log("Factory:", cfg.factory);
        console2.log("TokenA:", cfg.tokenA);
        console2.log("TokenB:", cfg.tokenB);
        console2.log("Pool:", result.pool);
        console2.log("FactoryPool:", result.factoryPool);
        console2.log("Position tokenId:", result.tokenId);
        console2.log("Liquidity:", uint256(result.liquidity));
        console2.log("Amount0 used:", result.amount0);
        console2.log("Amount1 used:", result.amount1);
    }

    function _loadConfig() internal view returns (Config memory cfg) {
        cfg.deployerPk = vm.envUint("PRIVATE_KEY");
        cfg.positionManager = vm.envAddress("POSITION_MANAGER_ADDRESS");
        cfg.factory = vm.envAddress("FACTORY_ADDRESS");
        cfg.tokenA = vm.envAddress("TOKEN_A_ADDRESS");
        cfg.tokenB = vm.envAddress("TOKEN_B_ADDRESS");
        cfg.fee = uint24(vm.envUint("POOL_FEE"));
        cfg.sqrtPriceX96 = uint160(vm.envUint("INITIAL_SQRT_PRICE_X96"));
        cfg.tickLower = int24(vm.envInt("TICK_LOWER"));
        cfg.tickUpper = int24(vm.envInt("TICK_UPPER"));
        cfg.amountADesired = vm.envUint("AMOUNT_A_DESIRED");
        cfg.amountBDesired = vm.envUint("AMOUNT_B_DESIRED");
        cfg.recipient = vm.envOr("POSITION_RECIPIENT", address(vm.addr(cfg.deployerPk)));
        cfg.deadline = vm.envOr("POSITION_DEADLINE", uint256(block.timestamp + 1 days));
    }

    function _sortPoolInputs(Config memory cfg)
        internal
        pure
        returns (address token0, address token1, uint256 amount0Desired, uint256 amount1Desired)
    {
        if (cfg.tokenA < cfg.tokenB) {
            return (cfg.tokenA, cfg.tokenB, cfg.amountADesired, cfg.amountBDesired);
        }

        return (cfg.tokenB, cfg.tokenA, cfg.amountBDesired, cfg.amountADesired);
    }

    function _bootstrapPool(
        Config memory cfg,
        address token0,
        address token1,
        uint256 amount0Desired,
        uint256 amount1Desired
    ) internal returns (BootstrapResult memory result) {
        result.pool = IAgniNonfungiblePositionManager(cfg.positionManager).createAndInitializePoolIfNecessary(
            token0, token1, cfg.fee, cfg.sqrtPriceX96
        );

        (result.tokenId, result.liquidity, result.amount0, result.amount1) = IAgniNonfungiblePositionManager(
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

        result.factoryPool = IAgniFactory(cfg.factory).getPool(cfg.tokenA, cfg.tokenB, cfg.fee);
    }
}
