import * as IPFS from "ipfs";
import OrbitDB from "orbit-db";
import Store from "orbit-db-store"

class IpfsRepo {
  ipfs?: IPFS.IPFS
  orbitdb?: OrbitDB;

  async doConnect() {
    // Create IPFS instance
    this.ipfs = await IPFS.create({
      repo: '/orbitdb/examples/browser/new/ipfs/0.33.1',
      start: true,
      preload: {
        enabled: false
      },
      EXPERIMENTAL: {
        pubsub: true,
      },
      config: {
        Addresses: {
          Swarm: [
            // Use IPFS dev signal server
            // '/dns4/star-signal.cloud.ipfs.team/wss/p2p-webrtc-star',
            // '/dns4/ws-star.discovery.libp2p.io/tcp/443/wss/p2p-websocket-star',
            // Use IPFS dev webrtc signal server
            '/dns4/wrtc-star1.par.dwebops.pub/tcp/443/wss/p2p-webrtc-star/',
            '/dns4/wrtc-star2.sjc.dwebops.pub/tcp/443/wss/p2p-webrtc-star/',
            '/dns4/webrtc-star.discovery.libp2p.io/tcp/443/wss/p2p-webrtc-star/',
            // Use local signal server
            // '/ip4/0.0.0.0/tcp/9090/wss/p2p-webrtc-star',
          ]
        },
      }
    })
    this.orbitdb = await OrbitDB.createInstance(this.ipfs)

  }

  async getCreateDatabase(name: string, type: TStoreType, publicAccess: boolean,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    statusFnc = (s: unknown) => { return; }) {

    const dbStore = new DbStore(this, statusFnc)
    await dbStore.createStore(name, type, publicAccess)
    return dbStore
  }

  async getOpenDatabase(address: string,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        statusFnc = (s: unknown) => { return; }) {
    const dbStore = new DbStore(this, statusFnc)          
    await dbStore.openStore(address)
    return dbStore    
  }
}

export class DbStore {
  orbitdb: OrbitDB;
  store?: Store
  statusFnc: (s: { queryData: unknown, status: string, newData: boolean  }) => void
  ipfs: IPFS.IPFS

  // eslint-disable-next-line @typescript-eslint/no-unused-vars 
  constructor(example: IpfsRepo, statusFnc = (s: { queryData: unknown, status: string, newData: boolean  }) => { return; }) {
    if (!example.orbitdb || !example.ipfs) { throw new Error("No this.orbitdb instance") }
    this.orbitdb = example.orbitdb
    this.ipfs = example.ipfs
    this.statusFnc = statusFnc
  }

  async openStore(address: string): Promise<void>{
    const params = {
      sync: true 
    } as IOpenOptions
    this.store = await this.orbitdb.open(address, params)
  }

  async createStore(name: string, type: TStoreType, publicAccess: boolean): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orbitIdentityId = (this.orbitdb as any).identity.id
    const params = {
      // If database doesn't exist, create it
      create: true,
      overwrite: true,
      // Load only the local version of the database, 
      // don't load the latest from the network yet
      localOnly: false,
      type: type,
      // If "Public" flag is set, allow anyone to write to the database,
      // otherwise only the creator of the database can write      
      accessController: {
        write: publicAccess ? ['*'] : [orbitIdentityId],
      }
    }
    this.store = await this.orbitdb.open(name, params)
  }

  get storeType(): string | undefined {
    return this.store?.type
  }

  get storeAddress(): string | undefined {
    return this.store?.address.toString();
  }

  private queryTest() {
    if (!this.store) { throw new Error("No this.store instance") }
    if (this.store.type === 'eventlog')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (this.store as any).iterator({ limit: 5 }).collect()
    else if (this.store.type === 'feed')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (this.store as any).iterator({ limit: 5 }).collect()
    else if (this.store.type === 'docstore')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (this.store as any).get('peer1')
    else if (this.store.type === 'keyvalue')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (this.store as any).get('mykey')
    else if (this.store.type === 'counter')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (this.store as any).value
    else
      throw new Error(`Unknown datatbase type:  ${this.store.type}`)

  }

  private async queryAndRender() {
    if (!this.store) { throw new Error("No this.store instance") }
    const networkPeers = await this.ipfs.swarm.peers()
    const databasePeers = await this.ipfs.pubsub.peers(this.store.address.toString())

    const result = this.queryTest()
    const statusToReport = {
      storeType: this.storeType, storeAddress: this.storeAddress, orbitid: this.orbitdb.id,
      databasePerNetwork: databasePeers.length / networkPeers.length,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      oplogUpper: Math.max((this.store as any)._replicationStatus.progress, (this.store as any)._oplog.length),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      oplogLower: (this.store as any)._replicationStatus.max,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result: result.slice().reverse().map((e: any) => e.payload.value)
    }

    this.statusFnc({ queryData: statusToReport, status: "", newData: true  });
  }

  async loadStore(): Promise<void> {
    if (!this.store) { throw new Error("No this.store instance") }
    // When the database is ready (ie. loaded), display results
    this.store.events.on('ready', () => this.queryAndRender())
    // When database gets replicated with a peer, display results
    this.store.events.on('replicated', () => this.queryAndRender())
    // When we update the database, display result
    this.store.events.on('write', () => this.queryAndRender())

    this.store.events.on('replicate.progress', () => this.queryAndRender())

    // Hook up to the load progress event and render the progress
    let maxTotal = 0
    this.store.events.on('load.progress', (address, hash, entry, progress, total) => {
      maxTotal = Math.max.apply(null, [maxTotal, progress, 0])
      total = Math.max.apply(null, [progress, maxTotal, total, entry.clock.time, 0])
      this.statusFnc({ queryData: {}, status: `Loading database... ${maxTotal} / ${total}`, newData: false });
    })

    this.store.events.on('ready', () => {
      // Set the status text
      setTimeout(() => {
        this.statusFnc({ queryData: {}, status:'Database is ready', newData: false });
      }, 1000)
    })

    // Load locally persisted database
    await this.store.load()
  }

  

  async resetStore(): Promise<void> {
    await this.store?.close()
  }
}




export const ipfsRepo = new IpfsRepo()
