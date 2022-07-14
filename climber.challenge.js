const { ethers, upgrades } = require('hardhat');
const { expect } = require('chai');

describe('[Challenge] Climber', function () {
    let deployer, proposer, sweeper, attacker;

    // Vault starts with 10 million tokens
    const VAULT_TOKEN_BALANCE = ethers.utils.parseEther('10000000');

    before(async function () {
        /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */
        [deployer, proposer, sweeper, attacker] = await ethers.getSigners();

        await ethers.provider.send("hardhat_setBalance", [
            attacker.address,
            "0x16345785d8a0000", // 0.1 ETH
        ]);
        expect(
            await ethers.provider.getBalance(attacker.address)
        ).to.equal(ethers.utils.parseEther('0.1'));
        
        // Deploy the vault behind a proxy using the UUPS pattern,
        // passing the necessary addresses for the `ClimberVault::initialize(address,address,address)` function
        this.vault = await upgrades.deployProxy(
            await ethers.getContractFactory('ClimberVault', deployer),
            [ deployer.address, proposer.address, sweeper.address ],
            { kind: 'uups' }
        );

        expect(await this.vault.getSweeper()).to.eq(sweeper.address);
        expect(await this.vault.getLastWithdrawalTimestamp()).to.be.gt('0');
        expect(await this.vault.owner()).to.not.eq(ethers.constants.AddressZero);
        expect(await this.vault.owner()).to.not.eq(deployer.address);
        
        // Instantiate timelock
        let timelockAddress = await this.vault.owner();
        this.timelock = await (
            await ethers.getContractFactory('ClimberTimelock', deployer)
        ).attach(timelockAddress);
        
        // Ensure timelock roles are correctly initialized
        expect(
            await this.timelock.hasRole(await this.timelock.PROPOSER_ROLE(), proposer.address)
        ).to.be.true;
        expect(
            await this.timelock.hasRole(await this.timelock.ADMIN_ROLE(), deployer.address)
        ).to.be.true;

        // Deploy token and transfer initial token balance to the vault
        this.token = await (await ethers.getContractFactory('DamnValuableToken', deployer)).deploy();
        await this.token.transfer(this.vault.address, VAULT_TOKEN_BALANCE);
    });

    it('Exploit', async function () {        
        /** CODE YOUR EXPLOIT HERE */
        // Quite a long one but I'll try to tl;dr

        // The goal is to sweep the funds out so we know we need to use the sweeper
        // role. Since there exists a _setSweeper function, we know that we need to
        // upgrade the logic of the ClimberVault to include a public function that
        // calls _setSweeper but in order to upgrade this logic, you need to be the owner.
        // Who is our owner? That is our timelock contract.

        // Looking through the ClimberTimelock contract, 2 things stand out.
        // The first is that it gave itself admin role (which IMO is weird)
        // and secondly, not conforming to the CEI pattern in `execute` function.
        // This means that the unsafe external call is executed before checking that
        // the operation is ready for execution.

        // Prepare the following for execute:
        // 1. reduce delay to 0 (to execute everything immediately)
        // 2. transfer ownership of ClimberVault to attacking contract
        // 3. grant proposer role to the attacking contract (so schedule will pass)
        // 4. schedule(1,2,3,4). 1-4 is needed because of how id is generated.

        // Once this is done, use your attacking contract to upgrade the ClimberVault
        // contract to include a new function that calls _setSweeper.
        // Call this function and use your sweeper to sweep the funds.
    });

    after(async function () {
        /** SUCCESS CONDITIONS */
        expect(await this.token.balanceOf(this.vault.address)).to.eq('0');
        expect(await this.token.balanceOf(attacker.address)).to.eq(VAULT_TOKEN_BALANCE);
    });
});
