import { execSync } from 'node:child_process'

const SITE_ID = 'bcb21337-a222-4222-b838-4e80bf6e266d'

async function run() {
  console.log('Fetching site details...')
  const siteRaw = execSync(`npx netlify api getSite --data '{"site_id":"${SITE_ID}"}'`).toString()
  const site = JSON.parse(siteRaw)
  const activeDeployId = site.published_deploy?.id

  console.log(`Active Published Deploy ID: ${activeDeployId}`)
  if (!activeDeployId) {
    throw new Error('Could not identify active published deploy ID')
  }

  console.log('Fetching all site deploys...')
  const deploysRaw = execSync(`npx netlify api listSiteDeploys --data '{"site_id":"${SITE_ID}"}'`).toString()
  const deploys = JSON.parse(deploysRaw)

  console.log(`Found ${deploys.length} total deploys on Netlify.`)

  const toDelete = deploys.filter(d => d.id !== activeDeployId)
  console.log(`Deploys to delete: ${toDelete.length}`)

  let deletedCount = 0
  let failedCount = 0

  for (const deploy of toDelete) {
    const desc = deploy.title || deploy.commit_message || deploy.id
    process.stdout.write(`Deleting deploy ${deploy.id} (${desc})... `)
    try {
      execSync(`npx netlify api deleteDeploy --data '{"deploy_id":"${deploy.id}"}'`)
      console.log('✓ DELETED')
      deletedCount++
    } catch (err) {
      console.log(`✗ FAILED: ${err.message}`)
      failedCount++
    }
  }

  console.log('\n=================================================')
  console.log(`Cleanup complete! Successfully deleted ${deletedCount} deploys. (Failed: ${failedCount})`)
  console.log(`Current active deploy: ${activeDeployId} (STILL LIVE & UNTOUCHED)`)
  console.log('=================================================\n')
}

run().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
