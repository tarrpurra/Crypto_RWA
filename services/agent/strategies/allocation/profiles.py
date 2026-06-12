from __future__ import annotations

AllocationProfile = dict[str, float]


ALLOCATION_PROFILES: dict[str, AllocationProfile] = {
    "Defensive": {
        "USDY": 0.727273,
        "mETH": 0.272727,
    },
    "Balanced": {
        "USDY": 0.60,
        "mETH": 0.40,
    },
    "Yield-Seeking": {
        "USDY": 0.529412,
        "mETH": 0.470588,
    },
    "Sepolia Test": {
        "USDY": 0.50,
        "mETH": 0.50,
    },
    "Sepolia Mock": {
        "MockTokenA": 0.50,
        "MockTokenB": 0.50,
    },
}

ALLOCATION_PROFILE_ALIASES: dict[str, str] = {
    "Sepolia Live": "Sepolia Test",
}

ACTIVE_PROFILE_NAME: str | None = None  # Mutable override for local/simulation scope


def normalize_profile_name(profile_name: str) -> str:
    canonical = ALLOCATION_PROFILE_ALIASES.get(profile_name, profile_name)
    if canonical not in ALLOCATION_PROFILES:
        raise ValueError(f"Unknown allocation profile: {profile_name}")
    return canonical


def get_allocation_profile(profile_name: str) -> tuple[str, AllocationProfile]:
    canonical = normalize_profile_name(profile_name)
    return canonical, ALLOCATION_PROFILES[canonical]


def get_allocation_profile_for_chain(profile_name: str, target_chain: str | None = None) -> tuple[str, AllocationProfile]:
    canonical = normalize_profile_name(profile_name)
    profile = dict(ALLOCATION_PROFILES[canonical])

    return canonical, profile
