/**
 * Polymarket CLOB Client - Singleton
 * Chain ID 137 = Polygon Mainnet
 */

import { ClobClient } from '@polymarket/clob-client'
import { ethers } from 'ethers'

// Environment validation
const REQUIRED_ENV = ['PRIVATE_KEY', 'POLY_API_KEY', 'POLY_API_SECRET', 'POLY_API_PASSPHRASE'] as const
const missing = REQUIRED_ENV.filter(key => !process.env[key])

if (missing.length > 0 && typeof window === 'undefined') {
  console.warn(`Missing env vars: ${missing.join(', ')}`)
}

// Constants
const POLYGON_CHAIN_ID = 137
const CLOB_API_URL = process.env.NEXT_PUBLIC_CLOB_API || 'https://clob.polymarket.com'
const USE_MOCK = process.env.NEXT_PUBLIC_MOCK === 'true' // For testing without real keys

// Singleton client
let clientInstance: ClobClient | null = null

export interface MarketPrice {
  tokenId: string
  bestBid: number | null
  bestAsk: number | null
  spread: number | null
  timestamp: number
}

/**
 * Initialize or return existing ClobClient singleton
 */
export function getClobClient(): ClobClient {
  if (clientInstance) return clientInstance

  if (!process.env.PRIVATE_KEY) {
    throw new Error('PRIVATE_KEY environment variable is required')
  }

  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY)

  clientInstance = new ClobClient(
    CLOB_API_URL,
    POLYGON_CHAIN_ID,
    wallet,
    {
      useQuoteVol: true,
    }
  )

  return clientInstance
}

/**
 * Get current market price for a token
 */
export async function getMarketPrice(tokenId: string): Promise<MarketPrice> {
  const client = getClobClient()

  try {
    const [asks, bids] = await Promise.all([
      client.getOrders({ token_id: tokenId, side: 'ASK' }).catch(() => ({ orders: [] })),
      client.getOrders({ token_id: tokenId, side: 'BID' }).catch(() => ({ orders: [] })),
    ])

    // Get best prices (lowest ask, highest bid)
    const sortedAsks = asks.orders
      .map(o => parseFloat(o.price))
      .filter(p => p > 0)
      .sort((a, b) => a - b)

    const sortedBids = bids.orders
      .map(o => parseFloat(o.price))
      .filter(p => p > 0)
      .sort((a, b) => b - a)

    const bestAsk = sortedAsks[0] ?? null
    const bestBid = sortedBids[0] ?? null
    const spread = bestAsk && bestBid ? bestAsk - bestBid : null

    return {
      tokenId,
      bestBid,
      bestAsk,
      spread,
      timestamp: Date.now(),
    }
  } catch (error) {
    console.error(`Failed to fetch price for ${tokenId}:`, error)
    return {
      tokenId,
      bestBid: null,
      bestAsk: null,
      spread: null,
      timestamp: Date.now(),
    }
  }
}

/**
 * Get wallet balance
 */
export async function getBalance(): Promise<{ address: string; balance: string }> {
  const client = getClobClient()
  const address = await client.getAddress()
  const balance = await client.getBalance()
  return { address, balance: balance.toString() }
}

/**
 * Health check for CLOB connection
 */
export async function healthCheck(): Promise<{
  status: 'connected' | 'disconnected'
  latency?: number
  error?: string
}> {
  const start = Date.now()

  try {
    await clientInstance ?? getClobClient()
    const latency = Date.now() - start
    return { status: 'connected', latency }
  } catch (error) {
    return {
      status: 'disconnected',
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

// Export types
export type { ClobClient }
