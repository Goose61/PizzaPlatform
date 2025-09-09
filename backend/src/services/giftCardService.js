/**
 * GiftCardService - NFT-Based Gift Card Management
 * 
 * Handles:
 * - NFT gift card minting (5 $PIZZA SPL, $0.50 minting cost)
 * - 30-day expiry with treasury reversion for unused cards
 * - 50% usage rate tracking (50% redeemed, 50% unused)
 * - Merchant-funded minting ($600/merchant, $300 net)
 */

const { Connection, PublicKey, Keypair, Transaction } = require('@solana/web3.js');
const { Token, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
// Metaplex dependency disabled for demo - install with: npm install @metaplex-foundation/js
// const { Metaplex, keypairIdentity, bundlrStorage } = require('@metaplex-foundation/js');
const secretManager = require('../config/secrets');

class GiftCardService {
  constructor() {
    this.connection = null;
    this.metaplex = null;
    this.giftCardValue = 5; // 5 $PIZZA SPL per gift card
    this.mintingCost = 0.50; // $0.50 per NFT minting
    this.expiryDays = 30; // 30-day expiry
    this.annualCardsPerMerchant = 1200; // 100 per month
    this.expectedUsageRate = 0.50; // 50% redeemed, 50% unused
    this.treasuryWallet = null;
  }

  async initialize() {
    const secrets = await secretManager.initialize();
    
    // Initialize Solana connection
    this.connection = new Connection(secrets.solanaRpcEndpoint);
    this.treasuryWallet = new PublicKey(secrets.treasuryWalletAddress);
    
    // Initialize Metaplex for NFT operations
    const wallet = Keypair.fromSecretKey(
      Buffer.from(secrets.walletMasterKey, 'hex')
    );
    
    // Metaplex initialization disabled for demo
    // this.metaplex = Metaplex.make(this.connection)
    //   .use(keypairIdentity(wallet))
    //   .use(bundlrStorage());
    
    console.log('✅ GiftCardService initialized');
  }

  /**
   * Create gift card campaign for a business
   * 100 NFT gift cards per month, 1200 per year
   */
  async createGiftCardCampaign(business, month, year) {
    const campaignId = `${business._id}_${year}_${month}`;
    const cardsToMint = 100; // 100 cards per month
    const totalCost = cardsToMint * this.mintingCost; // $50 per month
    
    try {
      // Create campaign metadata
      const campaign = {
        campaignId,
        businessId: business._id,
        businessName: business.businessName,
        month,
        year,
        cardsToMint,
        cardsMinted: 0,
        cardsRedeemed: 0,
        totalCost,
        status: 'active',
        createdAt: new Date(),
        expiryDate: new Date(year, month, 0) // End of month + 30 days
      };

      // Pre-generate NFT metadata for the campaign
      const nftMetadata = await this.generateCampaignMetadata(business, campaign);
      campaign.nftMetadata = nftMetadata;

      return campaign;
    } catch (error) {
      console.error('Gift card campaign creation failed:', error);
      throw new Error('Failed to create gift card campaign');
    }
  }

  /**
   * Generate NFT metadata for gift card campaign
   */
  async generateCampaignMetadata(business, campaign) {
    const metadata = {
      name: `${business.businessName} Pizza Gift Card`,
      description: `5 $PIZZA SPL gift card from ${business.businessName}. Valid for 30 days.`,
      image: 'https://your-cdn.com/gift-card-images/pizza-card.png', // Placeholder
      attributes: [
        {
          trait_type: 'Business',
          value: business.businessName
        },
        {
          trait_type: 'Value',
          value: `${this.giftCardValue} $PIZZA SPL`
        },
        {
          trait_type: 'Campaign',
          value: campaign.campaignId
        },
        {
          trait_type: 'Expiry',
          value: campaign.expiryDate.toISOString().split('T')[0]
        },
        {
          trait_type: 'Type',
          value: 'Pizza Gift Card NFT'
        }
      ],
      properties: {
        category: 'gift_card',
        business_id: business._id.toString(),
        pizza_spl_value: this.giftCardValue,
        minting_cost: this.mintingCost,
        expiry_date: campaign.expiryDate.toISOString()
      }
    };

    return metadata;
  }

  /**
   * Mint individual gift card NFT to customer
   */
  async mintGiftCard(business, customerWalletAddress, campaignId) {
    try {
      // Create the NFT
      const { nft } = await this.metaplex
        .nfts()
        .create({
          uri: await this.uploadMetadata(business, campaignId),
          name: `${business.businessName} Pizza Gift Card`,
          sellerFeeBasisPoints: 0, // No royalties
          tokenOwner: new PublicKey(customerWalletAddress),
          updateAuthority: this.treasuryWallet, // Treasury controls updates
          mintAuthority: this.treasuryWallet,
          tokenStandard: 0, // Non-fungible
          collection: null,
          uses: null
        });

      const giftCard = {
        nftAddress: nft.address.toString(),
        mintAddress: nft.mintAddress.toString(),
        value: this.giftCardValue, // 5 $PIZZA SPL
        businessId: business._id,
        businessName: business.businessName,
        customerWallet: customerWalletAddress,
        campaignId,
        issueDate: new Date(),
        expiryDate: new Date(Date.now() + (this.expiryDays * 24 * 60 * 60 * 1000)), // 30 days
        redeemed: false,
        redeemedAt: null,
        redeemedTransactionId: null,
        status: 'active'
      };

      console.log(`🎁 Gift card NFT minted: ${nft.address.toString()}`);
      return giftCard;
    } catch (error) {
      console.error('Gift card minting failed:', error);
      throw new Error('Failed to mint gift card NFT');
    }
  }

  /**
   * Upload metadata to decentralized storage
   */
  async uploadMetadata(business, campaignId) {
    const metadata = await this.generateCampaignMetadata(business, { campaignId });
    
    try {
      const { uri } = await this.metaplex
        .nfts()
        .uploadMetadata(metadata);
      
      return uri;
    } catch (error) {
      console.error('Metadata upload failed:', error);
      throw new Error('Failed to upload NFT metadata');
    }
  }

  /**
   * Redeem gift card NFT for $PIZZA SPL
   */
  async redeemGiftCard(giftCard, userWalletAddress) {
    // Check if gift card is valid
    if (giftCard.redeemed) {
      throw new Error('Gift card already redeemed');
    }

    if (new Date() > giftCard.expiryDate) {
      throw new Error('Gift card has expired');
    }

    if (giftCard.status !== 'active') {
      throw new Error('Gift card is not active');
    }

    try {
      // Burn the NFT and transfer $PIZZA SPL (simplified)
      const redemptionTx = {
        type: 'gift_card_redeem',
        nftAddress: giftCard.nftAddress,
        userWallet: userWalletAddress,
        pizzaSPLTransferred: giftCard.value,
        timestamp: new Date(),
        transactionId: `redeem_${Date.now()}` // Would be actual Solana tx signature
      };

      // Update gift card status
      giftCard.redeemed = true;
      giftCard.redeemedAt = new Date();
      giftCard.redeemedTransactionId = redemptionTx.transactionId;
      giftCard.status = 'redeemed';

      return {
        success: true,
        pizzaSPLReceived: giftCard.value,
        transactionId: redemptionTx.transactionId,
        redeemedAt: giftCard.redeemedAt
      };
    } catch (error) {
      console.error('Gift card redemption failed:', error);
      throw new Error('Failed to redeem gift card');
    }
  }

  /**
   * Process expired gift cards and revert to treasury
   */
  async processExpiredCards() {
    const cutoffDate = new Date(Date.now() - (this.expiryDays * 24 * 60 * 60 * 1000));
    
    try {
      // Find expired, unredeemed gift cards (would query database in real implementation)
      const expiredCards = []; // Placeholder
      
      const revertedCards = [];
      for (const card of expiredCards) {
        if (!card.redeemed && card.expiryDate < cutoffDate) {
          // Burn NFT and revert value to treasury
          const revertTx = {
            nftAddress: card.nftAddress,
            pizzaSPLValue: card.value,
            revertedAt: new Date(),
            treasuryWallet: this.treasuryWallet.toString()
          };

          card.status = 'expired_reverted';
          card.revertedAt = new Date();
          
          revertedCards.push(revertTx);
        }
      }

      return {
        processed: revertedCards.length,
        totalValueReverted: revertedCards.reduce((sum, card) => sum + card.pizzaSPLValue, 0),
        revertedCards
      };
    } catch (error) {
      console.error('Expired card processing failed:', error);
      throw new Error('Failed to process expired cards');
    }
  }

  /**
   * Get gift card analytics for a business
   */
  async getBusinessGiftCardAnalytics(businessId, timeframe = 'month') {
    // Placeholder analytics (would query database in real implementation)
    const analytics = {
      totalMinted: this.annualCardsPerMerchant / 12, // 100 per month
      totalRedeemed: Math.floor((this.annualCardsPerMerchant / 12) * this.expectedUsageRate), // 50 redeemed
      totalExpired: Math.floor((this.annualCardsPerMerchant / 12) * (1 - this.expectedUsageRate)), // 50 expired
      redemptionRate: this.expectedUsageRate,
      totalCost: (this.annualCardsPerMerchant / 12) * this.mintingCost, // $50 per month
      netCost: (this.annualCardsPerMerchant / 12) * this.mintingCost * this.expectedUsageRate, // $25 net (50% unused)
      pizzaSPLDistributed: Math.floor((this.annualCardsPerMerchant / 12) * this.expectedUsageRate) * this.giftCardValue,
      averageRedemptionTime: 15 // days
    };

    return analytics;
  }

  /**
   * Get platform-wide gift card statistics
   */
  async getPlatformGiftCardStats(merchantCount = 10) {
    const monthlyCardsPerMerchant = this.annualCardsPerMerchant / 12;
    
    return {
      totalMerchantsParticipating: merchantCount,
      monthlyCardsGenerated: monthlyCardsPerMerchant * merchantCount, // 1,000 cards/month
      annualCardsGenerated: this.annualCardsPerMerchant * merchantCount, // 12,000 cards/year
      expectedRedemptions: Math.floor(this.annualCardsPerMerchant * merchantCount * this.expectedUsageRate), // 6,000 redeemed
      expectedExpiries: Math.floor(this.annualCardsPerMerchant * merchantCount * (1 - this.expectedUsageRate)), // 6,000 expired
      totalMintingCosts: this.annualCardsPerMerchant * merchantCount * this.mintingCost, // $6,000/year
      netMintingCosts: this.annualCardsPerMerchant * merchantCount * this.mintingCost * this.expectedUsageRate, // $3,000 net
      totalPizzaSPLValue: this.annualCardsPerMerchant * merchantCount * this.giftCardValue, // 60,000 $PIZZA SPL
      revertedTreasuryValue: Math.floor(this.annualCardsPerMerchant * merchantCount * (1 - this.expectedUsageRate)) * this.giftCardValue // 30,000 $PIZZA SPL reverted
    };
  }

  /**
   * Get user's gift card portfolio
   */
  async getUserGiftCards(userWalletAddress) {
    // Placeholder - would query user's NFTs in real implementation
    return {
      activeCards: [], // Active, unredeemed cards
      redeemedCards: [], // Previously redeemed cards
      expiredCards: [], // Expired, unredeemed cards
      totalValue: 0, // Total $PIZZA SPL value of active cards
      redemptionHistory: []
    };
  }

  /**
   * Validate gift card NFT ownership and status
   */
  async validateGiftCard(nftAddress, userWalletAddress) {
    try {
      // Check NFT ownership (simplified)
      const nft = await this.metaplex.nfts().findByMint({ mintAddress: new PublicKey(nftAddress) });
      
      if (!nft) {
        return { valid: false, reason: 'NFT not found' };
      }

      // Check if user owns the NFT
      if (nft.ownerAddress.toString() !== userWalletAddress) {
        return { valid: false, reason: 'Not NFT owner' };
      }

      // Check metadata for gift card properties
      const metadata = nft.json;
      if (metadata?.properties?.category !== 'gift_card') {
        return { valid: false, reason: 'Not a gift card NFT' };
      }

      // Check expiry
      const expiryDate = new Date(metadata.properties.expiry_date);
      if (new Date() > expiryDate) {
        return { valid: false, reason: 'Gift card expired' };
      }

      return {
        valid: true,
        value: metadata.properties.pizza_spl_value,
        businessId: metadata.properties.business_id,
        expiryDate
      };
    } catch (error) {
      console.error('Gift card validation failed:', error);
      return { valid: false, reason: 'Validation error' };
    }
  }
}

module.exports = GiftCardService;