import { Teacher } from '../db/models.js'
import { isDatabaseReady } from '../db/state.js'
import { getSession } from '../services/sessionStore.js'

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required.' })
  }

  const token = header.slice(7)
  const session = getSession(token)
  if (!session) {
    return res.status(401).json({ error: 'Invalid or expired session.' })
  }

  let teacher

  if (isDatabaseReady()) {
    teacher = await Teacher.findById(session.teacherId).lean()
    if (!teacher) {
      return res.status(401).json({ error: 'Invalid session.' })
    }
  } else {
    teacher = {
      _id: session.teacherId,
      user_id: session.userId,
      full_name: session.fullName ?? session.userId,
    }
  }

  req.teacher = teacher
  req.accessToken = token
  req.refreshToken = session.refreshToken ?? null
  req.schoolIds = session.schoolIds ?? []
  req.batchIds = session.batchIds ?? []
  next()
}
