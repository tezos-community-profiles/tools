import { config, json } from 'tiny-env-config'

export const RPC = config('RPC', '')
export const WALLET = config('WALLET', '', json)
export const TZKT_API = config('TZKT_API', '')
export const PICS_DIR = config('PICS_DIR', 'pics')
export const TEZID_API = config('TEZID_API', '')
export const BATCH_SIZE = config('BATCH_SIZE', '10', parseInt)
export const TCP_CONTRACT = config('TCP_CONTRACT', '')
export const TEZOS_NETWORK = config('TEZOS_NETWORK', '')
export const TZPROFILES_CODEHASH = config('TZPROFILES_CODEHASH', '1485932426')
export const TZPROFILES_GRAPHQL_API = config('TZPROFILES_GRAPHQL_API', 'https://indexer.tzprofiles.com/v1/graphql')
export const TEZID_DATASTORE_CONTRACT = config('TEZID_DATASTORE_CONTRACT', '')
