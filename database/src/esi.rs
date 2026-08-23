use rfesi::prelude::EsiError;

/// Interprets the result of fetching one page of an ESI paginated list
/// endpoint.
///
/// ESI signals "no more pages" two different ways depending on the
/// endpoint: the requested page comes back empty, or (once `page` exceeds
/// the endpoint's page count) the request 404s. Both mean pagination is
/// done, not that something went wrong -- callers should stop looping
/// rather than propagate an error. Any other error is passed through
/// unchanged.
pub fn next_page<T>(
    result: Result<Vec<T>, EsiError>,
) -> Result<Option<Vec<T>>, EsiError> {
    match result {
        Ok(batch) if batch.is_empty() => Ok(None),
        Ok(batch) => Ok(Some(batch)),
        Err(EsiError::InvalidStatusCode(404)) => Ok(None),
        Err(e) => Err(e),
    }
}
