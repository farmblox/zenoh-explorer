//! The path a message would actually take between two nodes.
//!
//! A topology graph shows which links exist. It cannot show which one Zenoh
//! would choose, and on any mesh with more than one route those are different
//! questions — "why is this data slow" usually turns out to be "it is not going
//! the way you think".
//!
//! Zenoh answers per router, at
//! `@/<zid>/<whatami>/route/successor/src/<src>/dst/<dst>`, whose payload is the
//! zid that router would forward to next. Only routers answer at all; a peer or
//! client holds no routing table.
//!
//! The whole path costs ONE query. Asking each router in turn would be a
//! round trip per hop, and every wildcard admin query runs to its full timeout,
//! so a five-hop trace would take five timeouts. Instead the wildcard is asked
//! once for the pair, every router on the network answers with its own decision,
//! and the path is chained together locally from the replies.

use ahash::AHashMap;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Highest number of hops worth following.
///
/// A routing table should never produce a path this long; a walk that reaches
/// it has found a loop the visited-set somehow missed, and stopping beats
/// spinning.
const MAX_HOPS: usize = 64;

/// One forwarding decision along a route.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct TraceHop {
    /// The node that made the decision.
    pub zid: String,
    /// Where it would send the message next.
    pub successor: String,
}

/// Why a walk stopped before arriving.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum TraceStop {
    /// Nothing published a next hop from here.
    ///
    /// Normal at the near end when the explorer is a client or peer: it has no
    /// routing table, so it cannot say where it would send anything. It is a
    /// real gap anywhere else — a router with no route to the destination.
    NoSuccessor,
    /// The path came back to a node it had already left.
    Loop,
    /// The walk ran past [`MAX_HOPS`].
    TooLong,
}

/// A traced route, complete or not.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Trace {
    pub from: String,
    pub to: String,
    /// The decisions followed, in order.
    pub hops: Vec<TraceHop>,
    /// Whether the walk reached `to`.
    pub arrived: bool,
    /// Why it stopped, when it did not arrive.
    pub stopped: Option<TraceStop>,
}

/// Chains per-router successors into a path from `from` to `to`.
///
/// `successors` maps the node that published a decision to the node it would
/// forward to. Only routers appear in it, because only routers answer.
#[must_use]
pub fn assemble(from: &str, to: &str, successors: &AHashMap<String, String>) -> Trace {
    let mut hops: Vec<TraceHop> = Vec::new();
    let mut seen: Vec<String> = vec![from.to_owned()];
    let mut current = from.to_owned();

    loop {
        if current == to {
            return Trace {
                from: from.to_owned(),
                to: to.to_owned(),
                hops,
                arrived: true,
                stopped: None,
            };
        }

        let Some(next) = successors.get(&current) else {
            return stopped(from, to, hops, TraceStop::NoSuccessor);
        };

        if seen.iter().any(|visited| visited == next) {
            return stopped(from, to, hops, TraceStop::Loop);
        }
        if hops.len() >= MAX_HOPS {
            return stopped(from, to, hops, TraceStop::TooLong);
        }

        hops.push(TraceHop {
            zid: current.clone(),
            successor: next.clone(),
        });
        seen.push(next.clone());
        current = next.clone();
    }
}

fn stopped(from: &str, to: &str, hops: Vec<TraceHop>, why: TraceStop) -> Trace {
    Trace {
        from: from.to_owned(),
        to: to.to_owned(),
        hops,
        arrived: false,
        stopped: Some(why),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn table(pairs: &[(&str, &str)]) -> AHashMap<String, String> {
        pairs
            .iter()
            .map(|(from, to)| ((*from).to_owned(), (*to).to_owned()))
            .collect()
    }

    #[test]
    fn follows_a_multi_hop_path() {
        let successors = table(&[("a", "b"), ("b", "c"), ("c", "d")]);
        let trace = assemble("a", "d", &successors);

        assert!(trace.arrived);
        assert_eq!(trace.stopped, None);
        assert_eq!(
            trace
                .hops
                .iter()
                .map(|hop| hop.zid.as_str())
                .collect::<Vec<_>>(),
            vec!["a", "b", "c"]
        );
        assert_eq!(trace.hops.last().expect("a last hop").successor, "d");
    }

    #[test]
    fn a_direct_neighbour_is_one_hop() {
        let trace = assemble("a", "b", &table(&[("a", "b")]));
        assert!(trace.arrived);
        assert_eq!(trace.hops.len(), 1);
    }

    #[test]
    fn tracing_a_node_to_itself_arrives_without_hops() {
        let trace = assemble("a", "a", &table(&[]));
        assert!(trace.arrived);
        assert!(trace.hops.is_empty());
    }

    #[test]
    fn stops_where_nothing_published_a_next_hop() {
        // What a client or peer looks like at the near end: no routing table,
        // so no decision to report.
        let trace = assemble("a", "d", &table(&[("b", "c")]));
        assert!(!trace.arrived);
        assert_eq!(trace.stopped, Some(TraceStop::NoSuccessor));
        assert!(trace.hops.is_empty());
    }

    #[test]
    fn stops_partway_when_a_router_has_no_route() {
        let trace = assemble("a", "d", &table(&[("a", "b")]));
        assert!(!trace.arrived);
        assert_eq!(trace.stopped, Some(TraceStop::NoSuccessor));
        assert_eq!(
            trace.hops.len(),
            1,
            "what was learned is still worth showing"
        );
    }

    #[test]
    fn detects_a_routing_loop() {
        let trace = assemble("a", "z", &table(&[("a", "b"), ("b", "c"), ("c", "a")]));
        assert!(!trace.arrived);
        assert_eq!(trace.stopped, Some(TraceStop::Loop));
    }

    #[test]
    fn detects_a_two_node_loop() {
        let trace = assemble("a", "z", &table(&[("a", "b"), ("b", "a")]));
        assert_eq!(trace.stopped, Some(TraceStop::Loop));
    }
}
