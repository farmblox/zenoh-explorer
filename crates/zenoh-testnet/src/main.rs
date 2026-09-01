//! A synthetic Zenoh network to develop the explorer against.
//!
//! The explorer is a tool for reading networks, and almost everything it shows
//! only exists BETWEEN nodes: trunks, regions, declarations, half-open links, a
//! partial view. A single router gives you a graph with one box in it, so most
//! of the app cannot be judged against it.
//!
//! This opens a spread of real sessions — peers that mesh with each other,
//! clients that hang off a router — each declaring subscribers and queryables
//! across a shared key tree, and some of them publishing. That produces the
//! four things the explorer reads: transports, link-state, declarations and
//! samples.
//!
//! Usage:
//!
//! ```text
//! cargo run -p zenoh-testnet -- --connect tcp/localhost:7448 --peers 6 --clients 4
//! ```
//!
//! Runs until interrupted. Every session closes on the way out, so the explorer
//! sees the nodes leave as well as arrive.

use std::time::Duration;

use zenoh::config::{Config, WhatAmI};
use zenoh::Wait;
use zenoh::Session;

/// How the swarm is shaped.
struct Options {
    /// Endpoint every node connects to, usually a router in the compose file.
    connect: String,
    peers: usize,
    clients: usize,
    /// Samples per second, per publishing node.
    rate: u32,
}

impl Default for Options {
    fn default() -> Self {
        Self {
            connect: "tcp/localhost:7448".to_owned(),
            peers: 6,
            clients: 4,
            rate: 4,
        }
    }
}

/// Vehicle-ish names, so the graph reads like a deployment rather than node-1..n.
const PEER_NAMES: &[&str] = &[
    "agv-07", "agv-11", "agv-14", "vision-01", "vision-02", "ros2-bridge", "dock-03", "scale-01",
    "picker-08", "conveyor-2",
];

const CLIENT_NAMES: &[&str] = &[
    "logger", "cli-probe", "dashboard", "alert-svc", "metrics-1", "audit-log",
];

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "zenoh_testnet=info,zenoh=warn".into()),
        )
        .init();

    let options = parse_args();
    tracing::info!(
        connect = %options.connect,
        peers = options.peers,
        clients = options.clients,
        rate = options.rate,
        "starting the swarm"
    );

    let mut sessions = Vec::new();

    for index in 0..options.peers {
        let name = PEER_NAMES[index % PEER_NAMES.len()];
        match spawn_node(&options, name, WhatAmI::Peer, index).await {
            Ok(session) => sessions.push(session),
            Err(err) => tracing::error!(%name, error = %err, "peer failed to open"),
        }
    }

    for index in 0..options.clients {
        let name = CLIENT_NAMES[index % CLIENT_NAMES.len()];
        match spawn_node(&options, name, WhatAmI::Client, index).await {
            Ok(session) => sessions.push(session),
            Err(err) => tracing::error!(%name, error = %err, "client failed to open"),
        }
    }

    tracing::info!(
        open = sessions.len(),
        "swarm is up — connect the explorer to {} and press ctrl-c to stop",
        options.connect
    );

    // Closing sessions explicitly rather than letting the process die is the
    // point of waiting here: the explorer should see them go, which is the only
    // way to exercise a node LEAVING.
    let _ = tokio::signal::ctrl_c().await;
    tracing::info!("closing {} sessions", sessions.len());
    for session in sessions {
        let _ = session.close().await;
    }
}

/// Opens one session and gives it something to do.
async fn spawn_node(
    options: &Options,
    name: &str,
    whatami: WhatAmI,
    index: usize,
) -> zenoh::Result<Session> {
    let mut config = Config::default();
    set(&mut config, "mode", &format!("\"{}\"", mode_str(whatami)));
    set(
        &mut config,
        "connect/endpoints",
        &format!("[\"{}\"]", options.connect),
    );
    // The name is what the explorer shows instead of a zid, and the location is
    // what it groups regions by — both come from metadata.
    set(
        &mut config,
        "metadata",
        &format!(
            "{{ name: \"{name}\", location: \"{}\" }}",
            region_for(index, whatami)
        ),
    );

    // Zenoh leaves the admin space OFF by default, and a node that has it off
    // cannot tell the explorer its name, its role or its region — it shows up
    // only as somebody else's session. Most nodes here turn it on so the region
    // grouping has something to group by.
    //
    // Every fifth node deliberately leaves it off. That is the "partial view"
    // case, and it is worth being able to reproduce on demand rather than only
    // meeting it on a customer's network.
    let dark = index % 5 == 4;
    if !dark {
        set(&mut config, "adminspace/enabled", "true");
        set(&mut config, "adminspace/permissions", "{ read: true, write: false }");
    }

    // Peers mesh with each other; clients only ever talk to their router. That
    // difference is most of what the topology view is showing, so it has to be
    // real rather than simulated.
    if whatami == WhatAmI::Peer {
        set(&mut config, "scouting/multicast/enabled", "true");
        set(&mut config, "scouting/gossip/enabled", "true");
    }

    let session = zenoh::open(config).await?;
    let zid = session.info().zid().await;
    tracing::info!(%name, %zid, mode = mode_str(whatami), admin = !dark, "opened");

    declare(&session, name, index).await?;
    if whatami == WhatAmI::Peer {
        publish(&session, name, index, options.rate);
    }

    Ok(session)
}

/// Subscribers and queryables, which is what fills the explorer's keyspace.
///
/// Spread deliberately unevenly: a keyspace where every node declares the same
/// thing tells you nothing about whether the tree, the counts or the "nobody is
/// listening" case actually work.
async fn declare(session: &Session, name: &str, index: usize) -> zenoh::Result<()> {
    session
        .declare_subscriber(format!("fleet/{name}/**"))
        .callback(|_| {})
        .background()
        .await?;
    session
        .declare_queryable(format!("fleet/{name}/status"))
        .callback(|query| {
            let _ = query.reply(query.key_expr().clone(), "\"idle\"").wait();
        })
        .background()
        .await?;

    // A few nodes watch everything, which is what produces the fan-in a real
    // deployment has — and gives some keys a listener count above one.
    if index % 3 == 0 {
        session
            .declare_subscriber("fleet/*/telemetry/**")
            .callback(|_| {})
            .background()
            .await?;
    }
    if index % 4 == 0 {
        session
            .declare_subscriber("vision/**")
            .callback(|_| {})
            .background()
            .await?;
        session
            .declare_queryable("fleet/config/**")
            .callback(|query| {
                let _ = query.reply(query.key_expr().clone(), "{}").wait();
            })
            .background()
            .await?;
    }

    Ok(())
}

/// Publishes telemetry forever, so the tap and the sample counts have traffic.
fn publish(session: &Session, name: &str, index: usize, rate: u32) {
    let session = session.clone();
    let name = name.to_owned();
    let period = Duration::from_millis(1_000 / u64::from(rate.clamp(1, 200)));

    tokio::spawn(async move {
        let mut tick = tokio::time::interval(period);
        let mut seq: u64 = 0;

        loop {
            tick.tick().await;
            seq += 1;

            // Several keys per node, so the tree has depth and a tap on a
            // wildcard sees more than one thing.
            let pose = serde_json::json!({
                "seq": seq,
                "x": (seq as f64 / 10.0).sin() * 12.0,
                "y": (seq as f64 / 10.0).cos() * 12.0,
            });
            let _ = session
                .put(format!("fleet/{name}/telemetry/pose"), pose.to_string())
                .encoding(zenoh::bytes::Encoding::APPLICATION_JSON)
                .await;

            if seq % 10 == 0 {
                let battery = serde_json::json!({ "percent": 100 - (seq / 10) % 100 });
                let _ = session
                    .put(format!("fleet/{name}/telemetry/battery"), battery.to_string())
                    .encoding(zenoh::bytes::Encoding::APPLICATION_JSON)
                    .await;
            }

            // Only some nodes touch the vision tree, so it stays visibly
            // quieter than the fleet one.
            if index % 4 == 0 && seq % 5 == 0 {
                let _ = session
                    .put(
                        format!("vision/{name}/frames/meta"),
                        serde_json::json!({ "fps": 30 }).to_string(),
                    )
                    .await;
            }
        }
    });
}

/// Spreads nodes across a few regions, so the region view has more than one box.
fn region_for(index: usize, whatami: WhatAmI) -> &'static str {
    if whatami == WhatAmI::Client {
        return "edge-clients";
    }
    match index % 3 {
        0 => "edge-fleet",
        1 => "plant-b",
        _ => "lab",
    }
}

const fn mode_str(whatami: WhatAmI) -> &'static str {
    match whatami {
        WhatAmI::Router => "router",
        WhatAmI::Peer => "peer",
        WhatAmI::Client => "client",
    }
}

/// Sets one config key, logging rather than failing: a rejected key here should
/// not take the whole swarm down.
fn set(config: &mut Config, key: &str, value: &str) {
    if let Err(err) = config.insert_json5(key, value) {
        tracing::warn!(key, value, error = %err, "config key rejected");
    }
}

/// A deliberately small argument parser, to keep this crate dependency-free
/// beyond what the workspace already builds.
fn parse_args() -> Options {
    let mut options = Options::default();
    let mut args = std::env::args().skip(1);

    while let Some(flag) = args.next() {
        let mut value = || args.next().unwrap_or_default();
        match flag.as_str() {
            "--connect" => options.connect = value(),
            "--peers" => options.peers = value().parse().unwrap_or(options.peers),
            "--clients" => options.clients = value().parse().unwrap_or(options.clients),
            "--rate" => options.rate = value().parse().unwrap_or(options.rate),
            "--help" | "-h" => {
                println!(
                    "zenoh-testnet [--connect <endpoint>] [--peers N] [--clients N] [--rate HZ]"
                );
                std::process::exit(0);
            }
            other => tracing::warn!(flag = other, "unknown argument, ignored"),
        }
    }

    options
}
