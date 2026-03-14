// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Minimal mock USDC for local development and testing only.
///      Mints 1,000,000 USDC to the deployer on construction.
contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {
        // 1,000,000 USDC (6 decimals)
        _mint(msg.sender, 1_000_000 * 10 ** 6);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Faucet — anyone can mint up to 10,000 USDC for testing.
    function faucet(address to, uint256 amount) external {
        require(amount <= 10_000 * 10 ** 6, "MockUSDC: too much");
        _mint(to, amount);
    }
}
