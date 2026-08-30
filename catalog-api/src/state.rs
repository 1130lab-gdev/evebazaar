use std::sync::Arc;

use deadpool_postgres::Pool;
use tokio::sync::OnceCell;

use crate::{db::jumps::JumpGraph, error::AppError};

pub struct Inner {
    pub db: Pool,
    jump_graph: OnceCell<JumpGraph>,
}

#[derive(Clone)]
pub struct AppState(Arc<Inner>);

impl AppState {
    pub fn new(db: Pool) -> Self {
        Self(Arc::new(Inner { db, jump_graph: OnceCell::new() }))
    }

    /// Loaded on first use, then reused for the life of the process --
    /// see JumpGraph's doc comment for why this is safe to cache.
    pub async fn jump_graph(&self) -> Result<&JumpGraph, AppError> {
        self.0.jump_graph.get_or_try_init(|| JumpGraph::load(&self.0.db)).await
    }
}

impl std::ops::Deref for AppState {
    type Target = Inner;
    fn deref(&self) -> &Inner {
        &self.0
    }
}
