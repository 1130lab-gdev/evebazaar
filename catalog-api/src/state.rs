use std::sync::Arc;
use std::time::{Duration, Instant};

use deadpool_postgres::Pool;
use tokio::sync::{Mutex, OnceCell};

use crate::{
    db::{jumps::JumpGraph, market_books::MarketBooks},
    error::AppError,
};

/// How long one `MarketBooks` snapshot is reused before the next route
/// search reloads it. The `database` sync rewrites market orders every ~5
/// minutes, so this keeps searches at most a minute behind that while
/// sparing back-to-back searches (and each cache-warm burst) a reload.
const MARKET_BOOKS_TTL: Duration = Duration::from_secs(60);

pub struct Inner {
    pub db: Pool,
    jump_graph: OnceCell<JumpGraph>,
    market_books: Mutex<Option<(Instant, Arc<MarketBooks>)>>,
}

#[derive(Clone)]
pub struct AppState(Arc<Inner>);

impl AppState {
    pub fn new(db: Pool) -> Self {
        Self(Arc::new(Inner { db, jump_graph: OnceCell::new(), market_books: Mutex::new(None) }))
    }

    /// Loaded on first use, then reused for the life of the process --
    /// see JumpGraph's doc comment for why this is safe to cache.
    pub async fn jump_graph(&self) -> Result<&JumpGraph, AppError> {
        self.0.jump_graph.get_or_try_init(|| JumpGraph::load(&self.0.db)).await
    }

    /// The current market snapshot, reloaded once it's older than
    /// `MARKET_BOOKS_TTL`. The lock is held across the reload so
    /// concurrent searches wait for one load instead of each starting
    /// their own.
    pub async fn market_books(&self) -> Result<Arc<MarketBooks>, AppError> {
        let mut slot = self.0.market_books.lock().await;
        if let Some((loaded_at, books)) = slot.as_ref()
            && loaded_at.elapsed() < MARKET_BOOKS_TTL
        {
            return Ok(books.clone());
        }
        let books = Arc::new(MarketBooks::load(&self.0.db).await?);
        *slot = Some((Instant::now(), books.clone()));
        Ok(books)
    }
}

impl std::ops::Deref for AppState {
    type Target = Inner;
    fn deref(&self) -> &Inner {
        &self.0
    }
}
