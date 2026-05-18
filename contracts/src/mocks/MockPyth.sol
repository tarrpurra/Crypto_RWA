// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockPyth {
    struct Price {
        int64 price;
        uint64 publishTime;
        bool exists;
    }

    mapping(bytes32 priceId => Price price) private _prices;

    function setPrice(bytes32 priceId, int64 price, uint64 publishTime) external {
        _prices[priceId] = Price({price: price, publishTime: publishTime, exists: true});
    }

    function getPrice(bytes32 priceId) external view returns (Price memory) {
        return _prices[priceId];
    }

    function getPriceNoOlderThan(bytes32 priceId, uint256 maxAge) external view returns (Price memory price) {
        price = _prices[priceId];
        require(price.exists, "price-not-found");
        require(block.timestamp <= uint256(price.publishTime) + maxAge, "stale-price");
    }
}
