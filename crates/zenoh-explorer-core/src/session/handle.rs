//! One open session: everything scoped to a single connected network.

use std::collections::HashMap;
use std::sync::Arc;

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use zenoh::Session;
use zenoh::query::{ConsolidationMode, QueryTarget};

use crate::acl::{self, AclFinding, PolicyHolder};
use crate::admin;
use crate::config::ConnectionProfile;
use crate::declarations::{self, DeclarationWatch};
use crate::discovery::{ConnectivityWatch, watch_connectivity};
use crate::error::{Error, Result};
use crate::event::{AppEvent, DiagnosticLevel, EventSink};
use crate::keys::KeyIndex;
use crate::model::{
    DeclarationKind, KeyDeclaration, KeySpaceSnapshot, NodeDeclaration, SampleRecord, SessionId,
    TapId, TransportSummary,
};
use crate::pulse::TopologyPulse;
use crate::search::{self, SearchResults};
use crate::storage::{self, StorageCoverage};
use crate::tap::{SampleSink, Tap, TapSpec, TapStats};
use crate::time::now_ms;
use crate::trace::{self, Trace};

/// What the UI needs to render a session tab.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SessionSummary {
    /// Stable id for this session.
    pub id: SessionId,
    /// The profile it was opened with.
    pub profile: ConnectionProfile,
    /// Zid Zenoh assigned to the explorer's own session.
    pub zid: String,
    /// When the session opened.
    pub opened_at_ms: u64,
    /// Distinct keys the key index holds.
    pub key_count: usize,
    /// Taps currently running.
    pub tap_count: usize,
    /// Directly connected transports.
    pub transport_count: usize,
}

/// One tap as the UI lists it.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct TapSummary {
    /// Which tap.
    pub id: TapId,
    /// What it is watching.
    pub spec: TapSpec,
    /// Its counters.
    pub stats: TapStats,
}

/// A live Zenoh session plus the explorer state derived from it.
pub struct ManagedSession {
    id: SessionId,
    profile: ConnectionProfile,
    zid: String,
    session: Session,
    key_index: Arc<Mutex<KeyIndex>>,
    taps: Mutex<HashMap<TapId, Tap>>,
    sink: Arc<dyn EventSink>,
    opened_at_ms: u64,
    // Held for its lifetime: dropping it undeclares the listener and the
    // session stops reporting transports coming and going.
    _connectivity: ConnectivityWatch,
    // Likewise for declarations: dropping this stops the keyspace tracking
    // subscribers and queryables as they come and go.
    _declarations: DeclarationWatch,
    // Re-probes the topology whenever the two watches above say the network
    // moved. Shared with those callbacks, which poke it.
    pulse: Arc<TopologyPulse>,
}

// `Session` and `Tap` hold trait objects and channels that do not implement
// `Debug`; a hand-written impl keeps the type usable in `#[derive(Debug)]`
// containers without leaking noise.
impl std::fmt::Debug for ManagedSession {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ManagedSession")
            .field("id", &self.id)
            .field("zid", &self.zid)
            .field("profile", &self.profile.name)
            .finish_non_exhaustive()
    }
}

impl ManagedSession {
    /// Opens a Zenoh session for `profile`.
    pub async fn open(profile: ConnectionProfile, sink: Arc<dyn EventSink>) -> Result<Self> {
        profile.validate()?;
        let config = profile.to_zenoh_config()?;

        // A failed open is the one error a person always sees, so it carries a
        // diagnosis rather than the raw transport message.
        let session = zenoh::open(config).await.map_err(|err| {
            Error::Connect(Box::new(crate::diagnose::diagnose_connect_failure(
                &err.to_string(),
            )))
        })?;
        let zid = session.info().zid().await.to_string();
        let id = SessionId::new();

        // The topology snapshot is a query — the admin space answers when
        // asked and never volunteers a change — so something has to decide
        // when to ask. That is this: it probes once now, and again whenever
        // one of the live watches below says the network moved.
        let pulse = Arc::new(TopologyPulse::start(
            session.clone(),
            id.clone(),
            Arc::clone(&sink),
        ));

        let connectivity = watch_transports(&session, &id, &sink, &pulse).await?;

        let key_index = Arc::new(Mutex::new(KeyIndex::new()));
        let declarations = watch_declarations(&session, &id, &sink, &pulse, &key_index).await?;
        read_existing_declarations(&session, &id, &sink, &key_index);

        sink.emit(AppEvent::SessionOpened {
            session_id: id.clone(),
            zid: zid.clone(),
        });

        Ok(Self {
            id,
            profile,
            zid,
            session,
            key_index,
            taps: Mutex::new(HashMap::new()),
            sink,
            opened_at_ms: now_ms(),
            _connectivity: connectivity,
            _declarations: declarations,
            pulse,
        })
    }

    /// Asks for a fresh topology probe.
    ///
    /// Goes through the same coalescing path as an automatic re-probe, so a
    /// held-down refresh cannot put more traffic on the network than the
    /// network moving would.
    pub fn poke_topology(&self) {
        self.pulse.poke();
    }

    /// This session's id.
    #[must_use]
    pub fn id(&self) -> &SessionId {
        &self.id
    }

    /// The underlying Zenoh session, for callers that need it directly.
    #[must_use]
    pub fn zenoh(&self) -> &Session {
        &self.session
    }

    /// A snapshot for the session tab.
    pub async fn summary(&self) -> SessionSummary {
        // Read the locked state into locals first. Inline `.lock()` calls would
        // live until the end of the struct literal — i.e. across the `.await`
        // below — and a `parking_lot` guard is not `Send`, which would make
        // every command calling this fail to compile.
        let key_count = self.key_index.lock().total_keys();
        let tap_count = self.taps.lock().len();
        let transport_count = self.transports().await.len();

        SessionSummary {
            id: self.id.clone(),
            profile: self.profile.clone(),
            zid: self.zid.clone(),
            opened_at_ms: self.opened_at_ms,
            key_count,
            tap_count,
            transport_count,
        }
    }

    /// Directly connected transports, with their links.
    ///
    /// Delegates to [`crate::discovery::local_transports`] — one implementation
    /// of "what am I connected to", used by both this and the topology probe.
    pub async fn transports(&self) -> Vec<TransportSummary> {
        crate::discovery::local_transports(&self.session).await
    }

    /// Rebuilds the topology from every source and emits the result.
    /// Re-reads everything this session can be asked for.
    ///
    /// Nothing in the app needs this in normal use — transports, declarations
    /// and samples all arrive on their own, and the topology re-probes whenever
    /// they say the network moved. It exists for the one case the live signals
    /// cannot cover: something changed on a remote node that it does not
    /// announce, most often `adminspace.enabled` being switched on after the
    /// explorer already connected.
    pub async fn resync(&self) -> Result<()> {
        self.pulse.poke();
        self.refresh_declarations().await?;
        Ok(())
    }

    /// Starts a tap, streaming its batches into `sink`.
    pub async fn start_tap(&self, spec: &TapSpec, sink: Arc<dyn SampleSink>) -> Result<TapId> {
        let tap = Tap::start(&self.session, spec, Arc::clone(&self.key_index), sink).await?;

        let id = tap.id().clone();
        self.taps.lock().insert(id.clone(), tap);
        Ok(id)
    }

    /// Stops a tap, undeclaring its subscriber.
    pub fn stop_tap(&self, tap_id: &TapId) -> Result<()> {
        self.taps
            .lock()
            .remove(tap_id)
            .map(|_| ())
            .ok_or_else(|| Error::UnknownTap(tap_id.clone()))
    }

    /// Every running tap.
    #[must_use]
    pub fn taps(&self) -> Vec<TapSummary> {
        let mut taps: Vec<_> = self
            .taps
            .lock()
            .values()
            .map(|tap| TapSummary {
                id: tap.id().clone(),
                spec: tap.spec().clone(),
                stats: tap.stats(),
            })
            .collect();
        taps.sort_by(|a, b| a.spec.key_expr.cmp(&b.spec.key_expr));
        taps
    }

    /// The path a message would take from `from` to `to`.
    ///
    /// Unlike the other diagnostics here this does ask the network — routing
    /// tables are not in the topology snapshot — but it asks once for the whole
    /// path rather than once per hop.
    pub async fn trace_route(&self, from: &str, to: &str) -> Result<Trace> {
        let successors = admin::route_successors(&self.session, from, to).await?;
        Ok(trace::assemble(from, to, &successors))
    }

    /// Which storages would keep data published on `key_expr`.
    ///
    /// The difference between a key whose value can be read back later and one
    /// that existed only while somebody happened to be listening. Answered from
    /// the last probe, so it asks the network nothing.
    #[must_use]
    pub fn storage_coverage(&self, key_expr: &str) -> Vec<StorageCoverage> {
        storage::coverage(&self.pulse.storages(), key_expr)
    }

    /// What the network's access-control policies would do to `key_expr`.
    ///
    /// Read from the last topology snapshot, so it asks the network nothing —
    /// and it need not, because ACL is fixed at startup and cannot change while
    /// a node is running.
    #[must_use]
    pub fn acl_findings(&self, key_expr: &str, message: &str) -> Vec<AclFinding> {
        let nodes = self.pulse.nodes();
        let holders: Vec<PolicyHolder<'_>> = nodes
            .iter()
            .filter_map(|node| {
                node.acl.as_ref().map(|acl| PolicyHolder {
                    zid: &node.zid,
                    name: node.name.as_deref(),
                    acl,
                })
            })
            .collect();

        acl::findings(&holders, key_expr, message)
    }

    /// Ranks nodes and key expressions against one query.
    ///
    /// Answered entirely from what this session already holds — the last
    /// topology snapshot and the key index — so it touches the network not at
    /// all. That is what lets the palette run it on every keystroke against a
    /// key space with tens of thousands of entries in it.
    #[must_use]
    pub fn search(&self, query: &str, limit: usize) -> SearchResults {
        let nodes = self.pulse.nodes();
        let (node_hits, node_total) = search::search_nodes(&nodes, query, limit);
        let (key_hits, key_total) = self.key_index.lock().search(query, limit);

        SearchResults {
            nodes: node_hits,
            node_total,
            keys: key_hits,
            key_total,
            ..SearchResults::empty()
        }
    }

    /// How many observed keys an expression would match.
    #[must_use]
    pub fn matching_keys(&self, expr: &str) -> usize {
        self.key_index.lock().matching_keys(expr)
    }

    /// Every declaration of one kind at or below `prefix`, and who made it.
    ///
    /// What the counters on a key node are counting. Read straight out of the
    /// local index, so it asks the network nothing.
    #[must_use]
    pub fn declarations_under(&self, prefix: &str, kind: DeclarationKind) -> Vec<KeyDeclaration> {
        self.key_index.lock().declarations_under(prefix, kind)
    }

    /// Expands one level of the key tree.
    #[must_use]
    pub fn expand_keys(&self, prefix: &str) -> KeySpaceSnapshot {
        self.key_index.lock().expand(prefix)
    }

    /// Empties the key index.
    pub fn clear_keys(&self) {
        self.key_index.lock().clear();
    }

    /// Asks the network what it has declared, and folds the answer into the
    /// key index.
    ///
    /// This is what makes the key space useful on a network that is configured
    /// but idle: subscribers and queryables are declared whether or not
    /// anything is publishing, so they describe the shape of the deployment
    /// rather than whatever happened to arrive while the explorer was watching.
    pub async fn refresh_declarations(&self) -> Result<KeySpaceSnapshot> {
        let (declarations, diagnostics) = declarations::probe(&self.session).await;

        for message in diagnostics {
            self.sink.emit(AppEvent::Diagnostic {
                session_id: Some(self.id.clone()),
                level: DiagnosticLevel::Warning,
                message: "Some declarations could not be read".to_owned(),
                hint: Some(message),
            });
        }

        // The lock is taken and released before the snapshot is built, and
        // never held across an await — a `parking_lot` guard is not `Send`.
        {
            let mut index = self.key_index.lock();
            for declaration in &declarations {
                index.declare(&declaration.zid, &declaration.key_expr, declaration.kind);
            }
        }

        Ok(self.key_index.lock().expand(""))
    }

    /// Everything one node has declared, subscribers first.
    ///
    /// Read straight out of the local index — the declarations arrived over the
    /// admin space when the session opened and stream in as they change, so this
    /// asks the network nothing and answers instantly.
    #[must_use]
    pub fn node_declarations(&self, zid: &str) -> Vec<NodeDeclaration> {
        self.key_index.lock().declarations_for(zid)
    }

    /// Runs a `get` and collects the replies as sample rows.
    ///
    /// This backs both the query drawer and the admin-space browser — an admin
    /// key is just a key, so one code path serves both.
    pub async fn query(&self, selector: &str, timeout_ms: u64) -> Result<Vec<SampleRecord>> {
        let replies = self
            .session
            .get(selector)
            .target(QueryTarget::All)
            .consolidation(ConsolidationMode::None)
            .timeout(std::time::Duration::from_millis(
                timeout_ms.clamp(50, 30_000),
            ))
            .await
            .map_err(|err| Error::KeyExpr {
                expr: selector.to_owned(),
                reason: err.to_string(),
            })?;

        let mut out = Vec::new();
        let mut seq = 0;
        while let Ok(reply) = replies.recv_async().await {
            match reply.result() {
                Ok(sample) => {
                    let at = now_ms();
                    self.key_index
                        .lock()
                        .observe(sample.key_expr().as_str(), at);
                    out.push(SampleRecord::from_sample(sample, seq, at));
                    seq += 1;
                }
                Err(err) => {
                    self.sink.emit(AppEvent::Diagnostic {
                        session_id: Some(self.id.clone()),
                        level: DiagnosticLevel::Warning,
                        message: format!("{selector}: replier returned an error"),
                        hint: Some(
                            err.payload()
                                .try_to_string()
                                .unwrap_or_default()
                                .into_owned(),
                        ),
                    });
                }
            }
        }
        Ok(out)
    }

    /// Publishes a payload. The explorer is read-mostly, but being unable to
    /// poke a value is a real gap when debugging a subscriber.
    pub async fn put(&self, key: &str, payload: Vec<u8>, encoding: Option<&str>) -> Result<()> {
        let mut builder = self.session.put(key, payload);
        if let Some(encoding) = encoding {
            builder = builder.encoding(encoding);
        }
        builder.await.map_err(Error::zenoh)
    }

    /// Deletes a key.
    pub async fn delete(&self, key: &str) -> Result<()> {
        self.session.delete(key).await.map_err(Error::zenoh)
    }

    /// Closes the session and stops every tap.
    pub async fn close(self, reason: Option<String>) {
        self.taps.lock().clear();
        if let Err(err) = self.session.close().await {
            tracing::warn!(session = %self.id, error = %err, "session close reported an error");
        }
        self.sink.emit(AppEvent::SessionClosed {
            session_id: self.id.clone(),
            reason,
        });
    }
}

/// Watches transports open and close for one session.
///
/// Transports report themselves, so the graph stays current without polling.
/// `history(true)` replays the ones already up, which is why this can run after
/// `zenoh::open` without missing anything.
async fn watch_transports(
    session: &Session,
    id: &SessionId,
    sink: &Arc<dyn EventSink>,
    pulse: &Arc<TopologyPulse>,
) -> Result<ConnectivityWatch> {
    let sink = Arc::clone(sink);
    let session_id = id.clone();
    let pulse = Arc::clone(pulse);

    watch_connectivity(
        session,
        Arc::new(move |event: crate::discovery::ConnectivityEvent| {
            sink.emit(AppEvent::TransportChanged {
                session_id: session_id.clone(),
                zid: event.zid,
                up: event.up,
            });
            // A transport opening or closing changes the graph, so the snapshot
            // is now stale. The pulse coalesces a burst of these into one probe.
            pulse.poke();
        }),
    )
    .await
}

/// Watches subscribers and queryables being declared and withdrawn.
///
/// The network announces these, so the keyspace stays current without anyone
/// pressing anything.
async fn watch_declarations(
    session: &Session,
    id: &SessionId,
    sink: &Arc<dyn EventSink>,
    pulse: &Arc<TopologyPulse>,
    key_index: &Arc<Mutex<KeyIndex>>,
) -> Result<DeclarationWatch> {
    let sink = Arc::clone(sink);
    let session_id = id.clone();
    let pulse = Arc::clone(pulse);
    let key_index = Arc::clone(key_index);

    declarations::watch(
        session,
        Arc::new(
            move |declaration: declarations::Declaration, change: declarations::Change| {
                // Both directions land, because the index records whose
                // declaration each one is: withdrawing unwinds exactly that
                // node's contribution and leaves any other node's declaration
                // on the same expression alone.
                let (total_keys, count) = {
                    let mut index = key_index.lock();
                    match change {
                        declarations::Change::Declared => {
                            index.declare(
                                &declaration.zid,
                                &declaration.key_expr,
                                declaration.kind,
                            );
                        }
                        declarations::Change::Undeclared => {
                            index.undeclare(
                                &declaration.zid,
                                &declaration.key_expr,
                                declaration.kind,
                            );
                        }
                    }
                    (index.total_keys(), index.declaration_count())
                };

                sink.emit(AppEvent::KeyspaceChanged {
                    session_id: session_id.clone(),
                    total_keys,
                    declarations: count,
                });

                // A node declaring something is usually a node that has just
                // arrived, which the graph should show.
                pulse.poke();
            },
        ),
    )
    .await
}

/// Reads the declarations that already existed when this session opened.
///
/// The watch above only reports what happens from now on. Spawned rather than
/// awaited, so a slow or unreachable admin space never delays the connect.
fn read_existing_declarations(
    session: &Session,
    id: &SessionId,
    sink: &Arc<dyn EventSink>,
    key_index: &Arc<Mutex<KeyIndex>>,
) {
    let session = session.clone();
    let sink = Arc::clone(sink);
    let session_id = id.clone();
    let key_index = Arc::clone(key_index);

    tokio::spawn(async move {
        let (found, _) = declarations::probe(&session).await;
        if found.is_empty() {
            return;
        }

        let (total_keys, count) = {
            let mut index = key_index.lock();
            for declaration in &found {
                index.declare(&declaration.zid, &declaration.key_expr, declaration.kind);
            }
            (index.total_keys(), index.declaration_count())
        };

        sink.emit(AppEvent::KeyspaceChanged {
            session_id,
            total_keys,
            declarations: count,
        });
    });
}
