//! The registry of open sessions.
//!
//! One explorer window can hold several networks open at once — that is what
//! the session tabs in the titlebar are. The manager owns them, hands out
//! `Arc` clones so commands can run concurrently against the same session, and
//! guarantees that closing a session stops everything derived from it.

use std::sync::Arc;

use dashmap::DashMap;

use crate::config::ConnectionProfile;
use crate::error::{Error, Result};
use crate::event::EventSink;
use crate::model::SessionId;
use crate::session::handle::{ManagedSession, SessionSummary};

/// Owns every open session.
pub struct SessionManager {
    sessions: DashMap<SessionId, Arc<ManagedSession>>,
    sink: Arc<dyn EventSink>,
}

impl std::fmt::Debug for SessionManager {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SessionManager")
            .field("open", &self.sessions.len())
            .finish_non_exhaustive()
    }
}

impl SessionManager {
    /// Creates an empty manager that reports events to `sink`.
    #[must_use]
    pub fn new(sink: Arc<dyn EventSink>) -> Self {
        Self {
            sessions: DashMap::new(),
            sink,
        }
    }

    /// Opens a session and registers it.
    pub async fn connect(&self, profile: ConnectionProfile) -> Result<SessionId> {
        let session = ManagedSession::open(profile, Arc::clone(&self.sink)).await?;
        let id = session.id().clone();
        self.sessions.insert(id.clone(), Arc::new(session));
        Ok(id)
    }

    /// Looks up a session, or reports it as unknown.
    ///
    /// Returns an `Arc` rather than a guard so callers can `await` without
    /// holding a lock across the suspension point.
    pub fn get(&self, id: &SessionId) -> Result<Arc<ManagedSession>> {
        self.sessions
            .get(id)
            .map(|entry| Arc::clone(entry.value()))
            .ok_or_else(|| Error::UnknownSession(id.clone()))
    }

    /// Closes and deregisters a session.
    pub async fn disconnect(&self, id: &SessionId, reason: Option<String>) -> Result<()> {
        let (_, session) = self
            .sessions
            .remove(id)
            .ok_or_else(|| Error::UnknownSession(id.clone()))?;

        // The manager holds the only strong reference in the normal case, but a
        // command in flight may still hold one. Wait for it rather than leaking
        // the Zenoh session, which would keep its transports open.
        match Arc::try_unwrap(session) {
            Ok(session) => session.close(reason).await,
            Err(still_shared) => {
                tracing::debug!(
                    session = %id,
                    "close deferred: a command still holds this session"
                );
                drop(still_shared);
            }
        }
        Ok(())
    }

    /// Summaries of every open session, in the order they were opened.
    pub async fn summaries(&self) -> Vec<SessionSummary> {
        let sessions: Vec<_> = self
            .sessions
            .iter()
            .map(|entry| Arc::clone(entry.value()))
            .collect();

        let mut summaries = Vec::with_capacity(sessions.len());
        for session in sessions {
            summaries.push(session.summary().await);
        }
        summaries.sort_by_key(|s| s.opened_at_ms);
        summaries
    }

    /// How many sessions are open.
    #[must_use]
    pub fn len(&self) -> usize {
        self.sessions.len()
    }

    /// Whether no session is open.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.sessions.is_empty()
    }

    /// Closes everything. Called on app exit so Zenoh gets a clean shutdown
    /// rather than having its transports torn down by process death.
    pub async fn close_all(&self) {
        let ids: Vec<_> = self.sessions.iter().map(|e| e.key().clone()).collect();
        for id in ids {
            if let Err(err) = self
                .disconnect(&id, Some("application exiting".to_owned()))
                .await
            {
                tracing::warn!(session = %id, error = %err, "failed to close session on exit");
            }
        }
    }
}
