#!/usr/bin/env node
// cleanup-ghost-members.mjs
// ───────────────────────────────────────────────────────────────────────────
// Remove Excel-imported "ghost" member profiles and hand their plots to the
// real (duplicate) account the person created when they actually signed up.
//
// Rules (decided with the user):
//   • GHOST  = role 'member' AND created on 2026-05-31, EXCEPT "Brandon Ellis".
//   • MATCH  ghost → real by EXACT email (case-insensitive, trimmed).
//   • Real account = a NON-ghost member doc with the same email.
//   • NO MATCH → skip the ghost entirely and report it (never orphan a plot).
//   • DELETE  = ghost's Firestore profile doc only (Auth left untouched).
//
// SAFETY: dry-run by default. Nothing is written unless you pass --commit.
//   1) node cleanup-ghost-members.mjs            # dry run: prints the full plan
//   2) *** take a Firestore backup / export ***
//   3) node cleanup-ghost-members.mjs --commit   # performs the changes
//
// Auth: set GOOGLE_APPLICATION_CREDENTIALS to a service-account JSON path, OR
//       drop a serviceAccount.json next to this file.
//
// ⚠️ BEFORE --commit: confirm every field name in CONFIG matches the real
//    schema (collection names, holder field on plots, createdAt type). The
//    dry-run output tells you if the filters matched the counts you expect.
// ───────────────────────────────────────────────────────────────────────────

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import admin from 'firebase-admin'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ===== CONFIG — adjust to the real project's schema ========================
const CONFIG = {
  membersCollection: 'members',      // TODO confirm (could be 'users' / 'profiles')
  plotsCollection: 'plots',          // TODO confirm

  fields: {
    email: 'email',                  // member email
    name: 'name',                    // member display / full name
    role: 'role',                    // member role
    createdAt: 'createdAt',          // Firestore Timestamp, ISO string, or millis
  },

  // How a plot references its holder. The script uses the FIRST of these that
  // exists on a given plot doc. Add/reorder to match the real model.
  plotHolderFields: ['holderUid', 'holderId', 'memberId', 'holder', 'assignedTo'],

  // Extra identifiers a plot's holder value might equal (besides the member
  // doc id). Used to map a ghost's plot onto the real account's equivalent id.
  memberIdFields: ['uid', 'authUid'],

  ghostDate: '2026-05-31',           // calendar day a ghost was created…
  ghostTimezone: 'America/Chicago',  // …evaluated in this timezone (Austin)
  memberRole: 'member',

  exclude: {
    names: ['brandon ellis'],        // never treat these as ghosts (lowercased)
    emails: [],                      // optionally add Brandon's email to be safe
  },

  // If a matched real account ALREADY holds a (different) plot, skip & report
  // instead of giving them a second plot. Set true only if double plots are ok.
  allowRealToGainSecondPlot: false,
}
// ===========================================================================

const COMMIT = process.argv.includes('--commit')
const norm = (s) => (s || '').toString().trim().toLowerCase()

function toDate(v) {
  if (v == null) return null
  if (typeof v.toDate === 'function') return v.toDate()      // Firestore Timestamp
  if (typeof v === 'object' && typeof v._seconds === 'number') return new Date(v._seconds * 1000)
  if (typeof v === 'number') return new Date(v)
  if (typeof v === 'string') { const d = new Date(v); return isNaN(d) ? null : d }
  return null
}
function dayInTz(date, tz) {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

function initAdmin() {
  const localSA = path.join(__dirname, 'serviceAccount.json')
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp({ credential: admin.credential.applicationDefault() })
  } else if (fs.existsSync(localSA)) {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(localSA, 'utf8'))) })
  } else {
    console.error('✗ No credentials. Set GOOGLE_APPLICATION_CREDENTIALS or add serviceAccount.json next to this script.')
    process.exit(1)
  }
  return admin.firestore()
}

function memberIdentifiers(m) {
  const ids = new Set([m.id])
  for (const f of CONFIG.memberIdFields) if (m[f]) ids.add(m[f])
  return ids
}
function plotHolder(plot) {
  for (const f of CONFIG.plotHolderFields) {
    if (plot[f] !== undefined && plot[f] !== null && plot[f] !== '') return { field: f, value: plot[f] }
  }
  return null
}

async function main() {
  const db = initAdmin()
  const F = CONFIG.fields
  console.log(`\nMode: ${COMMIT ? '🔴 COMMIT (will write)' : '🟢 DRY RUN (no writes)'}\n`)

  // --- load members ---
  const memSnap = await db.collection(CONFIG.membersCollection).get()
  const members = memSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
  console.log(`Loaded ${members.length} members from "${CONFIG.membersCollection}".`)

  const isExcluded = (m) =>
    CONFIG.exclude.names.includes(norm(m[F.name])) || CONFIG.exclude.emails.includes(norm(m[F.email]))

  const isGhost = (m) => {
    if (norm(m[F.role]) !== CONFIG.memberRole) return false
    const d = toDate(m[F.createdAt])
    if (!d) return false
    if (dayInTz(d, CONFIG.ghostTimezone) !== CONFIG.ghostDate) return false
    return !isExcluded(m)
  }

  const ghosts = members.filter(isGhost)
  const nonGhosts = members.filter((m) => !isGhost(m))
  console.log(`Ghost candidates (member, created ${CONFIG.ghostDate}, excl. Brandon): ${ghosts.length}`)

  // index real accounts by email
  const realByEmail = new Map()
  for (const m of nonGhosts) {
    const e = norm(m[F.email])
    if (!e) continue
    if (!realByEmail.has(e)) realByEmail.set(e, [])
    realByEmail.get(e).push(m)
  }

  // --- load plots and index by holder value ---
  const plotSnap = await db.collection(CONFIG.plotsCollection).get()
  const plots = plotSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
  const plotsByHolder = new Map() // holderValue -> [{plot, field}]
  for (const p of plots) {
    const h = plotHolder(p)
    if (!h) continue
    if (!plotsByHolder.has(h.value)) plotsByHolder.set(h.value, [])
    plotsByHolder.get(h.value).push({ plot: p, field: h.field })
  }
  const plotsForMember = (m) => {
    const out = []
    for (const idv of memberIdentifiers(m)) if (plotsByHolder.has(idv)) out.push(...plotsByHolder.get(idv))
    return out
  }
  const newHolderValueFor = (ghost, real, holderValue) => {
    // map the ghost's holder value onto the real account's equivalent id
    if (holderValue === ghost.id) return real.id
    for (const f of CONFIG.memberIdFields) if (holderValue === ghost[f]) return real[f] ?? real.id
    return real.id
  }

  // --- build the plan ---
  const plan = []   // { ghost, real, plotUpdates:[{plotId,field,from,to}] }
  const skipped = [] // { ghost, reason }

  for (const ghost of ghosts) {
    const email = norm(ghost[F.email])
    const gName = ghost[F.name] || '(no name)'
    if (!email) { skipped.push({ ghost, reason: 'ghost-has-no-email' }); continue }

    const candidates = (realByEmail.get(email) || []).filter((r) => r.id !== ghost.id)
    if (candidates.length === 0) { skipped.push({ ghost, reason: 'no-matching-real-account' }); continue }
    if (candidates.length > 1) { skipped.push({ ghost, reason: `ambiguous: ${candidates.length} real accounts share this email` }); continue }
    const real = candidates[0]

    const ghostPlots = plotsForMember(ghost)
    const realPlots = plotsForMember(real)
    if (realPlots.length > 0 && ghostPlots.length > 0 && !CONFIG.allowRealToGainSecondPlot) {
      skipped.push({ ghost, real, reason: `real account already holds a plot (${realPlots.map((x) => x.plot.id).join(', ')})` })
      continue
    }

    const plotUpdates = ghostPlots.map(({ plot, field }) => ({
      plotId: plot.id,
      field,
      from: plot[field],
      to: newHolderValueFor(ghost, real, plot[field]),
    }))
    plan.push({ ghost, real, plotUpdates })
  }

  // --- print the plan ---
  const line = '─'.repeat(78)
  console.log(`\n${line}\nPLAN: ${plan.length} ghost(s) to reassign+delete, ${skipped.length} skipped\n${line}`)
  for (const { ghost, real, plotUpdates } of plan) {
    console.log(`\n• DELETE ghost  ${ghost.id}  "${ghost[F.name]}"  <${ghost[F.email]}>`)
    console.log(`  → real       ${real.id}  "${real[F.name]}"  <${real[F.email]}>`)
    if (plotUpdates.length === 0) console.log('    (ghost holds no plots)')
    for (const u of plotUpdates) console.log(`    plot ${u.plotId}: ${u.field}  ${u.from}  →  ${u.to}`)
  }
  if (skipped.length) {
    console.log(`\n${line}\nSKIPPED (left untouched — handle manually):\n${line}`)
    for (const { ghost, reason } of skipped)
      console.log(`  • ${ghost.id}  "${ghost[F.name]}"  <${ghost[F.email]}>  — ${reason}`)
  }

  // --- write a report file ---
  const report = {
    generatedAtNote: 'stamp externally; script cannot read the clock',
    mode: COMMIT ? 'commit' : 'dry-run',
    counts: { members: members.length, ghostCandidates: ghosts.length, planned: plan.length, skipped: skipped.length },
    plan: plan.map((p) => ({
      ghostId: p.ghost.id, ghostName: p.ghost[F.name], ghostEmail: p.ghost[F.email],
      realId: p.real.id, realName: p.real[F.name], realEmail: p.real[F.email],
      plotUpdates: p.plotUpdates,
    })),
    skipped: skipped.map((s) => ({ ghostId: s.ghost.id, ghostName: s.ghost[F.name], ghostEmail: s.ghost[F.email], reason: s.reason })),
  }
  const reportPath = path.join(__dirname, `report-${COMMIT ? 'commit' : 'dryrun'}.json`)
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
  console.log(`\nReport written: ${reportPath}`)

  if (!COMMIT) {
    console.log('\n🟢 Dry run only — nothing was changed. Review the plan above, back up Firestore,')
    console.log('   then re-run with --commit to apply.\n')
    return
  }

  // --- COMMIT: reassign plots, then delete ghost docs (batched ≤500 ops) ---
  console.log('\n🔴 Committing…')
  const ops = []
  for (const { ghost, plotUpdates } of plan) {
    for (const u of plotUpdates) ops.push({ ref: db.collection(CONFIG.plotsCollection).doc(u.plotId), data: { [u.field]: u.to } })
  }
  // apply plot reassignments first…
  for (let i = 0; i < ops.length; i += 450) {
    const batch = db.batch()
    for (const op of ops.slice(i, i + 450)) batch.update(op.ref, op.data)
    await batch.commit()
  }
  // …then delete the ghost profiles
  const delRefs = plan.map(({ ghost }) => db.collection(CONFIG.membersCollection).doc(ghost.id))
  for (let i = 0; i < delRefs.length; i += 450) {
    const batch = db.batch()
    for (const ref of delRefs.slice(i, i + 450)) batch.delete(ref)
    await batch.commit()
  }
  console.log(`✓ Reassigned ${ops.length} plot(s), deleted ${delRefs.length} ghost profile(s).`)
  console.log(`  ${skipped.length} skipped (see report).\n`)
}

main().catch((e) => { console.error(e); process.exit(1) })
