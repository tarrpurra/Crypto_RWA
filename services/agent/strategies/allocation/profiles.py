from __future__ import annotations

AllocationProfile = dict[str, float]


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
    "Sepolia Mock": {
        "MockTokenA": 0.50,
        "MockTokenB": 0.50,
    },
}

ACTIVE_PROFILE_NAME: str | None = None  # Mutable override for local/simulation scope
