import { z } from 'zod';
import type { ToolDefinition } from './account.js';

export const tradingTools: ToolDefinition[] = [
  {
    name: 'ebay_get_my_ebay_selling',
    description:
      'Get all seller listings using the Trading API. Returns active, sold, and unsold listings. ' +
      'Works with any listing type (auctions, fixed price) and does not require SKUs or business policies. ' +
      'This is the recommended way to retrieve your eBay listings.\n\n' +
      'Common site IDs: 205 (Ireland), 3 (UK), 0 (US), 77 (Germany)',
    inputSchema: {
      includeActive: z.coerce.boolean().optional().default(true).describe('Include active listings'),
      includeSold: z.coerce.boolean().optional().default(false).describe('Include sold listings'),
      includeUnsold: z.coerce.boolean().optional().default(false).describe('Include unsold listings'),
      entriesPerPage: z.coerce.number().optional().default(200).describe('Number of entries per page (max 200)'),
      siteId: z.coerce.number().optional().describe('eBay site ID (205=Ireland, 3=UK, 0=US, 77=Germany)'),
    },
  },
  {
    name: 'ebay_revise_item',
    description:
      'Revise/edit a fixed price listing. Can update title, description, price, quantity, SKU, photos, or Best Offer settings. ' +
      'Only include fields you want to change. For photos, provide an array of image URLs - these will ' +
      'REPLACE all existing photos, so include your original photo URL first if you want to keep it. ' +
      'For Best Offer, set bestOfferEnabled=false to disable, or adjust auto-accept/auto-decline thresholds.\n\n' +
      'Common site IDs: 205 (Ireland), 3 (UK), 0 (US), 77 (Germany)',
    inputSchema: {
      itemId: z.string().describe('The eBay item ID to revise'),
      title: z.string().optional().describe('New title (max 80 chars)'),
      description: z.string().optional().describe('New HTML description'),
      price: z.coerce.number().optional().describe('New price'),
      quantity: z.coerce.number().optional().describe('New quantity'),
      sku: z.string().optional().describe('New SKU/custom label'),
      pictureUrls: z.array(z.string()).optional().describe('Array of image URLs (replaces all existing photos)'),
      bestOfferEnabled: z.coerce.boolean().optional().describe('Enable or disable Best Offer'),
      bestOfferAutoAcceptPrice: z.coerce.number().optional().describe('Auto-accept offers at or above this price'),
      bestOfferAutoDeclinePrice: z.coerce.number().optional().describe('Auto-decline offers below this price'),
      siteId: z.coerce.number().optional().describe('eBay site ID (205=Ireland, 3=UK, 0=US, 77=Germany)'),
    },
  },
  {
    name: 'ebay_upload_picture',
    description:
      'Upload an external image URL to eBay\'s picture hosting service (EPS). Returns an eBay-hosted URL ' +
      'that can be used with ebay_revise_item. Use this to convert external manufacturer images to ' +
      'eBay-compatible URLs.\n\n' +
      'Common site IDs: 205 (Ireland), 3 (UK), 0 (US), 77 (Germany)',
    inputSchema: {
      imageUrl: z.string().describe('External image URL to upload to eBay'),
      pictureName: z.string().optional().describe('Optional name for the picture'),
      siteId: z.coerce.number().optional().describe('eBay site ID (205=Ireland, 3=UK, 0=US, 77=Germany)'),
    },
  },
  {
    name: 'ebay_get_item',
    description:
      'Get full details of a single listing including photos. Use this to retrieve existing photo URLs ' +
      'before revising a listing with new photos.\n\n' +
      'Common site IDs: 205 (Ireland), 3 (UK), 0 (US), 77 (Germany)',
    inputSchema: {
      itemId: z.string().describe('The eBay item ID'),
      siteId: z.coerce.number().optional().describe('eBay site ID (205=Ireland, 3=UK, 0=US, 77=Germany)'),
    },
  },
  {
    name: 'ebay_end_item',
    description:
      'End a listing early. Reasons: NotAvailable (sold elsewhere), Incorrect (listing error), ' +
      'LostOrBroken (item damaged), OtherListingError, SellToHighBidder (auction only).\n\n' +
      'Common site IDs: 205 (Ireland), 3 (UK), 0 (US), 77 (Germany)',
    inputSchema: {
      itemId: z.string().describe('The eBay item ID to end'),
      reason: z.enum(['NotAvailable', 'Incorrect', 'LostOrBroken', 'OtherListingError', 'SellToHighBidder'])
        .describe('Reason for ending the listing'),
      siteId: z.coerce.number().optional().describe('eBay site ID (205=Ireland, 3=UK, 0=US, 77=Germany)'),
    },
  },
];
