use tracing::{debug, info};

/// Logs progress through a long-running loop: every 25 items at `info`, plus
/// the final item, so a full run leaves a heartbeat without flooding output.
/// Every item is still logged at `debug` for verbose troubleshooting.
pub fn log_progress(done: usize, total: usize, label: &str) {
    if done.is_multiple_of(25) || done == total {
        info!(done, total, "{label} progress");
    } else {
        debug!(done, total, "{label} progress");
    }
}
