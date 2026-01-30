import axios from 'axios';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import type { EbayApiClient } from '@/api/client.js';
import { apiLogger } from '@/utils/logger.js';

const TRADING_API_VERSION = '1349';

interface TradingApiConfig {
  environment: 'production' | 'sandbox';
  siteId?: number;
}

interface ActiveListItem {
  itemId: string;
  title: string;
  sku?: string;
  quantity: number;
  quantityAvailable: number;
  currentPrice: { value: number; currency: string };
  listingType: string;
  timeLeft?: string;
  viewItemURL: string;
  pictureURL?: string[];
  startTime?: string;
  watchCount?: number;
}

interface GetMyEbaySellingResponse {
  activeList: {
    items: ActiveListItem[];
    totalCount: number;
  };
  soldList?: {
    items: ActiveListItem[];
    totalCount: number;
  };
  unsoldList?: {
    items: ActiveListItem[];
    totalCount: number;
  };
}

export class TradingApi {
  private parser: XMLParser;
  private builder: XMLBuilder;
  private config: TradingApiConfig;
  private restClient: EbayApiClient;

  constructor(restClient: EbayApiClient) {
    this.restClient = restClient;
    this.config = {
      environment: restClient.getConfig().environment,
      siteId: 205, // default to eBay Ireland
    };

    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
      isArray: (name) => {
        // ensure these are always arrays
        return ['Item', 'PictureURL', 'ItemArray'].includes(name);
      },
    });

    this.builder = new XMLBuilder({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      format: true,
    });
  }

  private getEndpoint(): string {
    return this.config.environment === 'production'
      ? 'https://api.ebay.com/ws/api.dll'
      : 'https://api.sandbox.ebay.com/ws/api.dll';
  }

  private async call(callName: string, requestBody: Record<string, unknown>): Promise<unknown> {
    const token = await this.restClient.getOAuthClient().getAccessToken();

    // use IAF-TOKEN header for OAuth, don't include RequesterCredentials in body
    const xmlRequest =
      '<?xml version="1.0" encoding="utf-8"?>' +
      this.builder.build({
        [callName + 'Request']: {
          '@_xmlns': 'urn:ebay:apis:eBLBaseComponents',
          ...requestBody,
        },
      });

    const headers = {
      'Content-Type': 'text/xml;charset=UTF-8',
      'X-EBAY-API-CALL-NAME': callName,
      'X-EBAY-API-SITEID': String(this.config.siteId),
      'X-EBAY-API-COMPATIBILITY-LEVEL': TRADING_API_VERSION,
      'X-EBAY-API-IAF-TOKEN': token,
    };

    apiLogger.debug('Trading API request', { callName, siteId: this.config.siteId });

    try {
      const response = await axios.post(this.getEndpoint(), xmlRequest, {
        headers,
        timeout: 30000,
      });

      const parsed = this.parser.parse(response.data);
      const responseKey = callName + 'Response';

      if (parsed[responseKey]?.Ack === 'Failure') {
        const errors = parsed[responseKey]?.Errors;
        const errorMsg = Array.isArray(errors)
          ? errors.map((e: { LongMessage?: string }) => e.LongMessage).join('; ')
          : errors?.LongMessage || 'Unknown Trading API error';
        throw new Error(errorMsg);
      }

      return parsed[responseKey];
    } catch (error) {
      if (axios.isAxiosError(error)) {
        apiLogger.error('Trading API error', {
          callName,
          status: error.response?.status,
          data: error.response?.data,
        });
      }
      throw error;
    }
  }

  private parseItem(item: Record<string, unknown>): ActiveListItem {
    const sellingStatus = item.SellingStatus as Record<string, unknown> | undefined;
    const currentPrice = sellingStatus?.CurrentPrice as Record<string, unknown> | undefined;
    const listingDetails = item.ListingDetails as Record<string, unknown> | undefined;

    return {
      itemId: String(item.ItemID || ''),
      title: String(item.Title || ''),
      sku: item.SKU ? String(item.SKU) : undefined,
      quantity: Number(item.Quantity || 0),
      quantityAvailable: Number(item.QuantityAvailable || 0),
      currentPrice: {
        value: Number(currentPrice?.['#text'] || currentPrice || 0),
        currency: String(currentPrice?.['@_currencyID'] || 'EUR'),
      },
      listingType: String(item.ListingType || ''),
      timeLeft: item.TimeLeft ? String(item.TimeLeft) : undefined,
      viewItemURL: String(listingDetails?.ViewItemURL || ''),
      pictureURL: item.PictureDetails
        ? (item.PictureDetails as Record<string, unknown>).PictureURL as string[] | undefined
        : undefined,
      startTime: listingDetails?.StartTime ? String(listingDetails.StartTime) : undefined,
      watchCount: item.WatchCount ? Number(item.WatchCount) : undefined,
    };
  }

  async getMyEbaySelling(options?: {
    includeActive?: boolean;
    includeSold?: boolean;
    includeUnsold?: boolean;
    activeEntriesPerPage?: number;
    siteId?: number;
  }): Promise<GetMyEbaySellingResponse> {
    const {
      includeActive = true,
      includeSold = false,
      includeUnsold = false,
      activeEntriesPerPage = 200,
      siteId,
    } = options || {};

    if (siteId) {
      this.config.siteId = siteId;
    }

    const requestBody: Record<string, unknown> = {
      DetailLevel: 'ReturnAll',
    };

    if (includeActive) {
      requestBody.ActiveList = {
        Include: true,
        Pagination: {
          EntriesPerPage: activeEntriesPerPage,
          PageNumber: 1,
        },
      };
    }

    if (includeSold) {
      requestBody.SoldList = {
        Include: true,
        Pagination: {
          EntriesPerPage: 50,
          PageNumber: 1,
        },
      };
    }

    if (includeUnsold) {
      requestBody.UnsoldList = {
        Include: true,
        Pagination: {
          EntriesPerPage: 50,
          PageNumber: 1,
        },
      };
    }

    const response = (await this.call('GetMyeBaySelling', requestBody)) as Record<string, unknown>;

    const result: GetMyEbaySellingResponse = {
      activeList: { items: [], totalCount: 0 },
    };

    // parse active list
    const activeListData = response.ActiveList as Record<string, unknown> | undefined;
    if (activeListData) {
      const itemArray = activeListData.ItemArray as Record<string, unknown>[] | undefined;
      const items = itemArray?.[0] as Record<string, unknown> | undefined;
      const itemList = items?.Item as Record<string, unknown>[] | undefined;

      if (itemList) {
        result.activeList.items = itemList.map((item) => this.parseItem(item));
      }

      const paginationResult = activeListData.PaginationResult as Record<string, unknown> | undefined;
      result.activeList.totalCount = Number(paginationResult?.TotalNumberOfEntries || 0);
    }

    // parse sold list
    const soldListData = response.SoldList as Record<string, unknown> | undefined;
    if (soldListData) {
      const itemArray = soldListData.ItemArray as Record<string, unknown>[] | undefined;
      const items = itemArray?.[0] as Record<string, unknown> | undefined;
      const itemList = items?.Item as Record<string, unknown>[] | undefined;

      result.soldList = {
        items: itemList ? itemList.map((item) => this.parseItem(item)) : [],
        totalCount: Number(
          (soldListData.PaginationResult as Record<string, unknown>)?.TotalNumberOfEntries || 0
        ),
      };
    }

    // parse unsold list
    const unsoldListData = response.UnsoldList as Record<string, unknown> | undefined;
    if (unsoldListData) {
      const itemArray = unsoldListData.ItemArray as Record<string, unknown>[] | undefined;
      const items = itemArray?.[0] as Record<string, unknown> | undefined;
      const itemList = items?.Item as Record<string, unknown>[] | undefined;

      result.unsoldList = {
        items: itemList ? itemList.map((item) => this.parseItem(item)) : [],
        totalCount: Number(
          (unsoldListData.PaginationResult as Record<string, unknown>)?.TotalNumberOfEntries || 0
        ),
      };
    }

    return result;
  }

  async reviseFixedPriceItem(options: {
    itemId: string;
    title?: string;
    description?: string;
    price?: number;
    quantity?: number;
    sku?: string;
    pictureUrls?: string[];
    siteId?: number;
  }): Promise<{ itemId: string; success: boolean; fees?: Record<string, unknown> }> {
    const { itemId, title, description, price, quantity, sku, pictureUrls, siteId } = options;

    if (siteId) {
      this.config.siteId = siteId;
    }

    const item: Record<string, unknown> = {
      ItemID: itemId,
    };

    if (title !== undefined) {
      item.Title = title;
    }

    if (description !== undefined) {
      item.Description = description;
    }

    if (price !== undefined) {
      item.StartPrice = price;
    }

    if (quantity !== undefined) {
      item.Quantity = quantity;
    }

    if (sku !== undefined) {
      item.SKU = sku;
    }

    if (pictureUrls !== undefined && pictureUrls.length > 0) {
      item.PictureDetails = {
        PictureURL: pictureUrls,
      };
    }

    const response = (await this.call('ReviseFixedPriceItem', { Item: item })) as Record<
      string,
      unknown
    >;

    return {
      itemId: String(response.ItemID || itemId),
      success: response.Ack === 'Success' || response.Ack === 'Warning',
      fees: response.Fees as Record<string, unknown> | undefined,
    };
  }

  async getItem(options: {
    itemId: string;
    siteId?: number;
  }): Promise<{
    itemId: string;
    title: string;
    description?: string;
    pictureUrls: string[];
    price: { value: number; currency: string };
    quantity: number;
    sku?: string;
  }> {
    const { itemId, siteId } = options;

    if (siteId) {
      this.config.siteId = siteId;
    }

    const response = (await this.call('GetItem', {
      ItemID: itemId,
      DetailLevel: 'ReturnAll',
    })) as Record<string, unknown>;

    // Item may be an array due to parser config
    const rawItem = response.Item;
    const item = (Array.isArray(rawItem) ? rawItem[0] : rawItem) as Record<string, unknown>;
    const pictureDetails = item?.PictureDetails as Record<string, unknown> | undefined;
    const sellingStatus = item?.SellingStatus as Record<string, unknown> | undefined;
    const currentPrice = sellingStatus?.CurrentPrice as Record<string, unknown> | undefined;

    let pictureUrls: string[] = [];
    if (pictureDetails?.PictureURL) {
      const urls = pictureDetails.PictureURL;
      pictureUrls = Array.isArray(urls) ? urls.map(String) : [String(urls)];
    }

    return {
      itemId: String(item?.ItemID || itemId),
      title: String(item?.Title || ''),
      description: item?.Description ? String(item.Description) : undefined,
      pictureUrls,
      price: {
        value: Number(currentPrice?.['#text'] || currentPrice || 0),
        currency: String(currentPrice?.['@_currencyID'] || 'EUR'),
      },
      quantity: Number(item?.Quantity || 0),
      sku: item?.SKU ? String(item.SKU) : undefined,
    };
  }

  async uploadPicture(options: {
    imageUrl: string;
    pictureName?: string;
    siteId?: number;
  }): Promise<{ fullUrl: string; baseUrl: string }> {
    const { imageUrl, pictureName, siteId } = options;

    if (siteId) {
      this.config.siteId = siteId;
    }

    const requestBody: Record<string, unknown> = {
      ExternalPictureURL: imageUrl,
      PictureSet: 'Supersize',
    };

    if (pictureName) {
      requestBody.PictureName = pictureName;
    }

    const response = (await this.call('UploadSiteHostedPictures', requestBody)) as Record<string, unknown>;

    const siteHostedPictureDetails = response.SiteHostedPictureDetails as Record<string, unknown> | undefined;

    return {
      fullUrl: String(siteHostedPictureDetails?.FullURL || ''),
      baseUrl: String(siteHostedPictureDetails?.BaseURL || ''),
    };
  }

  async endItem(options: {
    itemId: string;
    reason: 'NotAvailable' | 'Incorrect' | 'LostOrBroken' | 'OtherListingError' | 'SellToHighBidder';
    siteId?: number;
  }): Promise<{ itemId: string; endTime: string; success: boolean }> {
    const { itemId, reason, siteId } = options;

    if (siteId) {
      this.config.siteId = siteId;
    }

    const response = (await this.call('EndItem', {
      ItemID: itemId,
      EndingReason: reason,
    })) as Record<string, unknown>;

    return {
      itemId: String(response.ItemID || itemId),
      endTime: String(response.EndTime || ''),
      success: response.Ack === 'Success' || response.Ack === 'Warning',
    };
  }
}

export type { GetMyEbaySellingResponse, ActiveListItem };
