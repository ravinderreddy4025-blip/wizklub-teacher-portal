import { config } from '../config.js'

const INVENTORY_API_BASE = config.inventoryApiBaseUrl

async function callInventoryBridge(path, payload) {
  if (!config.internalBridgeSecret) {
    const error = new Error('Inventory bridge is not configured (INTERNAL_BRIDGE_SECRET).')
    error.status = 503
    throw error
  }

  const response = await fetch(`${INVENTORY_API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Bridge-Secret': config.internalBridgeSecret,
    },
    body: JSON.stringify(payload),
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(data.message || data.error || 'Inventory bridge request failed.')
    error.status = response.status
    throw error
  }

  return data
}

export async function listInventorySchools({ schoolIds, wizklubToken, instructorName, userId }) {
  return callInventoryBridge('/auth/teacher-bridge/schools', {
    schoolIds,
    wizklubToken,
    instructorName,
    userId,
  })
}

export async function selectInventorySchool({
  schoolCode,
  schoolIds,
  wizklubToken,
  instructorName,
  userId,
}) {
  return callInventoryBridge('/auth/teacher-bridge/select-school', {
    schoolCode,
    schoolIds,
    wizklubToken,
    instructorName,
    userId,
  })
}
