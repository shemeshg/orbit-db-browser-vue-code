import * as IPFS from "ipfs";
import OrbitDB from "orbit-db";

class Example {
  ipfs?: IPFS.IPFS
  orbitdb?: OrbitDB;

  async doConnect(){
    // Create IPFS instance
    this.ipfs = await IPFS.create({
      repo: '/orbitdb/examples/browser/new/ipfs/0.33.1',
      start: true,
      preload: { 
        enabled: false
      },
      EXPERIMENTAL: {
        //pubsub: true,
        ipnsPubsub: true
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
}

export const example = new Example()