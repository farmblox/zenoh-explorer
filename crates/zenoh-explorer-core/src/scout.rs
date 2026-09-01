//! Multicast and gossip scouting: finding nodes we are not connected to.
//!
//! Scouting answers a different question from the admin space. The admin space
//! describes nodes we can already reach; scouting finds nodes that are
//! listening but that we have not dialled — which is what makes the "Scouting"
//! view able to show a node the rest of the app cannot see yet.

use std::sync::Arc;
use std::time::Duration;

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use zenoh::config::WhatAmIMatcher;

use crate::error::{Error, Result};
use crate::model::NodeKind;
use crate::time::now_ms;

/// One node that answered a scout.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ScoutedNode {
    /// Zid of the responder.
    pub zid: String,
    /// Its role.
    pub kind: NodeKind,
    /// Locators it advertised.
    pub locators: Vec<String>,
    /// When we heard from it.
    pub seen_at_ms: u64,
}

/// Listens for scout replies for `duration` and returns everything heard once.
///
/// Runs on a throwaway config so scouting never disturbs an open session.
pub async fn scout_once(duration: Duration) -> Result<Vec<ScoutedNode>> {
    let found: Arc<Mutex<Vec<ScoutedNode>>> = Arc::new(Mutex::new(Vec::new()));
    let sink = Arc::clone(&found);

    let what = WhatAmIMatcher::empty().router().peer().client();
    let scout = zenoh::scout(what, zenoh::Config::default())
        .callback(move |hello| {
            sink.lock().push(ScoutedNode {
                zid: hello.zid().to_string(),
                kind: hello.whatami().into(),
                locators: hello.locators().iter().map(ToString::to_string).collect(),
                seen_at_ms: now_ms(),
            });
        })
        .await
        .map_err(Error::zenoh)?;

    tokio::time::sleep(duration).await;
    scout.stop();

    // A node can answer more than once across a scouting window; keep the first
    // sighting of each zid so the list is stable while the view is open.
    let mut nodes = std::mem::take(&mut *found.lock());
    nodes.sort_by(|a, b| a.zid.cmp(&b.zid).then(a.seen_at_ms.cmp(&b.seen_at_ms)));
    nodes.dedup_by(|a, b| a.zid == b.zid);
    Ok(nodes)
}
