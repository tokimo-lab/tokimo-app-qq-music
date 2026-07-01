use std::sync::{Arc, OnceLock};

use axum::{
    Json,
    body::Body,
    extract::{FromRequestParts, Path, Query, State},
    http::{HeaderMap, StatusCode, header, request::Parts},
    response::{IntoResponse, Json as RespJson, Response},
};
use futures_util::TryStreamExt;
use serde::Deserialize;
use tokimo_bus_client::BusClient;

use crate::{
    error::{ApiResponse, AppError, ok},
    openapi_client::OpenApiClient,
    qq::{QqClient, cookie_hint},
    types::{
        AuthStatusResp, LikeSongResp, LikedSongsResp, LyricsResp, MyPlaylistsResp, RecommendPlaylistsResp,
        SaveCookieReq, SearchResp,
    },
};

const PREF_SCOPE: &str = "component";
const PREF_SCOPE_ID: &str = "qq-music-auth";
const COOKIE_KEY: &str = "cookieHeader";

pub struct AppCtx {
    pub openapi: Arc<OpenApiClient>,
    pub qq: Arc<QqClient>,
    #[allow(dead_code)]
    pub client: Arc<OnceLock<Arc<BusClient>>>,
}

pub struct AppCaller {
    pub cookie_header: String,
}

impl<S> FromRequestParts<S> for AppCaller
where
    S: Send + Sync,
{
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        let _user_id = parts
            .headers
            .get("x-tokimo-user-id")
            .and_then(|value| value.to_str().ok())
            .ok_or_else(|| AppError::Unauthorized("missing x-tokimo-user-id".into()))?;
        Ok(Self {
            cookie_header: collect_cookie_header(&parts.headers),
        })
    }
}

fn collect_cookie_header(headers: &HeaderMap) -> String {
    headers
        .get_all(header::COOKIE)
        .iter()
        .filter_map(|value| value.to_str().ok())
        .collect::<Vec<_>>()
        .join("; ")
}

async fn read_qq_cookie(ctx: &AppCtx, caller: &AppCaller) -> Result<Option<String>, AppError> {
    let value = ctx
        .openapi
        .pref_get(&caller.cookie_header, PREF_SCOPE, PREF_SCOPE_ID)
        .await?;
    Ok(value
        .and_then(|value| {
            value
                .get(COOKIE_KEY)
                .and_then(|cookie| cookie.as_str().map(str::to_string))
        })
        .filter(|value| !value.trim().is_empty()))
}

async fn write_qq_cookie(ctx: &AppCtx, caller: &AppCaller, cookie_header: &str) -> Result<(), AppError> {
    let value = serde_json::json!({ COOKIE_KEY: cookie_header });
    ctx.openapi
        .pref_put(&caller.cookie_header, PREF_SCOPE, PREF_SCOPE_ID, value)
        .await
}

#[derive(Deserialize)]
pub struct SearchParams {
    pub query: String,
    #[serde(default = "default_search_types")]
    pub types: String,
    #[serde(default = "default_page")]
    pub page: u32,
    #[serde(default = "default_limit")]
    pub limit: u32,
}

fn default_search_types() -> String {
    "songs,playlists".to_string()
}

fn default_page() -> u32 {
    1
}

fn default_limit() -> u32 {
    30
}

#[derive(Deserialize)]
pub struct LimitParams {
    #[serde(default = "default_recommend_limit")]
    pub limit: u32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnlikeSongParams {
    pub song_id: Option<String>,
}

fn default_recommend_limit() -> u32 {
    18
}

pub async fn auth_status(
    State(ctx): State<Arc<AppCtx>>,
    caller: AppCaller,
) -> Result<RespJson<ApiResponse<AuthStatusResp>>, AppError> {
    let Some(cookie) = read_qq_cookie(&ctx, &caller).await? else {
        return Ok(ok(AuthStatusResp {
            is_login: false,
            user: None,
            cookie_hint: None,
        }));
    };
    match ctx.qq.user(&cookie).await {
        Ok(user) => Ok(ok(AuthStatusResp {
            is_login: true,
            user: Some(user),
            cookie_hint: cookie_hint(&cookie),
        })),
        Err(_) => Ok(ok(AuthStatusResp {
            is_login: false,
            user: None,
            cookie_hint: cookie_hint(&cookie),
        })),
    }
}

pub async fn save_cookie(
    State(ctx): State<Arc<AppCtx>>,
    caller: AppCaller,
    Json(input): Json<SaveCookieReq>,
) -> Result<RespJson<ApiResponse<AuthStatusResp>>, AppError> {
    let cookie = input.cookie_header.trim();
    if cookie.is_empty() {
        return Err(AppError::bad_request("cookieHeader is required"));
    }
    let user = ctx.qq.user(cookie).await?;
    write_qq_cookie(&ctx, &caller, cookie).await?;
    Ok(ok(AuthStatusResp {
        is_login: true,
        user: Some(user),
        cookie_hint: cookie_hint(cookie),
    }))
}

pub async fn delete_cookie(
    State(ctx): State<Arc<AppCtx>>,
    caller: AppCaller,
) -> Result<RespJson<ApiResponse<AuthStatusResp>>, AppError> {
    ctx.openapi
        .pref_delete(&caller.cookie_header, PREF_SCOPE, PREF_SCOPE_ID)
        .await?;
    Ok(ok(AuthStatusResp {
        is_login: false,
        user: None,
        cookie_hint: None,
    }))
}

pub async fn my_playlists(
    State(ctx): State<Arc<AppCtx>>,
    caller: AppCaller,
) -> Result<RespJson<ApiResponse<MyPlaylistsResp>>, AppError> {
    let cookie = read_qq_cookie(&ctx, &caller)
        .await?
        .ok_or_else(|| AppError::Unauthorized("QQ Music is not logged in".into()))?;
    let user = ctx.qq.user(&cookie).await?;
    let created = ctx.qq.created_playlists(&cookie).await.unwrap_or_default();
    let favorite = ctx.qq.favorite_playlists(&cookie).await.unwrap_or_default();
    Ok(ok(MyPlaylistsResp {
        user,
        created,
        favorite,
    }))
}

pub async fn liked_songs(
    State(ctx): State<Arc<AppCtx>>,
    caller: AppCaller,
) -> Result<RespJson<ApiResponse<LikedSongsResp>>, AppError> {
    let cookie = read_qq_cookie(&ctx, &caller)
        .await?
        .ok_or_else(|| AppError::Unauthorized("QQ Music is not logged in".into()))?;
    Ok(ok(LikedSongsResp {
        songmids: ctx.qq.liked_songmids(&cookie).await?,
    }))
}

pub async fn like_song(
    State(ctx): State<Arc<AppCtx>>,
    caller: AppCaller,
    Path(songmid): Path<String>,
) -> Result<RespJson<ApiResponse<LikeSongResp>>, AppError> {
    let cookie = read_qq_cookie(&ctx, &caller)
        .await?
        .ok_or_else(|| AppError::Unauthorized("QQ Music is not logged in".into()))?;
    ctx.qq.like_song(&cookie, &songmid).await?;
    Ok(ok(LikeSongResp { songmid, liked: true }))
}

pub async fn unlike_song(
    State(ctx): State<Arc<AppCtx>>,
    caller: AppCaller,
    Path(songmid): Path<String>,
    Query(params): Query<UnlikeSongParams>,
) -> Result<RespJson<ApiResponse<LikeSongResp>>, AppError> {
    let cookie = read_qq_cookie(&ctx, &caller)
        .await?
        .ok_or_else(|| AppError::Unauthorized("QQ Music is not logged in".into()))?;
    ctx.qq.unlike_song(&cookie, &songmid, params.song_id.as_deref()).await?;
    Ok(ok(LikeSongResp { songmid, liked: false }))
}

pub async fn search(
    State(ctx): State<Arc<AppCtx>>,
    Query(params): Query<SearchParams>,
) -> Result<RespJson<ApiResponse<SearchResp>>, AppError> {
    if params.query.trim().is_empty() {
        return Err(AppError::bad_request("query is required"));
    }
    Ok(ok(ctx
        .qq
        .search(params.query.trim(), params.page, params.limit, &params.types)
        .await?))
}

pub async fn recommend_playlists(
    State(ctx): State<Arc<AppCtx>>,
    Query(params): Query<LimitParams>,
) -> Result<RespJson<ApiResponse<RecommendPlaylistsResp>>, AppError> {
    Ok(ok(ctx.qq.recommend_playlists(params.limit).await?))
}

pub async fn playlist_detail(
    State(ctx): State<Arc<AppCtx>>,
    Path(id): Path<String>,
) -> Result<RespJson<ApiResponse<crate::types::PlaylistDetailResp>>, AppError> {
    Ok(ok(ctx.qq.playlist_detail(&id).await?))
}

pub async fn lyrics(
    State(ctx): State<Arc<AppCtx>>,
    caller: AppCaller,
    Path(songmid): Path<String>,
) -> Result<RespJson<ApiResponse<LyricsResp>>, AppError> {
    let cookie = read_qq_cookie(&ctx, &caller).await?;
    let lyric = ctx.qq.lyric(&songmid, cookie.as_deref()).await.unwrap_or_default();
    Ok(ok(LyricsResp { songmid, lyric }))
}

pub async fn audio(
    State(ctx): State<Arc<AppCtx>>,
    caller: AppCaller,
    headers: HeaderMap,
    Path(songmid): Path<String>,
) -> Result<Response, AppError> {
    let cookie = read_qq_cookie(&ctx, &caller).await?;
    let audio_url = ctx.qq.audio_url(&songmid, cookie.as_deref()).await?;
    let mut req = ctx.qq.audio_request(&audio_url);
    if let Some(range) = headers.get(header::RANGE) {
        req = req.header(header::RANGE, range.clone());
    }

    let resp = req.send().await?;
    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(AppError::Upstream {
            status: StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::BAD_GATEWAY),
            body,
        });
    }

    let mut builder = Response::builder()
        .status(StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::OK))
        .header(header::CONTENT_TYPE, "audio/mpeg")
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::CACHE_CONTROL, "private, max-age=300");

    for name in [header::CONTENT_LENGTH, header::CONTENT_RANGE] {
        if let Some(value) = resp.headers().get(&name) {
            builder = builder.header(name, value.clone());
        }
    }

    let stream = resp.bytes_stream().map_err(std::io::Error::other);
    Ok(builder.body(Body::from_stream(stream)).unwrap().into_response())
}
