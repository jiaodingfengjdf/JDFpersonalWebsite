import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const bundle = JSON.parse(readFileSync('.theme-evidence.json', 'utf8'))
mkdirSync('.local', { recursive: true })

const record = (bundle.records ?? []).find(
  (item) => item.evidence_id === 'ev_3085011cede221ebdeade8b41730474cf83d4e3a6292e25c401c8147df1d118f',
)
if (!record) {
  console.log('record not found; ids:', (bundle.records ?? []).map((r) => r.evidence_id).slice(0, 5))
  process.exit(1)
}

const steps = record.normalized_result?.steps ?? []
for (const step of steps) {
  const shot = step.artifacts?.screenshot
  if (shot?.state === 'captured' && shot.value?.data_base64) {
    const file = `.local/${step.step_id}.png`
    writeFileSync(file, Buffer.from(shot.value.data_base64, 'base64'))
    console.log('saved', file, shot.value.bytes)
  }
}

const events = record.normalized_result?.events?.items ?? []
console.log('console events:', events.length)
