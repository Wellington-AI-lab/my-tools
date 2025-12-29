/**
 * Polymarket Connection Test API
 * GET /api/test-connection
 *
 * Returns connection status, wallet balance, and latency metrics
 */

import { NextRequest, NextResponse } from 'next/server'
import { getClobClient, getBalance, healthCheck } from '@/lib/polymarket'

// Edge runtime for lowest latency
export const runtime = 'edge'
export const dynamic = 'force-dynamic'

interface ConnectionResponse {
  status: 'success' | 'error'
  timestamp: number
  data: {
    connection_check: {
      status: 'connected' | 'disconnected'
      latency_ms: number
    }
    balance?: {
      address: string
      eth_balance: string
      usdc_balance?: string
    }
    environment: {
      chain_id: number
      clob_url: string
      wallet_configured: boolean
    }
  }
  error?: string
}

export async function GET(request: NextRequest) {
  const startTime = Date.now()

  try {
    // Health check
    const health = await healthCheck()

    if (health.status === 'disconnected') {
      return NextResponse.json<ConnectionResponse>({
        status: 'error',
        timestamp: Date.now(),
        data: {
          connection_check: {
            status: 'disconnected',
            latency_ms: 0,
          },
          environment: {
            chain_id: 137,
            clob_url: process.env.NEXT_PUBLIC_CLOB_API || 'https://clob.polymarket.com',
            wallet_configured: !!process.env.PRIVATE_KEY,
          },
        },
        error: health.error,
      }, { status: 503 })
    }

    // Get balance
    let balanceData
    try {
      balanceData = await getBalance()
    } catch (err) {
      balanceData = {
        address: 'N/A',
        eth_balance: '0',
        error: err instanceof Error ? err.message : 'Failed to fetch balance',
      }
    }

    const latency = Date.now() - startTime

    return NextResponse.json<ConnectionResponse>({
      status: 'success',
      timestamp: Date.now(),
      data: {
        connection_check: {
          status: 'connected',
          latency_ms: latency,
        },
        balance: balanceData,
        environment: {
          chain_id: 137,
          clob_url: process.env.NEXT_PUBLIC_CLOB_API || 'https://clob.polymarket.com',
          wallet_configured: !!process.env.PRIVATE_KEY,
        },
      },
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'X-Edge-Latency': latency.toString(),
      },
    })

  } catch (error) {
    const latency = Date.now() - startTime

    return NextResponse.json<ConnectionResponse>({
      status: 'error',
      timestamp: Date.now(),
      data: {
        connection_check: {
          status: 'disconnected',
          latency_ms: latency,
        },
        environment: {
          chain_id: 137,
          clob_url: process.env.NEXT_PUBLIC_CLOB_API || 'https://clob.polymarket.com',
          wallet_configured: !!process.env.PRIVATE_KEY,
        },
      },
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}
