// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library Roles {
    bytes32 internal constant DEFAULT_ADMIN_ROLE = 0x00;
    bytes32 internal constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");
    bytes32 internal constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");
    bytes32 internal constant APPROVER_ROLE = keccak256("APPROVER_ROLE");
    bytes32 internal constant RECOVERY_ROLE = keccak256("RECOVERY_ROLE");
}
