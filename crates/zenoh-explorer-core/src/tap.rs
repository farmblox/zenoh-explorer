//! Live taps: subscriptions whose samples are coalesced before they reach the UI.
//!
//! A single Zenoh key expression can carry tens of thousands of samples per
//! second. Emitting one IPC message per sample would saturate the webview
//! bridge and make the app feel broken exactly when the user most needs it to
//! work. So a tap:
//!
//! 1. buffers samples in a bounded ring,
//! 2. counts what it had to drop, and
//! 3. flushes a batch on a fixed interval.
//!
//! The UI therefore has a predictable, bounded update rate, and the drop count
//! makes the loss visible rather than silent.
//!
//! Batches leave through a [`SampleSink`] rather than the broadcast
//! [`crate::event::EventSink`]. A tap is a stream with exactly one consumer, so
//! the Tauri layer backs this with an IPC channel: no global fan-out, no
//! routing by tap id on the frontend, and ordering is guaranteed per tap.

use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use tokio::task::JoinHandle;
use ts_rs::TS;
use zenoh::Session;
use zenoh::pubsub::Subscriber;

use crate::error::{Error, Result};
use crate::keys::KeyIndex;
use crate::model::{SampleBatch, SampleRecord, TapId};
use crate::time::now_ms;

/// Where a tap's batches go.
///
/// Kept separate from [`crate::event::EventSink`] because the two have
/// different shapes: this is a per-tap stream, that is a broadcast bus.
pub trait SampleSink: Send + Sync + 'static {
    /// Delivers one batch. Must not block the caller.
    fn send(&self, batch: SampleBatch);
}

impl<F> SampleSink for F
where
    F: Fn(SampleBatch) + Send + Sync + 'static,
{
    fn send(&self, batch: SampleBatch) {
        self(batch);
    }
}

/// Default ring capacity: roughly one second of a very busy key expression.
const DEFAULT_BUFFER: usize = 4_096;

/// Default flush cadence. Fast enough to feel live, slow enough that the
/// renderer keeps up.
const DEFAULT_FLUSH_MS: u64 = 80;

/// What the user asked to watch.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct TapSpec {
    /// Key expression to subscribe to. Wildcards are expected here.
    pub key_expr: String,
    /// Ring capacity in samples. Older samples are dropped when it overflows.
    #[serde(default = "default_buffer")]
    pub buffer: usize,
    /// Milliseconds between batches.
    #[serde(default = "default_flush_ms")]
    pub flush_ms: u64,
}

const fn default_buffer() -> usize {
    DEFAULT_BUFFER
}

const fn default_flush_ms() -> u64 {
    DEFAULT_FLUSH_MS
}

impl TapSpec {
    /// A spec for `key_expr` with the default buffering behaviour.
    pub fn new(key_expr: impl Into<String>) -> Self {
        Self {
            key_expr: key_expr.into(),
            buffer: DEFAULT_BUFFER,
            flush_ms: DEFAULT_FLUSH_MS,
        }
    }

    /// Clamps user-supplied values into a range that cannot wedge the app.
    fn normalised(&self) -> Self {
        Self {
            key_expr: self.key_expr.clone(),
            buffer: self.buffer.clamp(64, 65_536),
            flush_ms: self.flush_ms.clamp(16, 2_000),
        }
    }
}

/// Counters the UI shows in the tap header.
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct TapStats {
    /// Samples received since the tap started.
    pub total: u64,
    /// Samples dropped because the ring was full.
    pub dropped: u64,
}

/// Shared between the subscriber callback and the flush task.
#[derive(Debug)]
struct Shared {
    buffer: Mutex<Vec<SampleRecord>>,
    capacity: usize,
    seq: AtomicU64,
    total: AtomicU64,
    dropped_total: AtomicU64,
    dropped_since_flush: AtomicU64,
}

/// A running subscription.
#[derive(Debug)]
pub struct Tap {
    id: TapId,
    spec: TapSpec,
    shared: Arc<Shared>,
    flush: JoinHandle<()>,
    // Held to keep the subscription alive; dropping it undeclares the subscriber.
    _subscriber: Subscriber<()>,
}

impl Tap {
    /// Declares the subscription and starts the flush loop.
    pub async fn start(
        session: &Session,
        spec: &TapSpec,
        key_index: Arc<Mutex<KeyIndex>>,
        sink: Arc<dyn SampleSink>,
    ) -> Result<Self> {
        let spec = spec.normalised();
        let id = TapId::new();

        let shared = Arc::new(Shared {
            buffer: Mutex::new(Vec::with_capacity(spec.buffer.min(1_024))),
            capacity: spec.buffer,
            seq: AtomicU64::new(0),
            total: AtomicU64::new(0),
            dropped_total: AtomicU64::new(0),
            dropped_since_flush: AtomicU64::new(0),
        });

        let callback_shared = Arc::clone(&shared);
        let subscriber = session
            .declare_subscriber(spec.key_expr.as_str())
            .callback(move |sample| {
                let at = now_ms();
                // The key index is what powers the key-space tree, and it must
                // see every sample even when the UI buffer is overflowing.
                key_index.lock().observe(sample.key_expr().as_str(), at);

                let seq = callback_shared.seq.fetch_add(1, Ordering::Relaxed);
                callback_shared.total.fetch_add(1, Ordering::Relaxed);

                let record = SampleRecord::from_sample(&sample, seq, at);
                let mut buffer = callback_shared.buffer.lock();
                if buffer.len() >= callback_shared.capacity {
                    // Drop the oldest: on a firehose the newest samples are the
                    // ones the user is watching for.
                    buffer.remove(0);
                    callback_shared
                        .dropped_total
                        .fetch_add(1, Ordering::Relaxed);
                    callback_shared
                        .dropped_since_flush
                        .fetch_add(1, Ordering::Relaxed);
                }
                buffer.push(record);
            })
            .await
            .map_err(|err| Error::KeyExpr {
                expr: spec.key_expr.clone(),
                reason: err.to_string(),
            })?;

        let flush = tokio::spawn(flush_loop(
            id.clone(),
            Arc::clone(&shared),
            sink,
            Duration::from_millis(spec.flush_ms),
        ));

        Ok(Self {
            id,
            spec,
            shared,
            flush,
            _subscriber: subscriber,
        })
    }

    /// This tap's identifier.
    #[must_use]
    pub fn id(&self) -> &TapId {
        &self.id
    }

    /// What this tap is watching.
    #[must_use]
    pub fn spec(&self) -> &TapSpec {
        &self.spec
    }

    /// Current counters.
    #[must_use]
    pub fn stats(&self) -> TapStats {
        TapStats {
            total: self.shared.total.load(Ordering::Relaxed),
            dropped: self.shared.dropped_total.load(Ordering::Relaxed),
        }
    }
}

impl Drop for Tap {
    fn drop(&mut self) {
        // Stop flushing before the subscriber goes away, so no batch is emitted
        // for a tap the frontend has already forgotten.
        self.flush.abort();
    }
}

/// Emits one [`SampleBatch`] per interval, skipping empty ticks.
async fn flush_loop(
    tap_id: TapId,
    shared: Arc<Shared>,
    sink: Arc<dyn SampleSink>,
    period: Duration,
) {
    let mut ticker = tokio::time::interval(period);
    ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);

    loop {
        ticker.tick().await;

        let samples = {
            let mut buffer = shared.buffer.lock();
            if buffer.is_empty() {
                continue;
            }
            std::mem::take(&mut *buffer)
        };

        sink.send(SampleBatch {
            tap_id: tap_id.clone(),
            samples,
            dropped: shared.dropped_since_flush.swap(0, Ordering::Relaxed),
            total: shared.total.load(Ordering::Relaxed),
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn specs_are_clamped_into_a_safe_range() {
        let wild = TapSpec {
            key_expr: "a/**".into(),
            buffer: 0,
            flush_ms: 0,
        };
        let safe = wild.normalised();
        assert_eq!(safe.buffer, 64);
        assert_eq!(safe.flush_ms, 16);

        let huge = TapSpec {
            key_expr: "a/**".into(),
            buffer: usize::MAX,
            flush_ms: u64::MAX,
        };
        let safe = huge.normalised();
        assert_eq!(safe.buffer, 65_536);
        assert_eq!(safe.flush_ms, 2_000);
    }

    #[test]
    fn the_default_spec_keeps_the_defaults() {
        let spec = TapSpec::new("fleet/**").normalised();
        assert_eq!(spec.buffer, DEFAULT_BUFFER);
        assert_eq!(spec.flush_ms, DEFAULT_FLUSH_MS);
        assert_eq!(spec.key_expr, "fleet/**");
    }
}
