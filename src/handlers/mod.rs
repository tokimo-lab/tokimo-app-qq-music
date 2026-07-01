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
    qq::{LyricLookup, QqClient, cookie_hint},
    types::{
        AudioQualitiesResp, AudioQualityId, AuthStatusResp, LikeSongResp, LikedSongsResp, LyricsResp, MyPlaylistsResp,
        RecommendPlaylistsResp, SaveCookieReq, SearchResp, SongCommentsResp,
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LyricsParams {
    pub song_id: Option<String>,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub duration_ms: Option<u64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioParams {
    pub quality: Option<AudioQualityId>,
    pub song_id: Option<String>,
    pub media_mid: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QualitiesParams {
    pub selected: Option<AudioQualityId>,
    pub song_id: Option<String>,
    pub media_mid: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommentsParams {
    pub page: Option<u32>,
    pub limit: Option<u32>,
}

#[derive(Deserialize)]
pub struct ImageProxyParams {
    pub url: String,
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
    Query(params): Query<LyricsParams>,
) -> Result<RespJson<ApiResponse<LyricsResp>>, AppError> {
    let cookie = read_qq_cookie(&ctx, &caller).await?;
    let lookup = params
        .song_id
        .filter(|value| !value.trim().is_empty())
        .map(|song_id| LyricLookup {
            song_id,
            title: params.title.unwrap_or_default(),
            artist: params.artist.unwrap_or_default(),
            album: params.album.unwrap_or_default(),
            duration_ms: params.duration_ms.unwrap_or_default(),
        });
    Ok(ok(ctx.qq.lyrics(&songmid, lookup, cookie.as_deref()).await))
}

pub async fn audio(
    State(ctx): State<Arc<AppCtx>>,
    caller: AppCaller,
    headers: HeaderMap,
    Path(songmid): Path<String>,
    Query(params): Query<AudioParams>,
) -> Result<Response, AppError> {
    let cookie = read_qq_cookie(&ctx, &caller).await?;
    let audio = ctx
        .qq
        .audio_url(
            &songmid,
            params.quality.unwrap_or(AudioQualityId::Standard),
            params.song_id.as_deref(),
            params.media_mid.as_deref(),
            cookie.as_deref(),
        )
        .await?;
    let content_type = match audio.quality {
        AudioQualityId::Sq | AudioQualityId::Master => "audio/flac",
        AudioQualityId::Standard | AudioQualityId::Hq => "audio/mpeg",
    };
    let mut req = ctx.qq.audio_request(&audio.url);
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
        .header(header::CONTENT_TYPE, content_type)
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

pub async fn audio_qualities(
    State(ctx): State<Arc<AppCtx>>,
    caller: AppCaller,
    Path(songmid): Path<String>,
    Query(params): Query<QualitiesParams>,
) -> Result<RespJson<ApiResponse<AudioQualitiesResp>>, AppError> {
    let cookie = read_qq_cookie(&ctx, &caller).await?;
    Ok(ok(ctx
        .qq
        .audio_qualities(
            &songmid,
            params.selected.unwrap_or(AudioQualityId::Standard),
            params.song_id.as_deref(),
            params.media_mid.as_deref(),
            cookie.as_deref(),
        )
        .await?))
}

pub async fn song_comments(
    State(ctx): State<Arc<AppCtx>>,
    caller: AppCaller,
    Path(song_id): Path<String>,
    Query(params): Query<CommentsParams>,
) -> Result<RespJson<ApiResponse<SongCommentsResp>>, AppError> {
    let cookie = read_qq_cookie(&ctx, &caller).await?;
    Ok(ok(ctx
        .qq
        .song_comments(
            &song_id,
            params.page.unwrap_or(0),
            params.limit.unwrap_or(20),
            cookie.as_deref(),
        )
        .await?))
}

pub async fn image_proxy(
    State(ctx): State<Arc<AppCtx>>,
    Query(params): Query<ImageProxyParams>,
) -> Result<Response, AppError> {
    if !is_allowed_qq_image_url(&params.url) {
        return Err(AppError::bad_request("unsupported image url"));
    }

    let resp = ctx.qq.image_request(&params.url).send().await?;
    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(AppError::Upstream {
            status: StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::BAD_GATEWAY),
            body,
        });
    }

    let content_type = resp
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("");
    if !content_type.starts_with("image/") {
        return Err(AppError::bad_request("upstream response is not an image"));
    }

    let mut builder = Response::builder()
        .status(StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::OK))
        .header(header::CONTENT_TYPE, content_type)
        .header(header::CACHE_CONTROL, "public, max-age=86400");

    if let Some(value) = resp.headers().get(header::CONTENT_LENGTH) {
        builder = builder.header(header::CONTENT_LENGTH, value.clone());
    }

    let stream = resp.bytes_stream().map_err(std::io::Error::other);
    Ok(builder.body(Body::from_stream(stream)).unwrap().into_response())
}

fn is_allowed_qq_image_url(value: &str) -> bool {
    let Ok(url) = reqwest::Url::parse(value) else {
        return false;
    };
    if url.scheme() != "https" {
        return false;
    }
    matches!(
        url.host_str(),
        Some("y.gtimg.cn" | "p.qpic.cn" | "qpic.y.qq.com" | "thirdqq.qlogo.cn" | "thirdwx.qlogo.cn")
    )
}
