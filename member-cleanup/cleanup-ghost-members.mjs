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
// Adapted to the real SACG schema (src/lib/types.ts):
//   • members.displayName is the name field; members.uid = auth uid (null for
//     Excel imports); member doc id = auth uid for real signups.
//   • A plot references holders THREE ways, all kept in sync here:
//       - holderMemberId   (primary holder — drives dues attribution)
//       - holderMemberIds  (array incl. primary — source of truth for access)
//       - holderName       (denormalized display name shown on the plot)
//   • A ghost may also be a CO-HOLDER on someone else's plot (only present in
//     holderMemberIds): the id is swapped in place, primary fields untouched.
//   • The Members Lounge `directory/{memberId}` doc is deleted with the ghost
//     so ghosts don't linger in the lounge directory.
//
// SAFETY: dry-run by default. Nothing is written unless you pass --commit.
//   1) node cleanup-ghost-members.mjs            # dry run: prints the full plan
//   2) *** take a Firestore backup / export ***
//   3) node cleanup-ghost-members.mjs --commit   # performs the changes
//
// Auth: set GOOGLE_APPLICATION_CREDENTIALS to a service-account JSON path, OR
//       drop a serviceAccount.json next to this file.
// ───────────────────────────────────────────────────────────────────────────

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import admin from 'firebase-admin'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ===== CONFIG — matched to the real SACG schema ============================
const CONFIG = {
  membersCollection: 'members',        // confirmed: src/data/collections.ts
  plotsCollection: 'plots',            // confirmed: src/data/collections.ts
  directoryCollection: 'directory',    // Members Lounge mirror, keyed by member id

  fields: {
    email: 'email',
    name: 'displayName',               // Member.displayName
    role: 'role',
    createdAt: 'createdAt',            // Firestore Timestamp
  },

  // Plot holder fields (all three kept in sync on reassignment).
  plotPrimaryHolderField: 'holderMemberId',
  plotHolderArrayField: 'holderMemberIds',
  plotHolderNameField: 'holderName',

  // Ids besides the member doc id a plot's holder value could equal.
  // (Excel-import ghosts have uid: null, so in practice ghosts are referenced
  // by doc id — real accounts' doc id IS their auth uid.)
  memberIdFields: ['uid'],

  ghostDate: '2026-05-31',             // calendar day a ghost was created…
  ghostTimezone: 'America/Chicago',    // …evaluated in this timezone (Austin)
  memberRole: 'member',

  exclude: {
    names: ['brandon ellis'],          // never treat these as ghosts (lowercased)
    emails: ['bellis.swe@gmail.com'],
  },

  // If a matched real account ALREADY primarily holds a (different) plot,
  // skip & report instead of giving them a second plot. Co-holder swaps are
  // not affected by this rule (shared access is preserved, not gained).
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

async function main() {
  const db = initAdmin()
  const F = CONFIG.fields
  const PRIMARY = CONFIG.plotPrimaryHolderField
  const ARRAY = CONFIG.plotHolderArrayField
  const HNAME = CONFIG.plotHolderNameField
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

  // --- load plots and index holds by member identifier ---
  const plotSnap = await db.collection(CONFIG.plotsCollection).get()
  const plots = plotSnap.docs.map((d) => ({ id: d.id, ...d.data() }))

  // { primary: idValue -> [plot], coHolder: idValue -> [plot] }
  const primaryByHolder = new Map()
  const arrayByHolder = new Map()
  for (const p of plots) {
    const pv = p[PRIMARY]
    if (pv !== undefined && pv !== null && pv !== '') {
      if (!primaryByHolder.has(pv)) primaryByHolder.set(pv, [])
      primaryByHolder.get(pv).push(p)
    }
    for (const av of Array.isArray(p[ARRAY]) ? p[ARRAY] : []) {
      if (!arrayByHolder.has(av)) arrayByHolder.set(av, [])
      arrayByHolder.get(av).push(p)
    }
  }
  const lookup = (map, m) => {
    const out = []
    for (const idv of memberIdentifiers(m)) if (map.has(idv)) out.push(...map.get(idv))
    return out
  }
  const dedupePlots = (arr) => [...new Map(arr.map((p) => [p.id, p])).values()]
  const primaryPlotsFor = (m) => dedupePlots(lookup(primaryByHolder, m))
  const anyHoldPlotsFor = (m) => dedupePlots([...lookup(primaryByHolder, m), ...lookup(arrayByHolder, m)])

  // --- build the plan ---
  const plan = []    // { ghost, real, plotUpdates:[{plotId, changes:{field:{from,to}}}] }
  const skipped = [] // { ghost, reason }

  for (const ghost of ghosts) {
    const email = norm(ghost[F.email])
    if (!email) { skipped.push({ ghost, reason: 'ghost-has-no-email' }); continue }

    const candidates = (realByEmail.get(email) || []).filter((r) => r.id !== ghost.id)
    if (candidates.length === 0) { skipped.push({ ghost, reason: 'no-matching-real-account' }); continue }
    if (candidates.length > 1) { skipped.push({ ghost, reason: `ambiguous: ${candidates.length} real accounts share this email` }); continue }
    const real = candidates[0]

    const ghostIds = memberIdentifiers(ghost)
    const ghostPrimary = primaryPlotsFor(ghost)
    const realPrimary = primaryPlotsFor(real)
    if (realPrimary.length > 0 && ghostPrimary.length > 0 && !CONFIG.allowRealToGainSecondPlot) {
      skipped.push({ ghost, real, reason: `real account already holds a plot (${realPrimary.map((p) => p.id).join(', ')})` })
      continue
    }

    const plotUpdates = []
    for (const plot of anyHoldPlotsFor(ghost)) {
      const changes = {}
      if (ghostIds.has(plot[PRIMARY])) {
        changes[PRIMARY] = { from: plot[PRIMARY], to: real.id }
        const newName = real[F.name] || plot[HNAME] || ''
        if (plot[HNAME] !== newName) changes[HNAME] = { from: plot[HNAME], to: newName }
      }
      const arr = Array.isArray(plot[ARRAY]) ? plot[ARRAY] : []
      if (arr.some((v) => ghostIds.has(v))) {
        const swapped = [...new Set(arr.map((v) => (ghostIds.has(v) ? real.id : v)))]
        changes[ARRAY] = { from: arr, to: swapped }
      }
      if (Object.keys(changes).length) plotUpdates.push({ plotId: plot.id, changes })
    }
    plan.push({ ghost, real, plotUpdates })
  }

  // --- print the plan ---
  const fmt = (v) => (Array.isArray(v) ? `[${v.join(', ')}]` : v)
  const line = '─'.repeat(78)
  console.log(`\n${line}\nPLAN: ${plan.length} ghost(s) to reassign+delete, ${skipped.length} skipped\n${line}`)
  for (const { ghost, real, plotUpdates } of plan) {
    console.log(`\n• DELETE ghost  ${ghost.id}  "${ghost[F.name]}"  <${ghost[F.email]}>  (+ directory doc)`)
    console.log(`  → real       ${real.id}  "${real[F.name]}"  <${real[F.email]}>`)
    if (plotUpdates.length === 0) console.log('    (ghost holds no plots)')
    for (const u of plotUpdates)
      for (const [field, c] of Object.entries(u.changes))
        console.log(`    plot ${u.plotId}: ${field}  ${fmt(c.from)}  →  ${fmt(c.to)}`)
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

  // --- COMMIT: reassign plots, then delete ghost profiles + directory docs ---
  console.log('\n🔴 Committing…')
  const ops = []
  for (const { plotUpdates } of plan) {
    for (const u of plotUpdates) {
      const data = {}
      for (const [field, c] of Object.entries(u.changes)) data[field] = c.to
      ops.push({ ref: db.collection(CONFIG.plotsCollection).doc(u.plotId), data })
    }
  }
  // apply plot reassignments first…
  for (let i = 0; i < ops.length; i += 450) {
    const batch = db.batch()
    for (const op of ops.slice(i, i + 450)) batch.update(op.ref, op.data)
    await batch.commit()
  }
  // …then delete the ghost profiles + their lounge directory mirrors
  const delRefs = plan.flatMap(({ ghost }) => [
    db.collection(CONFIG.membersCollection).doc(ghost.id),
    db.collection(CONFIG.directoryCollection).doc(ghost.id),
  ])
  for (let i = 0; i < delRefs.length; i += 450) {
    const batch = db.batch()
    for (const ref of delRefs.slice(i, i + 450)) batch.delete(ref)
    await batch.commit()
  }
  console.log(`✓ Updated ${ops.length} plot(s), deleted ${plan.length} ghost profile(s) (+ directory docs).`)
  console.log(`  ${skipped.length} skipped (see report).\n`)
}

main().catch((e) => { console.error(e); process.exit(1) })
