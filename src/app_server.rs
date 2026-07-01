use std::sync::Arc;

use axum::{
    Router,
    routing::{get, put},
};
use tokimo_bus_protocol::{BusListener, DataPlaneSocket};
use tracing::{error, info};

use crate::{
    assets,
    handlers::{self, AppCtx},
};

pub async fn spawn(service: &str, ctx: Arc<AppCtx>) -> anyhow::Result<DataPlaneSocket> {
    let (listener, socket) = BusListener::bind_for_app(service)?;
    info!(?socket, "qq-music: app server listening");

    let router = build_router(ctx);
    tokio::spawn(async move {
        if let Err(error) = axum::serve(listener, router).await {
            error!(%error, "qq-music: app server stopped");
        }
    });

    Ok(socket)
}

fn build_router(ctx: Arc<AppCtx>) -> Router {
    Router::new()
        .route("/auth/status", get(handlers::auth_status))
        .route(
            "/auth/cookie",
            put(handlers::save_cookie).delete(handlers::delete_cookie),
        )
        .route("/me/playlists", get(handlers::my_playlists))
        .route("/me/liked-songs", get(handlers::liked_songs))
        .route(
            "/me/liked-songs/{songmid}",
            put(handlers::like_song).delete(handlers::unlike_song),
        )
        .route("/search", get(handlers::search))
        .route("/recommend/playlists", get(handlers::recommend_playlists))
        .route("/playlists/{id}", get(handlers::playlist_detail))
        .route("/audio/{songmid}", get(handlers::audio))
        .route("/lyrics/{songmid}", get(handlers::lyrics))
        .route("/assets/{*path}", get(assets::serve))
        .with_state(ctx)
}
