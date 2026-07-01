use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct SongDto {
    pub id: String,
    pub songmid: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub album_mid: String,
    pub duration_ms: u64,
    pub artwork_url: String,
    pub source_url: String,
    pub vip: bool,
    pub playable: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistDto {
    pub id: String,
    pub title: String,
    pub author: String,
    pub cover_img_url: String,
    pub source_url: String,
    pub count: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct UserDto {
    pub user_id: String,
    pub nickname: String,
    pub avatar: String,
    pub vip_label: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct AuthStatusResp {
    pub is_login: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user: Option<UserDto>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cookie_hint: Option<String>,
}

#[derive(Clone, Debug, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct SaveCookieReq {
    pub cookie_header: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct SearchResp {
    pub songs: Vec<SongDto>,
    pub playlists: Vec<PlaylistDto>,
    pub song_total: u32,
    pub playlist_total: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistDetailResp {
    pub info: PlaylistDto,
    pub tracks: Vec<SongDto>,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct MyPlaylistsResp {
    pub user: UserDto,
    pub created: Vec<PlaylistDto>,
    pub favorite: Vec<PlaylistDto>,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct RecommendPlaylistsResp {
    pub playlists: Vec<PlaylistDto>,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct LyricsResp {
    pub songmid: String,
    pub lyric: String,
}
