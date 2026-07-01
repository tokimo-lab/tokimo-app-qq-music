use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct SongDto {
    pub id: String,
    pub song_id: String,
    pub songmid: String,
    pub media_mid: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub album_mid: String,
    pub duration_ms: u64,
    pub artwork_url: String,
    pub source_url: String,
    pub vip: bool,
    pub playable: bool,
    pub size_128_mp3: u64,
    pub size_320_mp3: u64,
    pub size_flac: u64,
    pub size_master: u64,
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
pub struct LikedSongsResp {
    pub songmids: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct LikeSongResp {
    pub songmid: String,
    pub liked: bool,
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
    pub source: LyricSource,
    pub lyric: String,
    pub lines: Vec<LyricLineDto>,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum LyricSource {
    Qrc,
    Lrc,
    None,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct LyricLineDto {
    pub start_ms: u64,
    pub end_ms: u64,
    pub text: String,
    pub words: Vec<LyricWordDto>,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct LyricWordDto {
    pub start_ms: u64,
    pub end_ms: u64,
    pub text: String,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq, TS)]
#[serde(rename_all = "lowercase")]
pub enum AudioQualityId {
    Standard,
    Hq,
    Sq,
    Master,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct AudioQualityDto {
    pub id: AudioQualityId,
    pub label: String,
    pub detail: String,
    pub size_bytes: u64,
    pub available: bool,
    pub selected: bool,
    pub requires_login: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct AudioQualitiesResp {
    pub songmid: String,
    pub selected: AudioQualityId,
    pub qualities: Vec<AudioQualityDto>,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct SongCommentReplyDto {
    pub id: String,
    pub nick: String,
    pub content: String,
    pub like_count: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct SongCommentDto {
    pub id: String,
    pub nick: String,
    pub avatar_url: String,
    pub content: String,
    pub like_count: u64,
    pub published_at: u64,
    pub location: String,
    pub vip_icon: String,
    pub identity_icon: String,
    pub is_hot: bool,
    pub replies: Vec<SongCommentReplyDto>,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct SongCommentsResp {
    pub song_id: String,
    pub total: u64,
    pub hot_total: u64,
    pub comments: Vec<SongCommentDto>,
    pub hot_comments: Vec<SongCommentDto>,
    pub has_more: bool,
}
