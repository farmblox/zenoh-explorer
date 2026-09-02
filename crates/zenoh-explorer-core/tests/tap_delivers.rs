//! A tap delivers what the network publishes.
//!
//! The only test in this crate that opens real Zenoh sessions. Everything else
//! is a pure function over a reply, a config or a key, and unit-testing those
//! is enough. The tap is different: its whole job is to move samples between
//! two live sessions, and proving that its spec clamps correctly proves nothing
//! about whether a sample ever arrives.
//!
//! Two peers on loopback with scouting switched off, so the link is explicit
//! and the test cannot accidentally pick up a router already running on the
//! machine — including the dev testnet, which sits on 7448-7450.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use zenoh_explorer_core::keys::KeyIndex;
use zenoh_explorer_core::model::SampleBatch;
use zenoh_explorer_core::tap::{Tap, TapSpec};

/// Ports chosen to miss both the default 7447 and the testnet's 7448-7450.
///
/// One per test, because cargo runs them on separate threads of the same
/// process and two listeners on one port is `EADDRINUSE`, not a queue.
const DELIVERY_PORT: u16 = 7492;
const FILTER_PORT: u16 = 7493;
const DETAIL_PORT: u16 = 7494;

/// Long enough to absorb a slow link on a loaded CI box; the assertions poll,
/// so a healthy run finishes in well under this.
const PATIENCE: Duration = Duration::from_secs(10);

fn config(port: u16, listen: bool) -> zenoh::Config {
    let mut config = zenoh::Config::default();
    config.insert_json5("mode", "\"peer\"").expect("mode");
    config
        .insert_json5("scouting/multicast/enabled", "false")
        .expect("multicast off");
    config
        .insert_json5("scouting/gossip/enabled", "false")
        .expect("gossip off");

    let key = if listen {
        "listen/endpoints"
    } else {
        "connect/endpoints"
    };
    config
        .insert_json5(key, &format!("[\"tcp/127.0.0.1:{port}\"]"))
        .expect("endpoint");

    config
}

/// Collects every batch the tap emits.
#[derive(Clone, Default)]
struct Collected(Arc<Mutex<Vec<SampleBatch>>>);

impl Collected {
    /// Every record seen so far, across every batch.
    fn records(&self) -> Vec<zenoh_explorer_core::model::SampleRecord> {
        self.0
            .lock()
            .expect("collector poisoned")
            .iter()
            .flat_map(|batch| batch.samples.clone())
            .collect()
    }

    /// Every key seen so far, across every batch.
    fn keys(&self) -> Vec<String> {
        self.0
            .lock()
            .expect("collector poisoned")
            .iter()
            .flat_map(|batch| batch.samples.iter().map(|sample| sample.key_expr.clone()))
            .collect()
    }
}

/// Polls until `check` passes or patience runs out.
async fn eventually(label: &str, mut check: impl FnMut() -> bool) {
    let deadline = tokio::time::Instant::now() + PATIENCE;
    while tokio::time::Instant::now() < deadline {
        if check() {
            return;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    panic!("timed out waiting for {label}");
}

#[tokio::test(flavor = "multi_thread")]
async fn a_tap_receives_what_is_published() {
    let publisher = zenoh::open(config(DELIVERY_PORT, true))
        .await
        .expect("publisher session");
    let explorer = zenoh::open(config(DELIVERY_PORT, false))
        .await
        .expect("explorer session");

    let collected = Collected::default();
    let sink = collected.clone();
    let index = Arc::new(parking_lot::Mutex::new(KeyIndex::new()));

    let tap = Tap::start(
        &explorer,
        &TapSpec::new("explorer/test/**"),
        Arc::clone(&index),
        Arc::new(move |batch: SampleBatch| sink.0.lock().expect("collector poisoned").push(batch)),
    )
    .await
    .expect("tap starts");

    // The subscriber has to reach the far side before a publication can match
    // it, and neither session announces when routing has settled. Publishing
    // on a loop until something lands is what makes this deterministic rather
    // than a race against a fixed sleep.
    let publisher_handle = tokio::spawn(async move {
        for sequence in 0..200u32 {
            publisher
                .put("explorer/test/battery", format!("{sequence}"))
                .await
                .expect("put");
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
    });

    eventually("the tap to deliver a sample", || {
        collected
            .keys()
            .iter()
            .any(|key| key == "explorer/test/battery")
    })
    .await;

    // The tap folds what it sees into the key index, which is what makes the
    // keyspace tree fill in as traffic arrives rather than only on connect.
    eventually("the key index to record the key", || {
        index.lock().total_keys() > 0
    })
    .await;

    publisher_handle.abort();
    drop(tap);
}

#[tokio::test(flavor = "multi_thread")]
async fn a_tap_ignores_keys_outside_its_expression() {
    let publisher = zenoh::open(config(FILTER_PORT, true))
        .await
        .expect("publisher session");
    let explorer = zenoh::open(config(FILTER_PORT, false))
        .await
        .expect("explorer session");

    let collected = Collected::default();
    let sink = collected.clone();

    let tap = Tap::start(
        &explorer,
        &TapSpec::new("explorer/wanted/**"),
        Arc::new(parking_lot::Mutex::new(KeyIndex::new())),
        Arc::new(move |batch: SampleBatch| sink.0.lock().expect("collector poisoned").push(batch)),
    )
    .await
    .expect("tap starts");

    let publisher_handle = tokio::spawn(async move {
        for _ in 0..200u32 {
            publisher
                .put("explorer/wanted/one", "yes")
                .await
                .expect("put");
            publisher
                .put("explorer/ignored/two", "no")
                .await
                .expect("put");
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
    });

    eventually("the wanted key to arrive", || {
        collected
            .keys()
            .iter()
            .any(|key| key == "explorer/wanted/one")
    })
    .await;

    assert!(
        !collected.keys().iter().any(|key| key.contains("ignored")),
        "a tap must not receive keys its expression does not match, got {:?}",
        collected.keys()
    );

    publisher_handle.abort();
    drop(tap);
}

#[tokio::test(flavor = "multi_thread")]
async fn a_sample_carries_its_timestamp_attachment_and_priority() {
    // Timestamping is off by default, so a sample only gets a stamp if the
    // config asks for one — which is itself worth pinning: without it the
    // drift diagnostic has nothing to read.
    let mut publisher_config = config(DETAIL_PORT, true);
    publisher_config
        .insert_json5(
            "timestamping",
            r#"{"enabled":true,"drop_future_timestamp":false}"#,
        )
        .expect("timestamping");

    let publisher = zenoh::open(publisher_config)
        .await
        .expect("publisher session");
    let explorer = zenoh::open(config(DETAIL_PORT, false))
        .await
        .expect("explorer session");

    let collected = Collected::default();
    let sink = collected.clone();

    let tap = Tap::start(
        &explorer,
        &TapSpec::new("explorer/detail/**"),
        Arc::new(parking_lot::Mutex::new(KeyIndex::new())),
        Arc::new(move |batch: SampleBatch| sink.0.lock().expect("collector poisoned").push(batch)),
    )
    .await
    .expect("tap starts");

    let publisher_handle = tokio::spawn(async move {
        for _ in 0..200u32 {
            publisher
                .put("explorer/detail/one", "body")
                .attachment("meta")
                .await
                .expect("put");
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
    });

    eventually("a sample to arrive", || !collected.records().is_empty()).await;

    let records = collected.records();
    let record = records.first().expect("a record");

    assert_eq!(record.attachment_preview.as_deref(), Some("meta"));
    assert_eq!(record.attachment_len, Some(4));
    assert!(
        !record.priority.is_empty(),
        "every sample has a priority class, even the default one"
    );
    assert_eq!(record.preview, "body");

    // The stamp and the drift travel together; a stamped sample published on
    // this machine cannot be a hundred milliseconds away from this machine.
    if record.timestamp_ms.is_some() {
        assert!(
            record.timestamp_zid.is_some(),
            "a stamp names the clock that made it"
        );
        let drift = record.drift_ms.expect("a stamped sample has a drift");
        assert!(
            drift.abs() < 100,
            "local drift should be tiny, got {drift}ms"
        );
    }

    publisher_handle.abort();
    drop(tap);
}
