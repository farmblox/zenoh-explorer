//! Peer discovery comes from a router's status record.
//!
//! The peer deliberately keeps its own admin space off. The explorer must
//! still find it in the router's `@/<zid>/router` session table; querying every
//! node's admin root would make this pass for the wrong reason.

use std::time::Duration;

use zenoh_explorer_core::admin;
use zenoh_explorer_core::discovery::DiscoverySource;
use zenoh_explorer_core::model::NodeKind;
use zenoh_explorer_core::trace;

/// Separate from the tap tests' 7492–7495 range.
const SINGLE_ROUTER_PORT: u16 = 7496;
const MESH_ROUTER_A_PORT: u16 = 7497;
const MESH_ROUTER_B_PORT: u16 = 7498;
const PATIENCE: Duration = Duration::from_secs(10);

fn config(mode: &str) -> zenoh::Config {
    let mut config = zenoh::Config::default();
    config
        .insert_json5("mode", &format!("\"{mode}\""))
        .expect("mode");
    config
        .insert_json5("scouting/multicast/enabled", "false")
        .expect("multicast off");
    config
        .insert_json5("scouting/gossip/enabled", "false")
        .expect("gossip off");
    // These tests exercise routed discovery, not payload transport. Disabling
    // SHM also lets both isolated test networks start concurrently on macOS,
    // where the sandbox may reject POSIX segment creation.
    config
        .insert_json5("transport/shared_memory/enabled", "false")
        .expect("shared memory off");
    config
}

fn router_config(listen_port: u16, connect_port: Option<u16>) -> zenoh::Config {
    let mut config = config("router");
    config
        .insert_json5(
            "listen/endpoints",
            &format!("[\"tcp/127.0.0.1:{listen_port}\"]"),
        )
        .expect("router endpoint");
    if let Some(connect_port) = connect_port {
        config
            .insert_json5(
                "connect/endpoints",
                &format!("[\"tcp/127.0.0.1:{connect_port}\"]"),
            )
            .expect("upstream router connection");
    }
    config
        .insert_json5("adminspace/enabled", "true")
        .expect("router admin space");
    config
        .insert_json5("adminspace/permissions/read", "true")
        .expect("router admin read");
    config
}

fn attached_config(mode: &str, router_port: u16) -> zenoh::Config {
    let mut config = config(mode);
    config
        .insert_json5(
            "connect/endpoints",
            &format!("[\"tcp/127.0.0.1:{router_port}\"]"),
        )
        .expect("router connection");
    config
        .insert_json5("adminspace/enabled", "false")
        .expect("admin space off");
    config
}

#[tokio::test(flavor = "multi_thread")]
async fn router_status_discovers_a_peer_whose_admin_space_is_off() {
    let router = zenoh::open(router_config(SINGLE_ROUTER_PORT, None))
        .await
        .expect("router opens");
    let peer = zenoh::open(attached_config("peer", SINGLE_ROUTER_PORT))
        .await
        .expect("peer opens");
    let explorer = zenoh::open(attached_config("client", SINGLE_ROUTER_PORT))
        .await
        .expect("explorer opens");

    let router_zid = router.info().zid().await.to_string();
    let peer_zid = peer.info().zid().await.to_string();

    let probe = tokio::time::timeout(PATIENCE, async {
        loop {
            let probe = admin::probe(&explorer).await.expect("admin probe");
            if probe.snapshot.nodes.iter().any(|node| node.zid == peer_zid) {
                break probe;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
    })
    .await
    .expect("router session table to include the peer");

    assert_eq!(probe.snapshot.admin_responses, 1);

    let router_node = probe
        .snapshot
        .nodes
        .iter()
        .find(|node| node.zid == router_zid)
        .expect("router is present");
    assert_eq!(router_node.kind, NodeKind::Router);
    assert_eq!(router_node.source, DiscoverySource::AdminSpace);

    let peer_node = probe
        .snapshot
        .nodes
        .iter()
        .find(|node| node.zid == peer_zid)
        .expect("peer is present");
    assert_eq!(peer_node.kind, NodeKind::Peer);

    assert!(probe.snapshot.links.iter().any(|link| {
        (link.from == router_zid && link.to == peer_zid)
            || (link.from == peer_zid && link.to == router_zid)
    }));
}

#[tokio::test(flavor = "multi_thread")]
async fn router_query_fans_out_to_find_a_peer_on_another_router() {
    let router_a = zenoh::open(router_config(MESH_ROUTER_A_PORT, None))
        .await
        .expect("router A opens");
    let router_b = zenoh::open(router_config(MESH_ROUTER_B_PORT, Some(MESH_ROUTER_A_PORT)))
        .await
        .expect("router B opens");
    let peer = zenoh::open(attached_config("peer", MESH_ROUTER_B_PORT))
        .await
        .expect("peer opens");
    let explorer = zenoh::open(attached_config("client", MESH_ROUTER_A_PORT))
        .await
        .expect("explorer opens");

    let entry_router_zid = router_a.info().zid().await.to_string();
    let remote_router_zid = router_b.info().zid().await.to_string();
    let peer_zid = peer.info().zid().await.to_string();

    let probe = tokio::time::timeout(PATIENCE, async {
        loop {
            let probe = admin::probe(&explorer).await.expect("admin probe");
            let sees_both_routers = probe.snapshot.admin_responses == 2;
            let sees_remote_peer = probe.snapshot.nodes.iter().any(|node| node.zid == peer_zid);
            let sees_backbone = probe.snapshot.links.iter().any(|link| {
                link.in_routing_map
                    && ((link.from == entry_router_zid && link.to == remote_router_zid)
                        || (link.from == remote_router_zid && link.to == entry_router_zid))
            });
            if sees_both_routers && sees_remote_peer && sees_backbone {
                break probe;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
    })
    .await
    .expect("query to fan out through router A to router B");

    for router_zid in [&entry_router_zid, &remote_router_zid] {
        let node = probe
            .snapshot
            .nodes
            .iter()
            .find(|node| &node.zid == router_zid)
            .expect("router is present");
        assert_eq!(node.kind, NodeKind::Router);
        assert_eq!(node.source, DiscoverySource::AdminSpace);
    }

    let peer_node = probe
        .snapshot
        .nodes
        .iter()
        .find(|node| node.zid == peer_zid)
        .expect("peer behind router B is present");
    assert_eq!(peer_node.kind, NodeKind::Peer);

    assert!(probe.snapshot.links.iter().any(|link| {
        (link.from == remote_router_zid && link.to == peer_zid)
            || (link.from == peer_zid && link.to == remote_router_zid)
    }));

    let backbone = probe
        .snapshot
        .links
        .iter()
        .find(|link| {
            (link.from == entry_router_zid && link.to == remote_router_zid)
                || (link.from == remote_router_zid && link.to == entry_router_zid)
        })
        .expect("router backbone link is present");
    assert!(
        backbone.in_routing_map,
        "router backbone must come from link-state, not only a session table"
    );
    assert!(
        backbone.routing_cost.is_some(),
        "link-state exposes its cost"
    );

    let successors = admin::route_successors(&explorer, &remote_router_zid, &entry_router_zid)
        .await
        .expect("route successors");
    let route = trace::assemble(&remote_router_zid, &entry_router_zid, &successors);
    assert!(route.arrived, "router route should reach the entry router");
    assert_eq!(
        route.hops.first().map(|hop| hop.zid.as_str()),
        Some(remote_router_zid.as_str())
    );
}
