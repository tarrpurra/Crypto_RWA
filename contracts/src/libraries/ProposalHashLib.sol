// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ExecutionTypes} from "./ExecutionTypes.sol";

library ProposalHashLib {
    function proposalHash(ExecutionTypes.ExecutionPayload memory payload) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                payload.proposalId,
                payload.planHash,
                payload.router,
                payload.selector,
                payload.calldataHash,
                payload.tokenIn,
                payload.tokenOut,
                payload.recipient,
                payload.maxAmountIn,
                payload.minAmountOut,
                payload.nativeValue,
                payload.deadline,
                payload.proposalExpiry,
                payload.nonce
            )
        );
    }
}
