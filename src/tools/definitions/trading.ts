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
];
