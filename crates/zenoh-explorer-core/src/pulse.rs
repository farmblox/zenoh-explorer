//! Re-probing the network when it moves, instead of when someone asks.
//!
//! Zenoh is a live system and the explorer should feel like one. Most of what
//! this app shows arrives without being asked for: transports announce
//! themselves, declarations are published as they are made, samples stream.
//!
//! Two things do not. The admin space is a QUERYABLE, not a publisher — a
//! remote router answers `@/*/*` when asked and never volunteers that its
//! link-state changed. So the topology snapshot is unavoidably a query.
//!
//! What closes the gap is that the things which ARE live tell us when a query
//! is worth running. A transport opening or a declaration appearing means the
//! network moved; that is exactly when the snapshot is stale. This module turns
//! those signals into re-probes.
//!
//! The coalescing is the whole point. A router restarting produces a burst of
//! transport events, and probing once per event would put the explorer's own
//! traffic on the network at the worst possible moment. Instead a burst is
//! collected and answered with ONE probe once it settles.

use std::sync::Arc;
use std::time::Duration;

use parking_lot::Mutex;
use tokio::sync::mpsc;
use tokio::task::JoinHandle;
use zenoh::Session;

use crate::discovery;
use crate::event::{AppEvent, EventSink};
use crate::model::{NodeSummary, SessionId, TopologySnapshot};

/// How long the network has to be quiet before a probe runs.
///
/// Long enough to swallow a router restart's burst, short enough that a single
/// node appearing shows up before you have finished noticing it yourself.
const QUIET_PERIOD: Duration = Duration::from_millis(700);

/// Longest a burst can defer a probe.
///
/// Without this, a network that never goes quiet — a flapping link, a node in a
/// reconnect loop — would defer the probe forever and the view would freeze at
/// exactly the moment it matters most.
const MAX_DEFERRAL: Duration = Duration::from_secs(4);

/// Drives automatic re-probes for one session.
///
/// Held for its lifetime; dropping it stops the task.
#[derive(Debug)]
pub struct TopologyPulse {
    poke: mpsc::Sender<()>,
    task: JoinHandle<()>,
    /// The snapshot most recently broadcast.
    ///
    /// Kept because the admin space is a queryable: without this, answering
    /// "which nodes match what I typed" would mean putting another wildcard
    /// query on the network and waiting out its full timeout. The palette runs
    /// on every keystroke, so it reads what the last probe already learned.
    last: Arc<Mutex<Option<TopologySnapshot>>>,
}

impl Drop for TopologyPulse {
    fn drop(&mut self) {
        self.task.abort();
    }
}

impl TopologyPulse {
    /// Starts the re-probe loop and runs one probe immediately.
    ///
    /// The immediate probe is what fills the view on connect. Everything after
    /// it is driven by [`TopologyPulse::poke`].
    pub fn start(session: Session, session_id: SessionId, sink: Arc<dyn EventSink>) -> Self {
        // A depth of one is enough: the task only needs to know THAT something
        // moved, never how many times. Extra pokes during a probe collapse into
        // the single queued slot, which is the coalescing this exists for.
        let (poke, inbox) = mpsc::channel(1);
        let last = Arc::new(Mutex::new(None));
        let task = tokio::spawn(run(session, session_id, sink, inbox, Arc::clone(&last)));
        Self { poke, task, last }
    }

    /// The nodes the last probe found, or nothing if none has finished yet.
    #[must_use]
    pub fn nodes(&self) -> Vec<NodeSummary> {
        self.last
            .lock()
            .as_ref()
            .map(|snapshot| snapshot.nodes.clone())
            .unwrap_or_default()
    }

    /// Signals that the network moved and a fresh snapshot is worth taking.
    ///
    /// Never blocks and never fails: a full channel already means a probe is
    /// pending, which is exactly the outcome this call wanted.
    pub fn poke(&self) {
        let _ = self.poke.try_send(());
    }
}

/// Probes once, then once per settled burst for as long as the session lives.
async fn run(
    session: Session,
    session_id: SessionId,
    sink: Arc<dyn EventSink>,
    mut inbox: mpsc::Receiver<()>,
    last: Arc<Mutex<Option<TopologySnapshot>>>,
) {
    probe_and_emit(&session, &session_id, sink.as_ref(), &last).await;

    while inbox.recv().await.is_some() {
        // Wait for quiet, but never longer than the ceiling. Each fresh poke
        // restarts the quiet timer; the deadline does not move.
        let deadline = tokio::time::Instant::now() + MAX_DEFERRAL;
        loop {
            let quiet = tokio::time::sleep(QUIET_PERIOD);
            tokio::pin!(quiet);

            tokio::select! {
                () = &mut quiet => break,
                () = tokio::time::sleep_until(deadline) => break,
                poke = inbox.recv() => {
                    if poke.is_none() {
                        return;
                    }
                }
            }
        }

        probe_and_emit(&session, &session_id, sink.as_ref(), &last).await;
    }
}

/// Takes one snapshot and broadcasts it.
async fn probe_and_emit(
    session: &Session,
    session_id: &SessionId,
    sink: &dyn EventSink,
    last: &Mutex<Option<TopologySnapshot>>,
) {
    match discovery::snapshot(session).await {
        Ok((snapshot, diagnostics)) => {
            for message in diagnostics {
                sink.emit(AppEvent::Diagnostic {
                    session_id: Some(session_id.clone()),
                    level: crate::event::DiagnosticLevel::Info,
                    message: "Topology probe reported a gap".to_owned(),
                    hint: Some(message),
                });
            }
            // Recorded before the broadcast so a search cannot observe a
            // snapshot the frontend has already been told about.
            *last.lock() = Some(snapshot.clone());
            sink.emit(AppEvent::TopologyUpdated {
                session_id: session_id.clone(),
                snapshot,
            });
        }
        Err(err) => {
            sink.emit(AppEvent::Diagnostic {
                session_id: Some(session_id.clone()),
                level: crate::event::DiagnosticLevel::Warning,
                message: "Could not read the topology".to_owned(),
                hint: Some(err.to_string()),
            });
        }
    }
}
