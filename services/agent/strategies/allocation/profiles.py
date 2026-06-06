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

    if target_chain and target_chain.lower() == "mantle_sepolia":
        filtered_profile = {asset: weight for asset, weight in profile.items() if asset.upper() != "USDC"}
        total_weight = sum(filtered_profile.values())
        if total_weight > 0:
            profile = {asset: weight / total_weight for asset, weight in filtered_profile.items()}

    return canonical, profile
