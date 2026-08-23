use std::sync::Arc;

use deadpool_postgres::Pool;

use crate::graph::Graph;

pub struct Inner {
    pub db: Pool,
    /// Built once at startup and never refreshed for this slice -- universe
    /// topology only changes on rare SDE updates, and a restart is an
    /// acceptable way to pick that up for now (see `graph::Graph::build`).
    pub graph: Arc<Graph>,
}

#[derive(Clone)]
pub struct AppState(Arc<Inner>);

impl AppState {
    pub fn new(db: Pool, graph: Arc<Graph>) -> Self {
        Self(Arc::new(Inner { db, graph }))
    }
}

impl std::ops::Deref for AppState {
    type Target = Inner;
    fn deref(&self) -> &Inner {
        &self.0
    }
}
