import fs from 'fs'
import fetch from 'node-fetch'
//import { importKey } from '@taquito/signer'
//import { char2Bytes } from '@taquito/utils'
//import { TezosToolkit, MichelsonMap } from '@taquito/taquito'
import {
  TZKT_API,
  TEZID_API,
  TEZOS_NETWORK,
  TZPROFILES_CODEHASH,
  TZPROFILES_GRAPHQL_API,
  TEZID_DATASTORE_CONTRACT
} from './config.js'

//const toolkit = new TezosToolkit(RPC)
//importKey(toolkit,
//  WALLET.privkey
//).catch((e) => console.error(e));

if (process.argv.length < 3) {
  console.error('Too few arguments')
}
const cmd = process.argv[2]

;
 
(async () => {
  switch(cmd) {
    case 'collect_profiles':
      await collect_tzprofiles()
//      await collect_tezid_profiles()
      break
  }
})()

async function collect_tzprofiles() {
  // TODO: Need to batch fetch these...
  const tzprofile_contracts_res = await fetch(`${TZKT_API}/v1/contracts?codeHash.eq=${TZPROFILES_CODEHASH}&includeStorage=true&limit=10`)
  const tzprofile_contracts = await tzprofile_contracts_res.json()
  console.log(`Found ${tzprofile_contracts.length} contracts that appear to be tzprofiles. Processing...`)
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
    console.log(`Found profile for ${contract.owner}. Counter: ${counter}`)
    profiles[contract.owner] = profile
  }
  console.log(profiles)
  return profiles
}

async function collect_tezid_profiles() {
  const identities_res = await fetch(`${TZKT_API}/v1/contracts/${TEZID_DATASTORE_CONTRACT}/bigmaps/identities/keys?limit=10000`)
  if (!identities_res.ok) throw new Error('Unable to get TEZID identities')
  const identities = await identities_res.json()
  const addresses = identities.map(i => i.key)
  const profiles = {}
  console.log(`Found a total of ${addresses.length} addresses on TEZID. Checking for profiles...`)
  let counter = 0
  for (const address of addresses) {
    counter++
    const profile_res = await fetch(`${TEZID_API}/${TEZOS_NETWORK}/profile/${address}`)
    if (!profile_res.ok) continue
    const profile = await profile_res.json()
    if (Object.keys(profile).length === 0) continue
    console.log(`Found profile for ${address}. Counter: ${counter}`)
    profiles[address] = {
      nic: profile.name,
      pic: profile.avatar,
      bio: profile.description
    }
  }
  console.log(profiles)
  return profiles
} 
