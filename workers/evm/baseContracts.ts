export const IAMM_STRATEGY_SOURCE = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

struct TradeInfo {
    bool isBuy;
    uint256 amountX;
    uint256 amountY;
    uint256 timestamp;
    uint256 reserveX;
    uint256 reserveY;
}

interface IAMMStrategy {
    function afterInitialize(uint256 reserveX, uint256 reserveY)
        external
        returns (uint256 bidFee, uint256 askFee);

    function afterSwap(TradeInfo calldata trade)
        external
        returns (uint256 bidFee, uint256 askFee);

    function getName() external view returns (string memory);
}
`

export const AMM_STRATEGY_BASE_SOURCE = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAMMStrategy} from "./IAMMStrategy.sol";

abstract contract AMMStrategyBase is IAMMStrategy {
    uint256 internal constant WAD = 1e18;
    uint256 internal constant BPS = 1e14;
    uint256 internal constant MIN_FEE = 0;
    uint256 internal constant MAX_FEE = 1000 * BPS;

    uint256[64] internal slots;

    function bpsToWad(uint256 bps) internal pure returns (uint256) {
        return bps * BPS;
    }

    function wadToBps(uint256 feeWad) internal pure returns (uint256) {
        return feeWad / BPS;
    }

    function wdiv(uint256 a, uint256 b) internal pure returns (uint256) {
        if (b == 0) {
            return 0;
        }

        return (a * WAD) / b;
    }

    function clampFee(uint256 fee) internal pure returns (uint256) {
        if (fee < MIN_FEE) {
            return MIN_FEE;
        }

        if (fee > MAX_FEE) {
            return MAX_FEE;
        }

        return fee;
    }
}
`
