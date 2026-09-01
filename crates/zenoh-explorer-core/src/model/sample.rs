//! Records for the live tap: one row per sample the explorer observes.

use serde::{Deserialize, Serialize};
use ts_rs::TS;
use zenoh::sample::{Sample, SampleKind};

use super::ids::TapId;

/// Longest payload preview we send to the UI. Anything past this is elided —
/// the full bytes stay in the backend until the user asks to inspect one row.
const PREVIEW_LIMIT: usize = 512;

/// Put or Delete, mirrored for the wire.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum SampleKindDto {
    /// Data was written.
    Put,
    /// The key was removed.
    Delete,
}

impl From<SampleKind> for SampleKindDto {
    fn from(value: SampleKind) -> Self {
        match value {
            SampleKind::Put => Self::Put,
            SampleKind::Delete => Self::Delete,
        }
    }
}

/// One observed sample, flattened for a virtualised table.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SampleRecord {
    /// Monotonic counter within a tap. The UI keys rows on this.
    pub seq: u64,
    /// Receive time in milliseconds since the Unix epoch.
    pub received_at_ms: u64,
    /// Publisher-assigned timestamp, when the sample carries one.
    pub source_timestamp: Option<String>,
    /// The concrete key the sample was published on.
    pub key_expr: String,
    /// Put or Delete.
    pub kind: SampleKindDto,
    /// Encoding string as advertised by the publisher.
    pub encoding: String,
    /// Payload size in bytes, before any truncation.
    pub payload_len: usize,
    /// Human-readable payload preview, truncated to a fixed budget.
    pub preview: String,
    /// `true` when the preview is not valid UTF-8 and is therefore hex.
    pub preview_is_hex: bool,
    /// `true` when the payload was longer than the preview budget.
    pub truncated: bool,
    /// Zid of the publisher, when source info is present.
    pub source_zid: Option<String>,
    /// Whether the publisher marked the sample express.
    pub express: bool,
}

impl SampleRecord {
    /// Converts a Zenoh sample into a UI row.
    ///
    /// `seq` and `received_at_ms` come from the tap so that ordering stays
    /// consistent even when samples arrive out of order.
    pub fn from_sample(sample: &Sample, seq: u64, received_at_ms: u64) -> Self {
        let payload = sample.payload();
        let bytes = payload.to_bytes();
        let (preview, preview_is_hex, truncated) = render_preview(&bytes);

        Self {
            seq,
            received_at_ms,
            source_timestamp: sample.timestamp().map(ToString::to_string),
            key_expr: sample.key_expr().as_str().to_owned(),
            kind: sample.kind().into(),
            encoding: sample.encoding().to_string(),
            payload_len: payload.len(),
            preview,
            preview_is_hex,
            truncated,
            source_zid: sample
                .source_info()
                .map(|info| info.source_id().zid().to_string()),
            express: sample.express(),
        }
    }
}

/// Renders a payload as text when it is valid UTF-8, hex otherwise.
///
/// Returns `(preview, is_hex, truncated)`.
fn render_preview(bytes: &[u8]) -> (String, bool, bool) {
    let head = &bytes[..bytes.len().min(PREVIEW_LIMIT)];
    let truncated = bytes.len() > head.len();

    match std::str::from_utf8(head) {
        // A clean UTF-8 prefix: show it, collapsing control characters so one
        // stray newline cannot break the table layout.
        Ok(text) => {
            let cleaned = text
                .chars()
                .map(|c| if c.is_control() { ' ' } else { c })
                .collect();
            (cleaned, false, truncated)
        }
        // Truncating mid-codepoint is not a decoding failure; retry on the
        // valid prefix before falling back to hex.
        Err(err) if truncated && err.valid_up_to() > 0 => {
            let text = std::str::from_utf8(&head[..err.valid_up_to()])
                .unwrap_or_default()
                .chars()
                .map(|c| if c.is_control() { ' ' } else { c })
                .collect();
            (text, false, true)
        }
        Err(_) => {
            use std::fmt::Write as _;

            let mut hex = String::with_capacity(head.len() * 3);
            for (i, byte) in head.iter().enumerate() {
                if i > 0 {
                    hex.push(' ');
                }
                // Writing into the buffer avoids an allocation per byte, which
                // matters: this runs on every binary sample of a live tap.
                let _ = write!(hex, "{byte:02x}");
            }
            (hex, true, truncated)
        }
    }
}

/// A coalesced group of samples. Taps emit these on a timer rather than one
/// event per sample, so a firehose key expression cannot starve the webview.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SampleBatch {
    /// Which tap produced the batch.
    pub tap_id: TapId,
    /// Rows in arrival order.
    pub samples: Vec<SampleRecord>,
    /// Samples discarded since the previous batch because the buffer was full.
    pub dropped: u64,
    /// Total samples the tap has seen since it started.
    pub total: u64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn text_payloads_render_as_text() {
        let (preview, is_hex, truncated) = render_preview(b"hello");
        assert_eq!(preview, "hello");
        assert!(!is_hex);
        assert!(!truncated);
    }

    #[test]
    fn control_characters_are_flattened() {
        let (preview, _, _) = render_preview(b"a\nb\tc");
        assert_eq!(preview, "a b c");
    }

    #[test]
    fn binary_payloads_render_as_hex() {
        let (preview, is_hex, _) = render_preview(&[0x00, 0xff, 0x7f]);
        assert_eq!(preview, "00 ff 7f");
        assert!(is_hex);
    }

    #[test]
    fn long_payloads_are_truncated_and_flagged() {
        let payload = vec![b'a'; PREVIEW_LIMIT + 32];
        let (preview, _, truncated) = render_preview(&payload);
        assert_eq!(preview.len(), PREVIEW_LIMIT);
        assert!(truncated);
    }

    #[test]
    fn truncating_mid_codepoint_still_yields_text() {
        // "é" is two bytes, so an odd byte count splits the final codepoint.
        // Build the byte slice directly: `String::truncate` refuses to cut here.
        let text = "é".repeat(PREVIEW_LIMIT);
        let payload = &text.as_bytes()[..=PREVIEW_LIMIT];
        let (preview, is_hex, truncated) = render_preview(payload);
        assert!(!is_hex, "a split codepoint must not fall back to hex");
        assert!(truncated);
        assert!(!preview.is_empty());
    }
}
