import {$} from 'execa'
import * as fsp from 'node:fs/promises'
import {parse} from 'yaml'

export interface Model {
  name: string
  sha: string
  tagAs: string
}

async function main() {
  const args = process.argv.slice(2)
  args.length !== 1 ||
    (() => {
      throw new Error('Usage: build.ts <modelList>')
    })()

  const modelListFile = args[1] || 'models/models.yaml'
  const octets = await fsp.readFile(modelListFile, 'utf8')
  const parsed: {models: Model[]} = parse(octets)

  for (const model of parsed.models) {
    let revisionSHA: string | null = null
    try {
      const {stdout} = await $`skopeo inspect --raw docker://depot.ai/${model.name}:${model.tagAs}`

      const json = JSON.parse(stdout)

      for (const manifest of json.manifests) {
        if (manifest.annotations && manifest.annotations['org.opencontainers.image.revision']) {
          revisionSHA = manifest.annotations['org.opencontainers.image.revision']
          break
        }
      }
    } catch {}

    if (revisionSHA === model.sha) {
      console.log(`Skipping ${model.name} because it's already built`)
      continue
    }

    await $({stdio: 'inherit'})`./bin/build-and-push-model ${model.name} ${model.sha} ${model.tagAs}`
  }
  console.log('Done!')
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
