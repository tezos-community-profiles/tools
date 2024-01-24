import fs from 'fs'
import { writeFile } from 'fs/promises'
import fetch from 'node-fetch'
import {
  TZKT_API,
  TEZID_API,
  BATCH_SIZE,
  TEZOS_NETWORK,
  TZPROFILES_CODEHASH,
  TZPROFILES_GRAPHQL_API,
  TEZID_DATASTORE_CONTRACT
} from './config.js'

if (process.argv.length < 3) {
  console.error('Too few arguments')
}
const cmd = process.argv[2]

;
 
(async () => {
  switch(cmd) {
    case 'collect_profiles':
      const profiles = {}
      const profiles_tz = await collect_tzprofiles()
      const profiles_tezid = await collect_tezid_profiles()
      Object.assign(profiles, profiles_tezid, profiles_tz)
      await writeFile('profiles.json', profiles)
      console.log(`Collected a total of ${Object.keys(profiles).length} profiles and wrote them to profiles.json`)
      break
  }
})()

async function collect_tzprofiles_batch(offset) {
  const tzprofile_contracts_res = await fetch(`${TZKT_API}/v1/contracts?codeHash.eq=${TZPROFILES_CODEHASH}&includeStorage=true&offset=${offset}&limit=${BATCH_SIZE}`)
  const tzprofile_contracts = await tzprofile_contracts_res.json()
  let counter = 0
  const profiles = {}
  for (const contract of tzprofile_contracts.map(c => c.storage)) {
    counter++
    if (contract.contract_type !== 'tzprofiles') continue
    const claims_res = await fetch(`${TZPROFILES_GRAPHQL_API}`, {
      body: JSON.stringify({
        query: `query MyQuery { tzprofiles_by_pk(account: "${contract.owner}") { valid_claims } }`,
        variables: null,
        operationName: 'MyQuery'
      }),
      method: 'POST',
      headers: {
        'Referer': 'https://tzprofiles.com/',
        'Content-Type': 'application/json',
        'Origin': 'https://tzprofiles.com'
      }
    })
    if (!claims_res) continue
    let profile = null
    let claims = await claims_res.json()
    claims = claims?.data?.tzprofiles_by_pk?.valid_claims
    claims.forEach(claim => {
      claim.forEach(details => {
        try {
          const det = JSON.parse(details)
          if (det.type.indexOf('BasicProfile') < 0) return
          profile = {
            nic: det.credentialSubject.alias,
            pic: det.credentialSubject.logo,
            bio: det.credentialSubject.description,
            web: det.credentialSubject.website,
          }
        } catch(e) {}
      })
    })
    if (!profile) continue
    profiles[contract.owner] = profile
  }
  process.stdout.write('.')
  return profiles
}

async function collect_tzprofiles() {
  console.log('== TZProfiles ==')
  const tzprofile_contracts_count_res  = await fetch(`${TZKT_API}/v1/contracts/count?codeHash.eq=${TZPROFILES_CODEHASH}`)
  let total_num_contracts = await tzprofile_contracts_count_res.text()
  if (total_num_contracts > 200) total_num_contracts = 200 // TODO: Remove
  console.log(`Found a total of ${total_num_contracts} tzprofile contracts. Scraping profiles...`)
  let offset = 0
  const profiles = {}
  while (offset < total_num_contracts)  {
    const batch = await collect_tzprofiles_batch(offset)
    Object.assign(profiles, batch)
    offset = offset + BATCH_SIZE
  }
  console.log('')
  return profiles
}

async function collect_tezid_profiles() {
  console.log('== TezID ==')
  const identities_res = await fetch(`${TZKT_API}/v1/contracts/${TEZID_DATASTORE_CONTRACT}/bigmaps/identities/keys?limit=10000`)
  if (!identities_res.ok) throw new Error('Unable to get TEZID identities')
  const identities = await identities_res.json()
  const addresses = identities.map(i => i.key)
  const profiles = {}
  console.log(`Found a total of ${addresses.length} addresses on TEZID. Checking for profiles...`)
  for (const address of addresses) {
    process.stdout.write('.')
    const profile_res = await fetch(`${TEZID_API}/${TEZOS_NETWORK}/profile/${address}`)
    if (!profile_res.ok) continue
    const profile = await profile_res.json()
    if (Object.keys(profile).length === 0) continue
    profiles[address] = {
      nic: profile.name,
      pic: profile.avatar,
      bio: profile.description,
      web: ''
    }
  }
  console.log('')
  return profiles
}
