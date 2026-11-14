/**
 * Host half of dsh-study-reminder.
 *
 * The host owns the reminder data file and is the only writer of Windows
 * scheduled tasks. It never posts into a conversation: every delivery is a
 * detached PowerShell popup, either fired now (`/test`) or by Windows Task
 * Scheduler at the configured time.
 */
import { execFile, spawn } from 'node:child_process'
import { existsSync, promises as fsp } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const POWERSHELL = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
const ROUTE = '/__dsh-study-reminder'
const POPUP_SCRIPT = path.join(HERE, 'scripts', 'Popup-Reminder.ps1')
const FOCUS_SCRIPT = path.join(HERE, 'scripts', 'Focus-DSH.ps1')
const SYNC_SCRIPT = path.join(HERE, 'scripts', 'Sync-Reminders.ps1')
const MIGRATE_SCRIPT = path.join(HERE, 'scripts', 'Migrate-Legacy.ps1')
const TASK_PREFIX = 'DSH Study Reminder - '
const DEFAULT_POPUP_HINT = '点击卡片回到 DSH'

export const name = 'dsh-study-reminder'

function textOf(value, maxLength) {
  return String(value ?? '').replace(/\r\n/g, '\n').trim().slice(0, maxLength)
}

function isDay(value) {
  return Number.isInteger(value) && value >= 1 && value <= 7
}

function normalizeDays(value) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map(Number).filter(isDay))].sort((a, b) => a - b)
}

function normalizeReminder(input, previous) {
  if (!input || typeof input !== 'object') throw new Error('reminder payload is missing')
  const title = textOf(input.title, 80)
  if (!title) throw new Error('title is required')
  const time = textOf(input.time, 5)
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('time must be HH:MM')
  const days = normalizeDays(input.days)
  if (days.length === 0) throw new Error('at least one weekday is required')
  const message = textOf(input.message, 600)
  let seconds = Number(input.seconds ?? previous?.seconds ?? 30)
  if (!Number.isFinite(seconds)) seconds = 30
  seconds = Math.min(180, Math.max(5, Math.round(seconds)))
  const position = input.position === 'center' ? 'center' : 'bottomright'
  const id = previous?.id ?? (typeof input.id === 'string' && input.id ? input.id : createId())
  return {
    id,
    title,
    message,
    time,
    days,
    enabled: input.enabled !== false,
    seconds,
    position,
    legacyTask: previous?.legacyTask ?? input.legacyTask ?? null,
    createdAt: previous?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

function createId() {
  return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

function normalizeData(raw) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const reminders = []
  const seen = new Set()
  for (const item of Array.isArray(source.reminders) ? source.reminders : []) {
    try {
      let id = typeof item?.id === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(item.id) ? item.id : createId()
      if (seen.has(id)) id = createId()
      const normalized = normalizeReminder({ ...item, id }, undefined)
      normalized.createdAt = typeof item.createdAt === 'string' ? item.createdAt : normalized.createdAt
      normalized.updatedAt = typeof item.updatedAt === 'string' ? item.updatedAt : normalized.updatedAt
      normalized.legacyTask = typeof item.legacyTask === 'string' ? item.legacyTask : null
      seen.add(id)
      reminders.push(normalized)
    } catch {
      // A damaged entry must not take the whole panel down; it is dropped.
    }
  }
  reminders.sort((a, b) => a.time.localeCompare(b.time) || a.title.localeCompare(b.title))
  return {
    version: 1,
    migrated: source.migrated === true,
    migratedFrom: source.migratedFrom ?? null,
    popupHint: typeof source.popupHint === 'string' && source.popupHint.trim() ? source.popupHint.trim().slice(0, 120) : DEFAULT_POPUP_HINT,
    reminders,
  }
}

function nextRunAt(reminder, now = new Date()) {
  const [hour, minute] = reminder.time.split(':').map(Number)
  for (let offset = 0; offset <= 8; offset += 1) {
    const candidate = new Date(now)
    candidate.setDate(now.getDate() + offset)
    candidate.setHours(hour, minute, 0, 0)
    const isoDay = candidate.getDay() === 0 ? 7 : candidate.getDay()
    if (reminder.days.includes(isoDay) && candidate.getTime() > now.getTime() - 30_000) {
      return candidate.toISOString()
    }
  }
  return null
}

function runPowerShell(scriptPath, args, timeout = 120_000) {
  return new Promise((resolve, reject) => {
    execFile(
      POWERSHELL,
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...args],
      { windowsHide: true, timeout, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const lines = String(stdout ?? '').trim().split(/\r?\n/).filter(Boolean)
        let parsed = null
        for (let index = lines.length - 1; index >= 0; index -= 1) {
          try {
            parsed = JSON.parse(lines[index])
            break
          } catch {
            // keep looking for the last JSON line
          }
        }
        if (parsed) {
          resolve(parsed)
          return
        }
        const suffix = String(stderr ?? '').trim().slice(0, 800)
        reject(new Error(`PowerShell script ${path.basename(scriptPath)} failed: ${error?.message ?? 'no output'}${suffix ? ` | ${suffix}` : ''}`))
      },
    )
  })
}

function resolveAppPath(config) {
  const configured = textOf(config?.appPath, 1024)
  if (configured && existsSync(configured)) return configured
  const execPath = process.execPath
  if (execPath && /\.exe$/i.test(execPath) && /DeepSeek|Harness/i.test(execPath) && existsSync(execPath)) return execPath
  const localAppData = process.env.LOCALAPPDATA || ''
  if (localAppData) {
    const guess = path.join(localAppData, 'Programs', 'DeepSeek Harness', 'DeepSeek Harness.exe')
    if (existsSync(guess)) return guess
  }
  return ''
}

function createState(ctx, config) {
  const dataDir = textOf(config?.dataDir, 1024) || path.join(os.homedir(), '.dsh', 'study-reminder')
  return {
    ctx,
    config: config ?? {},
    dataDir,
    dataFile: path.join(dataDir, 'reminders.json'),
    runtimeFile: path.join(dataDir, 'runtime.json'),
    configDir: path.join(dataDir, 'configs'),
    logDir: path.join(dataDir, 'logs'),
    appPath: resolveAppPath(config),
    data: null,
    lastSync: null,
    initPromise: null,
  }
}

function advertisedUrl(ctx) {
  try {
    const webApp = ctx.get('webApp')
    if (webApp && typeof webApp.getAdvertisedUrl === 'function') {
      const url = webApp.getAdvertisedUrl()
      if (url) return String(url)
    }
  } catch {
    // service not mounted yet
  }
  try {
    const webServer = ctx.get('webServer')
    if (webServer && typeof webServer.getOrigin === 'function') return String(webServer.getOrigin())
  } catch {
    // service not mounted yet
  }
  return ''
}

async function readJson(file) {
  return JSON.parse(await fsp.readFile(file, 'utf8'))
}

async function writeJsonAtomic(file, value) {
  const tmp = `${file}.${process.pid}.tmp`
  await fsp.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await fsp.rename(tmp, file)
}

async function loadData(s) {
  try {
    return normalizeData(await readJson(s.dataFile))
  } catch (error) {
    if (error?.code === 'ENOENT') return normalizeData(null)
    try {
      const backup = `${s.dataFile}.corrupt-${Date.now()}`
      await fsp.rename(s.dataFile, backup)
      s.ctx.logger?.warn?.(`dsh-study-reminder: unreadable ${s.dataFile}, moved to ${backup}`)
    } catch {
      // ignore backup failure
    }
    return normalizeData(null)
  }
}

async function writeRuntime(s, url) {
  const runtime = {
    dshUrl: url || advertisedUrl(s.ctx),
    appPath: s.appPath,
    dataPath: s.dataFile,
    updatedAt: new Date().toISOString(),
  }
  try {
    await writeJsonAtomic(s.runtimeFile, runtime)
  } catch (error) {
    s.ctx.logger?.warn?.(`dsh-study-reminder: cannot write runtime file: ${error?.message}`)
  }
  return runtime
}

async function migrateLegacy(s) {
  if (s.data.migrated) return
  try {
    const result = await runPowerShell(MIGRATE_SCRIPT, ['-LogDir', s.logDir])
    const imported = Array.isArray(result?.reminders) ? result.reminders : []
    const legacyCount = Number(result?.legacyCount ?? 0)
    let added = 0
    for (const item of imported) {
      try {
        if (s.data.reminders.some((existing) => existing.legacyTask === item.legacyTask && item.legacyTask)) continue
        const reminder = normalizeReminder(item, undefined)
        reminder.legacyTask = item.legacyTask ?? null
        s.data.reminders.push(reminder)
        added += 1
      } catch (error) {
        s.ctx.logger?.warn?.(`dsh-study-reminder: skipping legacy reminder: ${error?.message}`)
      }
    }
    s.data.reminders.sort((a, b) => a.time.localeCompare(b.time) || a.title.localeCompare(b.title))
    const allTakenOver = legacyCount === 0 || imported.length >= legacyCount
    s.data.migrated = allTakenOver
    s.data.migratedFrom = { legacyCount, imported: imported.length, added, at: new Date().toISOString() }
    await writeJsonAtomic(s.dataFile, s.data)
    s.ctx.logger?.info?.(`dsh-study-reminder: legacy migration count=${legacyCount} imported=${imported.length} added=${added}`)
  } catch (error) {
    s.ctx.logger?.warn?.(`dsh-study-reminder: legacy migration failed: ${error?.message}`)
  }
}

async function syncTasks(s) {
  const url = advertisedUrl(s.ctx)
  await writeRuntime(s, url)
  const args = [
    '-DataPath', s.dataFile,
    '-PopupScript', POPUP_SCRIPT,
    '-FocusScript', FOCUS_SCRIPT,
    '-ConfigDir', s.configDir,
    '-LogDir', s.logDir,
    '-AppPath', s.appPath || '',
    '-DshUrl', url,
    '-Migrated', s.data.migrated ? '1' : '0',
  ]
  try {
    const result = await runPowerShell(SYNC_SCRIPT, args)
    s.lastSync = {
      at: new Date().toISOString(),
      ok: result?.ok !== false && !(Array.isArray(result?.errors) && result.errors.length > 0),
      tasks: Array.isArray(result?.tasks) ? result.tasks : [],
      removed: Array.isArray(result?.removed) ? result.removed : [],
      legacyRemoved: Array.isArray(result?.legacyRemoved) ? result.legacyRemoved : [],
      errors: Array.isArray(result?.errors) ? result.errors : [],
    }
  } catch (error) {
    s.lastSync = {
      at: new Date().toISOString(),
      ok: false,
      tasks: [],
      removed: [],
      legacyRemoved: [],
      errors: [{ id: null, message: String(error?.message ?? error) }],
    }
    s.ctx.logger?.warn?.(`dsh-study-reminder: task sync failed: ${error?.message}`)
  }
  return s.lastSync
}

async function initialize(s) {
  await fsp.mkdir(s.dataDir, { recursive: true })
  await fsp.mkdir(s.configDir, { recursive: true })
  await fsp.mkdir(s.logDir, { recursive: true })
  s.data = await loadData(s)
  await migrateLegacy(s)
  await writeJsonAtomic(s.dataFile, s.data)
  await syncTasks(s)
  return s
}

function ensure(s) {
  if (!s.initPromise) {
    s.initPromise = initialize(s).catch((error) => {
      s.initPromise = null
      throw error
    })
  }
  return s.initPromise
}

function statePayload(s) {
  return {
    reminders: s.data.reminders.map((reminder) => ({ ...reminder, nextRunAt: nextRunAt(reminder) })),
    tasks: s.lastSync?.tasks ?? [],
    lastSync: s.lastSync,
    dataPath: s.dataFile,
    configDir: s.configDir,
    dshUrl: advertisedUrl(s.ctx),
    appPath: s.appPath,
    platform: process.platform,
    migrated: s.data.migrated,
    migratedFrom: s.data.migratedFrom,
    taskPrefix: TASK_PREFIX,
  }
}

async function saveReminder(s, input) {
  const existingIndex = s.data.reminders.findIndex((item) => item.id === input?.id)
  const previous = existingIndex >= 0 ? s.data.reminders[existingIndex] : undefined
  if (input?.id && !previous) throw new Error(`unknown reminder: ${input.id}`)
  const reminder = normalizeReminder(input, previous)
  if (previous) {
    s.data.reminders[existingIndex] = reminder
  } else {
    s.data.reminders.push(reminder)
  }
  s.data.reminders.sort((a, b) => a.time.localeCompare(b.time) || a.title.localeCompare(b.title))
  await writeJsonAtomic(s.dataFile, s.data)
  await syncTasks(s)
  return reminder
}

async function deleteReminder(s, id) {
  const before = s.data.reminders.length
  s.data.reminders = s.data.reminders.filter((item) => item.id !== id)
  if (s.data.reminders.length === before) throw new Error(`unknown reminder: ${id}`)
  await writeJsonAtomic(s.dataFile, s.data)
  await syncTasks(s)
}

async function testPopup(s, id) {
  const reminder = s.data.reminders.find((item) => item.id === id) ?? s.data.reminders[0]
  const config = {
    id: 'test',
    title: reminder?.title ?? 'Study Reminder',
    message: reminder?.message ?? 'This is a test card from the study reminder panel.',
    seconds: reminder?.seconds ?? 20,
    position: reminder?.position ?? 'bottomright',
    hint: s.data.popupHint ?? DEFAULT_POPUP_HINT,
    focusScript: FOCUS_SCRIPT,
    dataDir: s.dataDir,
    logDir: s.logDir,
  }
  const configPath = path.join(s.configDir, '_test.json')
  await writeJsonAtomic(configPath, config)

  // Fire-and-forget card. Keep the child attached to the host (a detached
  // process is killed by the desktop shell's job object before PowerShell can
  // create a window) and send its output to a log file instead of a pipe.
  const logPath = path.join(s.logDir, 'test-popup.log')
  const append = (line) => fsp.appendFile(logPath, `${new Date().toISOString()} ${line}\n`, 'utf8').catch(() => {})
  let handle = null
  try {
    handle = await fsp.open(logPath, 'a')
    const child = spawn(
      POWERSHELL,
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', POPUP_SCRIPT, '-ConfigPath', configPath],
      { detached: false, stdio: ['ignore', handle.fd, handle.fd], windowsHide: true },
    )
    await append(`spawn pid=${child.pid ?? 'unknown'}`)
    child.on('error', (error) => { void append(`error ${error?.message ?? error}`) })
    child.on('exit', (code, signal) => { void append(`exit code=${code} signal=${signal}`) })
    child.unref()
  } catch (error) {
    await append(`throw ${error?.message ?? error}`)
    throw error
  } finally {
    if (handle) await handle.close().catch(() => {})
  }
}

function readBody(req, limit = 256 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    let settled = false
    req.on('data', (chunk) => {
      if (settled) return
      size += chunk.length
      if (size > limit) {
        settled = true
        reject(new Error('request body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (settled) return
      settled = true
      resolve(Buffer.concat(chunks).toString('utf8'))
    })
    req.on('error', (error) => {
      if (settled) return
      settled = true
      reject(error)
    })
  })
}

function sendJson(res, status, value) {
  const body = Buffer.from(JSON.stringify(value), 'utf8')
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': body.length,
    'cache-control': 'no-store',
  })
  res.end(body)
}

function sameOriginWrite(req) {
  const origin = req.headers.origin
  if (origin) {
    try {
      const parsed = new URL(origin)
      const host = String(req.headers.host ?? '')
      if (parsed.host !== host) return false
    } catch {
      return false
    }
  }
  // A cross-site form cannot set this header; our own page always does.
  return req.headers['x-dsh-study-reminder'] === '1'
}

function methodNotAllowed(res, allowed) {
  res.setHeader('allow', allowed.join(', '))
  sendJson(res, 405, { ok: false, error: 'method not allowed' })
}

function registerRoutes(webCtx, s) {
  const register = (suffix, handler) => {
    webCtx.effect(
      () => webCtx.webServer.register({ kind: 'exact', path: `${ROUTE}/${suffix}`, handler }),
      `dsh-study-reminder: ${suffix} route`,
    )
  }

  const guarded = (handler) => async (req, res) => {
    try {
      await handler(req, res)
    } catch (error) {
      if (!res.headersSent) sendJson(res, 400, { ok: false, error: String(error?.message ?? error) })
      else res.end()
    }
  }

  register('state', guarded(async (req, res) => {
    if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])
    req.resume()
    await ensure(s)
    sendJson(res, 200, { ok: true, state: statePayload(s) })
  }))

  register('save', guarded(async (req, res) => {
    if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])
    if (!sameOriginWrite(req)) return sendJson(res, 403, { ok: false, error: 'forbidden' })
    const body = JSON.parse(await readBody(req))
    await ensure(s)
    const reminder = await saveReminder(s, body?.reminder)
    sendJson(res, 200, { ok: true, reminder, state: statePayload(s) })
  }))

  register('delete', guarded(async (req, res) => {
    if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])
    if (!sameOriginWrite(req)) return sendJson(res, 403, { ok: false, error: 'forbidden' })
    const body = JSON.parse(await readBody(req))
    await ensure(s)
    await deleteReminder(s, String(body?.id ?? ''))
    sendJson(res, 200, { ok: true, state: statePayload(s) })
  }))

  register('sync', guarded(async (req, res) => {
    if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])
    if (!sameOriginWrite(req)) return sendJson(res, 403, { ok: false, error: 'forbidden' })
    req.resume()
    await ensure(s)
    await writeJsonAtomic(s.dataFile, s.data)
    await syncTasks(s)
    sendJson(res, 200, { ok: true, state: statePayload(s) })
  }))

  register('test', guarded(async (req, res) => {
    if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])
    if (!sameOriginWrite(req)) return sendJson(res, 403, { ok: false, error: 'forbidden' })
    const body = JSON.parse(await readBody(req))
    await ensure(s)
    await testPopup(s, String(body?.id ?? ''))
    sendJson(res, 200, { ok: true })
  }))
}

export function apply(ctx, config) {
  const s = createState(ctx, config)
  ctx.inject(['webServer'], (webCtx) => {
    registerRoutes(webCtx, s)
  })
  ctx.effect(() => {
    let disposed = false
    ensure(s).catch((error) => {
      if (!disposed) ctx.logger?.error?.(`dsh-study-reminder: initialization failed: ${error?.message}`)
    })
    return () => {
      disposed = true
    }
  }, 'dsh-study-reminder: initialization')
}
