from __future__ import annotations

from typing import TypedDict


class AllocationProfile(TypedDict):
    USDC: float
    USDY: float
    mETH: float


ALLOCATION_PROFILES: dict[str, AllocationProfile] = {
    "Defensive": {
        "USDC": 0.45,
        "USDY": 0.40,
        "mETH": 0.15,
    },
    "Balanced": {
        "USDC": 0.25,
        "USDY": 0.45,
        "mETH": 0.30,
    },
    "Yield-Seeking": {
        "USDC": 0.15,
        "USDY": 0.45,
        "mETH": 0.40,
    },
}

ACTIVE_PROFILE_NAME = "Balanced"  # Global active profile name mutable state for local/simulation scope
