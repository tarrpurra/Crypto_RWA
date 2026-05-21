// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";

import {ExecutorVault} from "../src/core/ExecutorVault.sol";
import {TradeApprovalManager} from "../src/core/TradeApprovalManager.sol";
import {IAgniSwapRouter} from "../src/interfaces/IAgniSwapRouter.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {ExecutionTypes} from "../src/libraries/ExecutionTypes.sol";
import {ProposalHashLib} from "../src/libraries/ProposalHashLib.sol";

contract RunSepoliaAgniExactInputSingleLifecycle is Script {
    using ProposalHashLib for ExecutionTypes.ExecutionPayload;

    struct Config {
        uint256 deployerPk;
        TradeApprovalManager approvalManager;
        ExecutorVault vault;
        address router;
        address tokenIn;
        address tokenOut;
        uint24 fee;
        uint256 amountIn;
        uint256 minAmountOut;
        uint256 nonce;
        uint256 swapTtl;
        uint256 proposalTtl;
    }

    struct ExecutionSnapshot {
        uint256 tokenInBefore;
        uint256 tokenOutBefore;
        uint256 tokenInAfter;
        uint256 tokenOutAfter;
        TradeApprovalManager.ProposalRecord record;
        ExecutionTypes.ExecutionPayload payload;
    }

    function run() external {
        Config memory config = _loadConfig();
        ExecutionTypes.ExecutionPayload memory payload = _buildPayload(config);
        bytes memory routerCalldata = _buildRouterCalldata(config, payload.deadline);
        ExecutionSnapshot memory snapshot;

        snapshot.payload = payload;
        snapshot.tokenInBefore = IERC20(config.tokenIn).balanceOf(address(config.vault));
        snapshot.tokenOutBefore = IERC20(config.tokenOut).balanceOf(address(config.vault));
        require(snapshot.tokenInBefore >= config.amountIn, "vault tokenIn balance too low");

        vm.startBroadcast(config.deployerPk);
        config.approvalManager.createProposal(payload);
        config.approvalManager.approveProposal(payload.proposalId);
        config.vault.executeApprovedTrade(payload, routerCalldata, config.amountIn);
        vm.stopBroadcast();

        snapshot.record = config.approvalManager.getProposal(payload.proposalId);
        snapshot.tokenInAfter = IERC20(config.tokenIn).balanceOf(address(config.vault));
        snapshot.tokenOutAfter = IERC20(config.tokenOut).balanceOf(address(config.vault));

        _logExecution(config, snapshot);
    }

    function _loadConfig() internal view returns (Config memory config) {
        config.deployerPk = vm.envUint("PRIVATE_KEY");
        config.approvalManager = TradeApprovalManager(vm.envAddress("TRADE_APPROVAL_MANAGER_ADDRESS"));
        config.vault = ExecutorVault(payable(vm.envAddress("EXECUTOR_VAULT_ADDRESS")));
        config.router = vm.envAddress("ROUTER_ADDRESS");
        config.tokenIn = vm.envAddress("TOKEN_IN_ADDRESS");
        config.tokenOut = vm.envAddress("TOKEN_OUT_ADDRESS");
        config.fee = uint24(vm.envUint("POOL_FEE"));
        config.amountIn = vm.envUint("SWAP_AMOUNT_IN");
        config.minAmountOut = vm.envOr("MIN_AMOUNT_OUT", uint256(1));
        config.nonce = vm.envOr("PROPOSAL_NONCE", uint256(1));
        config.swapTtl = vm.envOr("SWAP_DEADLINE_SECONDS", uint256(3600));
        config.proposalTtl = vm.envOr("PROPOSAL_EXPIRY_SECONDS", uint256(7200));
    }

    function _buildPayload(Config memory config) internal view returns (ExecutionTypes.ExecutionPayload memory payload) {
        uint256 deadline = block.timestamp + config.swapTtl;
        uint256 proposalExpiry = block.timestamp + config.proposalTtl;
        bytes memory routerCalldata = _buildRouterCalldata(config, deadline);

        payload = ExecutionTypes.ExecutionPayload({
            proposalId: keccak256(
                abi.encode(
                    block.chainid,
                    address(config.vault),
                    config.router,
                    config.tokenIn,
                    config.tokenOut,
                    config.fee,
                    config.amountIn,
                    config.minAmountOut,
                    deadline,
                    config.nonce
                )
            ),
            planHash: keccak256(
                abi.encode(
                    config.router,
                    config.tokenIn,
                    config.tokenOut,
                    config.fee,
                    config.amountIn,
                    config.minAmountOut,
                    config.nonce
                )
            ),
            router: config.router,
            selector: IAgniSwapRouter.exactInputSingle.selector,
            calldataHash: keccak256(routerCalldata),
            tokenIn: config.tokenIn,
            tokenOut: config.tokenOut,
            recipient: address(config.vault),
            maxAmountIn: config.amountIn,
            minAmountOut: config.minAmountOut,
            nativeValue: 0,
            deadline: deadline,
            proposalExpiry: proposalExpiry,
            nonce: config.nonce
        });
    }

    function _buildRouterCalldata(Config memory config, uint256 deadline) internal pure returns (bytes memory) {
        IAgniSwapRouter.ExactInputSingleParams memory params = IAgniSwapRouter.ExactInputSingleParams({
            tokenIn: config.tokenIn,
            tokenOut: config.tokenOut,
            fee: config.fee,
            recipient: address(config.vault),
            deadline: deadline,
            amountIn: config.amountIn,
            amountOutMinimum: config.minAmountOut,
            sqrtPriceLimitX96: 0
        });

        return abi.encodeWithSelector(IAgniSwapRouter.exactInputSingle.selector, params);
    }

    function _logExecution(Config memory config, ExecutionSnapshot memory snapshot) internal pure {
        console2.log("Proposal ID:");
        console2.logBytes32(snapshot.payload.proposalId);
        console2.log("Proposal hash:");
        console2.logBytes32(snapshot.payload.proposalHash());
        console2.log("Router:", config.router);
        console2.log("TokenIn:", config.tokenIn);
        console2.log("TokenOut:", config.tokenOut);
        console2.log("Fee:", uint256(config.fee));
        console2.log("AmountIn:", config.amountIn);
        console2.log("MinAmountOut:", config.minAmountOut);
        console2.log("Vault tokenIn before:", snapshot.tokenInBefore);
        console2.log("Vault tokenIn after:", snapshot.tokenInAfter);
        console2.log("Vault tokenOut before:", snapshot.tokenOutBefore);
        console2.log("Vault tokenOut after:", snapshot.tokenOutAfter);
        console2.log("Realized amount out:", snapshot.tokenOutAfter - snapshot.tokenOutBefore);
        console2.log("Proposal status:", uint256(snapshot.record.status));
        console2.log("Proposal expiry:", snapshot.record.expiry);
    }
}

