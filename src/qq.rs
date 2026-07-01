use std::{collections::HashMap, sync::Arc};

use axum::http::StatusCode;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use reqwest::{Client, RequestBuilder, header};
use serde_json::{Value, json};
use tokio::sync::OnceCell;
use tracing::debug;

use crate::{
    error::AppError,
    qrc,
    types::{
        AudioQualitiesResp, AudioQualityDto, AudioQualityId, LyricSource, LyricsResp, PlaylistDetailResp, PlaylistDto,
        RecommendPlaylistsResp, SearchResp, SongCommentDto, SongCommentReplyDto, SongCommentsResp, SongDto, UserDto,
    },
};

const MUSICU: &str = "https://u.y.qq.com/cgi-bin/musicu.fcg";
const REFERER: &str = "https://y.qq.com/";
const ORIGIN: &str = "https://y.qq.com";
const USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/72.0.3626.119 Safari/537.36";

#[derive(Clone)]
pub struct QqClient {
    client: Client,
    lyric_session: Arc<OnceCell<LyricSession>>,
}

#[derive(Clone, Debug)]
pub struct LyricLookup {
    pub song_id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub duration_ms: u64,
}

#[derive(Clone, Debug)]
struct LyricSession {
    uid: String,
    sid: String,
    userip: String,
}

pub struct ResolvedAudioUrl {
    pub url: String,
    pub quality: AudioQualityId,
}

#[derive(Clone, Copy)]
struct QualitySpec {
    id: AudioQualityId,
    label: &'static str,
    detail: &'static str,
    requires_login: bool,
}

const QUALITY_SPECS: [QualitySpec; 4] = [
    QualitySpec {
        id: AudioQualityId::Standard,
        label: "标准品质",
        detail: "128K MP3",
        requires_login: false,
    },
    QualitySpec {
        id: AudioQualityId::Hq,
        label: "HQ高品质",
        detail: "320K MP3",
        requires_login: true,
    },
    QualitySpec {
        id: AudioQualityId::Sq,
        label: "SQ无损品质",
        detail: "FLAC",
        requires_login: true,
    },
    QualitySpec {
        id: AudioQualityId::Master,
        label: "臻品母带",
        detail: "Hi-Res / 臻品资源",
        requires_login: true,
    },
];

impl QqClient {
    pub fn new() -> anyhow::Result<Self> {
        let client = Client::builder()
            .user_agent(USER_AGENT)
            .redirect(reqwest::redirect::Policy::limited(10))
            .build()
            .map_err(|error| anyhow::anyhow!("reqwest build: {error}"))?;
        Ok(Self {
            client,
            lyric_session: Arc::new(OnceCell::new()),
        })
    }

    pub async fn search(&self, keyword: &str, page: u32, limit: u32, types: &str) -> Result<SearchResp, AppError> {
        let wants_songs = types.split(',').any(|item| item.trim() == "songs");
        let wants_playlists = types.split(',').any(|item| item.trim() == "playlists");
        let mut songs = Vec::new();
        let mut playlists = Vec::new();
        let mut song_total = 0;
        let mut playlist_total = 0;

        if wants_songs {
            let data = self.search_kind(keyword, page, limit, 0).await?;
            songs = data
                .pointer("/req/data/body/song/list")
                .and_then(Value::as_array)
                .map(|items| items.iter().map(convert_song).collect())
                .unwrap_or_default();
            song_total = data
                .pointer("/req/data/meta/sum")
                .and_then(Value::as_u64)
                .unwrap_or(songs.len() as u64) as u32;
        }

        if wants_playlists {
            let data = self.search_kind(keyword, page, limit, 3).await?;
            playlists = data
                .pointer("/req/data/body/songlist/list")
                .and_then(Value::as_array)
                .map(|items| items.iter().map(convert_search_playlist).collect())
                .unwrap_or_default();
            playlist_total = data
                .pointer("/req/data/meta/sum")
                .and_then(Value::as_u64)
                .unwrap_or(playlists.len() as u64) as u32;
        }

        Ok(SearchResp {
            songs,
            playlists,
            song_total,
            playlist_total,
        })
    }

    async fn search_kind(&self, keyword: &str, page: u32, limit: u32, search_type: u32) -> Result<Value, AppError> {
        let body = json!({
            "comm": { "ct": "19", "cv": "1859", "uin": "0" },
            "req": {
                "method": "DoSearchForQQMusicDesktop",
                "module": "music.search.SearchCgiService",
                "param": {
                    "grp": 1,
                    "num_per_page": limit.clamp(1, 50),
                    "page_num": page.max(1),
                    "query": keyword,
                    "search_type": search_type
                }
            }
        });
        self.qq(self.client.post(MUSICU).json(&body), None).await
    }

    pub async fn playlist_detail(&self, playlist_id: &str) -> Result<PlaylistDetailResp, AppError> {
        let id = clean_playlist_id(playlist_id);
        let url = format!(
            "https://i.y.qq.com/qzone-music/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?type=1&json=1&utf8=1&onlysong=0&nosign=1&disstid={id}&g_tk=5381&loginUin=0&hostUin=0&format=json&inCharset=GB2312&outCharset=utf-8&notice=0&platform=yqq&needNewCode=0"
        );
        let data = self.qq(self.client.get(url), None).await?;
        let cd = data
            .pointer("/cdlist/0")
            .ok_or_else(|| AppError::NotFound("playlist not found".into()))?;
        let info = PlaylistDto {
            id: format!("qqplaylist_{id}"),
            title: str_at(cd, &["dissname", "title"])
                .unwrap_or("QQ Music Playlist")
                .to_string(),
            author: str_at(cd, &["nickname", "creator", "headurl"])
                .unwrap_or("QQ音乐")
                .to_string(),
            cover_img_url: str_at(cd, &["logo"]).unwrap_or("").to_string(),
            source_url: format!("https://y.qq.com/n/ryqq/playlist/{id}"),
            count: cd
                .pointer("/songlist")
                .and_then(Value::as_array)
                .map_or(0, |items| items.len() as u32),
        };
        let tracks = cd
            .pointer("/songlist")
            .and_then(Value::as_array)
            .map(|items| items.iter().map(convert_song).collect())
            .unwrap_or_default();
        Ok(PlaylistDetailResp { info, tracks })
    }

    pub async fn recommend_playlists(&self, limit: u32) -> Result<RecommendPlaylistsResp, AppError> {
        let query = json!({
            "comm": { "ct": 24 },
            "recomPlaylist": {
                "method": "get_hot_recommend",
                "module": "playlist.HotRecommendServer",
                "param": { "async": 1, "cmd": 2 }
            }
        });
        let url = format!(
            "{MUSICU}?format=json&&loginUin=0&hostUin=0inCharset=utf8&outCharset=utf-8&platform=yqq.json&needNewCode=0&data={}",
            percent_encode(&query.to_string())
        );
        let data = self.qq(self.client.get(url), None).await?;
        let playlists = data
            .pointer("/recomPlaylist/data/v_hot")
            .and_then(Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .take(limit.max(1) as usize)
                    .map(convert_recommend_playlist)
                    .collect()
            })
            .unwrap_or_default();
        Ok(RecommendPlaylistsResp { playlists })
    }

    pub async fn user(&self, cookie_header: &str) -> Result<UserDto, AppError> {
        let uin = qq_uin_from_cookie(cookie_header)
            .ok_or_else(|| AppError::Unauthorized("QQ cookie missing uin or wxuin".into()))?;
        self.user_by_uin(&uin, Some(cookie_header)).await
    }

    async fn user_by_uin(&self, uin: &str, cookie_header: Option<&str>) -> Result<UserDto, AppError> {
        let query = json!({
            "comm": { "ct": 24, "cv": 0 },
            "vip": {
                "module": "userInfo.VipQueryServer",
                "method": "SRFVipQuery_V2",
                "param": { "uin_list": [uin] }
            },
            "base": {
                "module": "userInfo.BaseUserInfoServer",
                "method": "get_user_baseinfo_v2",
                "param": { "vec_uin": [uin] }
            }
        });
        let url = format!(
            "{MUSICU}?format=json&&loginUin={uin}&hostUin=0inCharset=utf8&outCharset=utf-8&platform=yqq.json&needNewCode=0&data={}",
            percent_encode(&query.to_string())
        );
        let data = self.qq(self.client.get(url), cookie_header).await?;
        let info = data
            .pointer(&format!("/base/data/map_userinfo/{uin}"))
            .ok_or_else(|| AppError::Unauthorized("QQ login validation failed".into()))?;
        let vip_label = data
            .pointer(&format!("/vip/data/map_vip_info/{uin}/music/package_label"))
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        Ok(UserDto {
            user_id: uin.to_string(),
            nickname: str_at(info, &["nick", "nickname"]).unwrap_or(uin).to_string(),
            avatar: str_at(info, &["headurl", "avatar"]).unwrap_or("").to_string(),
            vip_label,
        })
    }

    pub async fn created_playlists(&self, cookie_header: &str) -> Result<Vec<PlaylistDto>, AppError> {
        let uin = qq_uin_from_cookie(cookie_header)
            .ok_or_else(|| AppError::Unauthorized("QQ cookie missing uin or wxuin".into()))?;
        let url = format!(
            "https://c.y.qq.com/rsc/fcgi-bin/fcg_user_created_diss?cv=4747474&ct=24&format=json&inCharset=utf-8&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=1&uin={uin}&hostuin={uin}&sin=0&size=100"
        );
        let data = self.qq(self.client.get(url), Some(cookie_header)).await?;
        Ok(data
            .pointer("/data/disslist")
            .and_then(Value::as_array)
            .map(|items| items.iter().filter_map(convert_user_created_playlist).collect())
            .unwrap_or_default())
    }

    pub async fn favorite_playlists(&self, cookie_header: &str) -> Result<Vec<PlaylistDto>, AppError> {
        let uin = qq_uin_from_cookie(cookie_header)
            .ok_or_else(|| AppError::Unauthorized("QQ cookie missing uin or wxuin".into()))?;
        let data = [
            ("ct", "20"),
            ("cid", "205360956"),
            ("userid", uin.as_str()),
            ("reqtype", "3"),
            ("sin", "0"),
            ("ein", "100"),
        ];
        let value = self
            .qq(
                self.client
                    .get("https://c.y.qq.com/fav/fcgi-bin/fcg_get_profile_order_asset.fcg")
                    .query(&data),
                Some(cookie_header),
            )
            .await?;
        Ok(value
            .pointer("/data/cdlist")
            .and_then(Value::as_array)
            .map(|items| items.iter().filter_map(convert_user_favorite_playlist).collect())
            .unwrap_or_default())
    }

    pub async fn liked_songmids(&self, cookie_header: &str) -> Result<Vec<String>, AppError> {
        let map = self.liked_song_map(cookie_header).await?;
        if !map.is_empty() {
            return Ok(map.into_keys().collect());
        }
        let liked_playlist = self
            .created_playlists(cookie_header)
            .await?
            .into_iter()
            .find(|playlist| playlist.title == "我喜欢");
        let Some(playlist) = liked_playlist else {
            return Ok(Vec::new());
        };
        Ok(self
            .playlist_detail(&playlist.id)
            .await?
            .tracks
            .into_iter()
            .map(|track| track.songmid)
            .filter(|songmid| !songmid.is_empty())
            .collect())
    }

    pub async fn like_song(&self, cookie_header: &str, songmid: &str) -> Result<(), AppError> {
        let songmid = songmid.trim();
        if songmid.is_empty() {
            return Err(AppError::bad_request("songmid is required"));
        }
        let data = [
            ("midlist", songmid),
            ("typelist", "13"),
            ("dirid", "201"),
            ("addtype", ""),
            ("formsender", "4"),
            ("r2", "0"),
            ("r3", "1"),
            ("utf8", "1"),
            ("g_tk", "5381"),
        ];
        let value = self
            .qq(
                self.client
                    .get("https://c.y.qq.com/splcloud/fcgi-bin/fcg_music_add2songdir.fcg?g_tk=5381")
                    .query(&data),
                Some(cookie_header),
            )
            .await?;
        ensure_qq_ok(&value, "add liked song")
    }

    pub async fn unlike_song(&self, cookie_header: &str, songmid: &str, song_id: Option<&str>) -> Result<(), AppError> {
        let songmid = songmid.trim();
        if songmid.is_empty() {
            return Err(AppError::bad_request("songmid is required"));
        }
        let uin = qq_uin_from_cookie(cookie_header)
            .ok_or_else(|| AppError::Unauthorized("QQ cookie missing uin or wxuin".into()))?;
        let song_id = match song_id.filter(|value| !value.trim().is_empty()) {
            Some(value) => value.to_string(),
            None => {
                let map = self.liked_song_map(cookie_header).await?;
                let Some(value) = map.get(songmid) else {
                    return Ok(());
                };
                value.clone()
            }
        };
        let data = [
            ("loginUin", uin.as_str()),
            ("hostUin", "0"),
            ("format", "json"),
            ("inCharset", "utf8"),
            ("outCharset", "utf-8"),
            ("notice", "0"),
            ("platform", "yqq.post"),
            ("needNewCode", "0"),
            ("uin", uin.as_str()),
            ("dirid", "201"),
            ("ids", song_id.as_str()),
            ("source", "103"),
            ("types", "3"),
            ("formsender", "4"),
            ("flag", "2"),
            ("utf8", "1"),
            ("from", "3"),
        ];
        let value = self
            .qq(
                self.client
                    .get("https://c.y.qq.com/qzone/fcg-bin/fcg_music_delbatchsong.fcg?g_tk=5381")
                    .query(&data),
                Some(cookie_header),
            )
            .await?;
        ensure_qq_ok(&value, "remove liked song")
    }

    async fn liked_song_map(&self, cookie_header: &str) -> Result<HashMap<String, String>, AppError> {
        let data = [("dirid", "201"), ("dirinfo", "1"), ("g_tk", "5381"), ("format", "json")];
        let value = self
            .qq(
                self.client
                    .get("https://c.y.qq.com/splcloud/fcgi-bin/fcg_musiclist_getmyfav.fcg")
                    .query(&data),
                Some(cookie_header),
            )
            .await?;
        ensure_qq_ok(&value, "load liked songs")?;
        let mids = values_to_strings(value.get("mapmid"));
        let ids = values_to_strings(value.get("map"));
        let mut result = HashMap::new();
        for (index, mid) in mids.into_iter().enumerate() {
            if mid.is_empty() {
                continue;
            }
            if let Some(id) = ids.get(index).filter(|id| !id.is_empty()) {
                result.insert(mid, id.clone());
            }
        }
        Ok(result)
    }

    pub async fn audio_url(
        &self,
        songmid: &str,
        quality: AudioQualityId,
        song_id: Option<&str>,
        media_mid: Option<&str>,
        cookie_header: Option<&str>,
    ) -> Result<ResolvedAudioUrl, AppError> {
        let detail = self
            .quality_source(songmid, song_id, media_mid)
            .await
            .unwrap_or_else(|_| QualitySource::minimal(songmid));
        for candidate in quality_fallbacks(quality) {
            if let Some(url) = self
                .try_quality_url(songmid, &detail.media_mid, candidate, cookie_header)
                .await?
            {
                return Ok(ResolvedAudioUrl {
                    url,
                    quality: candidate,
                });
            }
        }
        Err(AppError::NotFound("track is not playable from QQ Music".into()))
    }

    pub async fn audio_qualities(
        &self,
        songmid: &str,
        selected: AudioQualityId,
        song_id: Option<&str>,
        media_mid: Option<&str>,
        cookie_header: Option<&str>,
    ) -> Result<AudioQualitiesResp, AppError> {
        let detail = self.quality_source(songmid, song_id, media_mid).await?;
        let mut qualities = Vec::new();
        for spec in QUALITY_SPECS {
            let available = self
                .try_quality_url(songmid, &detail.media_mid, spec.id, cookie_header)
                .await?
                .is_some();
            qualities.push(AudioQualityDto {
                id: spec.id,
                label: spec.label.to_string(),
                detail: spec.detail.to_string(),
                size_bytes: quality_size(&detail.file, spec.id),
                available,
                selected: spec.id == selected,
                requires_login: spec.requires_login,
            });
        }
        Ok(AudioQualitiesResp {
            songmid: songmid.to_string(),
            selected,
            qualities,
        })
    }

    pub async fn song_comments(
        &self,
        song_id: &str,
        page: u32,
        limit: u32,
        cookie_header: Option<&str>,
    ) -> Result<SongCommentsResp, AppError> {
        if song_id.trim().is_empty() {
            return Err(AppError::bad_request("songId is required"));
        }
        let song_id = song_id.trim();
        let page_size = limit.clamp(1, 50);
        let body = json!({
            "comm": {
                "cv": 4747474,
                "ct": 24,
                "format": "json",
                "inCharset": "utf-8",
                "outCharset": "utf-8",
                "notice": 0,
                "platform": "yqq.json",
                "needNewCode": 1,
                "uin": 0,
                "g_tk_new_20200303": 5381,
                "g_tk": 5381
            },
            "count": {
                "method": "GetCommentCount",
                "module": "GlobalComment.GlobalCommentReadServer",
                "param": {
                    "request_list": [{
                        "biz_type": 1,
                        "biz_id": song_id,
                        "biz_sub_type": 0
                    }]
                }
            },
            "new_comments": {
                "method": "GetNewCommentList",
                "module": "music.globalComment.CommentReadServer",
                "param": {
                    "BizType": 1,
                    "BizId": song_id,
                    "LastCommentSeqNo": "",
                    "PageSize": page_size,
                    "PageNum": page,
                    "FromCommentId": "",
                    "WithHot": 1
                }
            },
            "hot_comments": {
                "method": "GetHotCommentList",
                "module": "music.globalComment.CommentReadServer",
                "param": {
                    "BizType": 1,
                    "BizId": song_id,
                    "LastCommentSeqNo": "",
                    "PageSize": page_size.min(15),
                    "PageNum": 0,
                    "HotType": 2,
                    "WithAirborne": 1
                }
            }
        });
        let value = self.qq(self.client.post(MUSICU).json(&body), cookie_header).await?;
        ensure_qq_ok(&value, "load song comments")?;
        let comments = comment_list(
            value
                .pointer("/new_comments/data/CommentList3/Comments")
                .or_else(|| value.pointer("/new_comments/data/CommentList/Comments")),
        );
        let hot_comments = comment_list(value.pointer("/hot_comments/data/CommentList/Comments"));
        let total = value
            .pointer("/count/data/response_list/0/count")
            .and_then(Value::as_u64)
            .or_else(|| value.pointer("/new_comments/data/TotalCmNum").and_then(Value::as_u64))
            .unwrap_or((comments.len() + hot_comments.len()) as u64);
        let hot_total = value
            .pointer("/hot_comments/data/CommentList/Total")
            .and_then(Value::as_u64)
            .unwrap_or(hot_comments.len() as u64);
        Ok(SongCommentsResp {
            song_id: song_id.to_string(),
            total,
            hot_total,
            comments,
            hot_comments,
            has_more: value
                .pointer("/new_comments/data/CommentList/HasMore")
                .and_then(Value::as_u64)
                .unwrap_or(0)
                > 0,
        })
    }

    async fn quality_source(
        &self,
        songmid: &str,
        song_id: Option<&str>,
        media_mid: Option<&str>,
    ) -> Result<QualitySource, AppError> {
        let track = self.song_detail(songmid, song_id).await.unwrap_or(Value::Null);
        let file = track.get("file").cloned().unwrap_or(Value::Null);
        let media_mid = media_mid
            .filter(|value| !value.trim().is_empty())
            .map(str::to_string)
            .or_else(|| str_at(&file, &["media_mid", "mediaMid"]).map(str::to_string))
            .unwrap_or_else(|| songmid.to_string());
        Ok(QualitySource { media_mid, file })
    }

    async fn song_detail(&self, songmid: &str, song_id: Option<&str>) -> Result<Value, AppError> {
        let song_id_value = song_id
            .filter(|value| !value.trim().is_empty())
            .and_then(|value| value.parse::<u64>().ok())
            .unwrap_or(0);
        let body = json!({
            "comm": { "ct": 24, "cv": 0 },
            "songinfo": {
                "method": "get_song_detail_yqq",
                "module": "music.pf_song_detail_svr",
                "param": {
                    "song_type": 0,
                    "song_mid": songmid,
                    "song_id": song_id_value,
                }
            }
        });
        let data = self.qq(self.client.post(MUSICU).json(&body), None).await?;
        data.pointer("/songinfo/data/track_info")
            .cloned()
            .ok_or_else(|| AppError::NotFound("song detail not found".into()))
    }

    async fn try_quality_url(
        &self,
        songmid: &str,
        media_mid: &str,
        quality: AudioQualityId,
        cookie_header: Option<&str>,
    ) -> Result<Option<String>, AppError> {
        let filenames = quality_filenames(quality, media_mid);
        let songmids = vec![songmid; filenames.len()];
        let songtypes = vec![0_u8; filenames.len()];
        let uin = cookie_header
            .and_then(qq_login_uin_from_cookie)
            .unwrap_or_else(|| "0".to_string());
        let body = json!({
            "req_1": {
                "module": "vkey.GetVkeyServer",
                "method": "CgiGetVkey",
                "param": {
                    "filename": filenames,
                    "guid": "10000",
                    "songmid": songmids,
                    "songtype": songtypes,
                    "uin": uin,
                    "loginflag": 1,
                    "platform": "20"
                }
            },
            "loginUin": uin,
            "comm": { "uin": uin, "format": "json", "ct": 24, "cv": 0 }
        });
        let data = self.qq(self.client.post(MUSICU).json(&body), cookie_header).await?;
        let sip = data
            .pointer("/req_1/data/sip/0")
            .and_then(Value::as_str)
            .unwrap_or("https://dl.stream.qqmusic.qq.com/");
        let Some(items) = data.pointer("/req_1/data/midurlinfo").and_then(Value::as_array) else {
            return Ok(None);
        };
        for item in items {
            if item.get("result").and_then(Value::as_i64).unwrap_or(-1) != 0 {
                continue;
            }
            if let Some(purl) = item
                .get("purl")
                .and_then(Value::as_str)
                .filter(|value| !value.trim().is_empty())
            {
                return Ok(Some(format!("{sip}{purl}")));
            }
        }
        Ok(None)
    }

    pub async fn lyric(&self, songmid: &str, cookie_header: Option<&str>) -> Result<String, AppError> {
        let url = format!(
            "https://i.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid={songmid}&g_tk=5381&format=json&inCharset=utf8&outCharset=utf-8&nobase64=1"
        );
        let data = self.qq(self.client.get(url), cookie_header).await?;
        Ok(data.get("lyric").and_then(Value::as_str).unwrap_or("").to_string())
    }

    pub async fn lyrics(&self, songmid: &str, lookup: Option<LyricLookup>, cookie_header: Option<&str>) -> LyricsResp {
        if let Some(lookup) = lookup {
            match self.qrc_lyrics(songmid, &lookup, cookie_header).await {
                Ok(resp) if !resp.lines.is_empty() => return resp,
                Ok(_) => debug!(songmid, "qq-music qrc lyrics empty, falling back to lrc"),
                Err(error) => debug!(songmid, %error, "qq-music qrc lyrics failed, falling back to lrc"),
            }
        }

        self.lrc_lyrics(songmid, cookie_header).await
    }

    async fn qrc_lyrics(
        &self,
        songmid: &str,
        lookup: &LyricLookup,
        cookie_header: Option<&str>,
    ) -> Result<LyricsResp, AppError> {
        let song_id = lookup
            .song_id
            .trim()
            .parse::<u64>()
            .map_err(|_| AppError::bad_request("songId must be numeric for qrc lyrics"))?;
        if lookup.title.trim().is_empty() || lookup.duration_ms == 0 {
            return Err(AppError::bad_request(
                "title and durationMs are required for qrc lyrics",
            ));
        }

        let param = json!({
            "albumName": BASE64.encode(lookup.album.as_bytes()),
            "crypt": 1,
            "ct": 19,
            "cv": 2111,
            "interval": lookup.duration_ms / 1000,
            "lrc_t": 0,
            "qrc": 1,
            "qrc_t": 0,
            "roma": 1,
            "roma_t": 0,
            "singerName": BASE64.encode(lookup.artist.as_bytes()),
            "songID": song_id,
            "songName": BASE64.encode(lookup.title.as_bytes()),
            "trans": 1,
            "trans_t": 0,
            "type": 0,
        });
        let data = self
            .musicu_lyric_request(
                "GetPlayLyricInfo",
                "music.musichallSong.PlayLyricInfo",
                param,
                cookie_header,
            )
            .await?;

        let encrypted = data
            .get("lyric")
            .and_then(Value::as_str)
            .filter(|value| !value.trim().is_empty())
            .ok_or_else(|| AppError::NotFound("qrc lyric is empty".into()))?;
        let lyric_timestamp_exists = timestamp_nonzero(data.get("qrc_t")).unwrap_or(false)
            || timestamp_nonzero(data.get("lrc_t")).unwrap_or(false);
        if !lyric_timestamp_exists {
            return Err(AppError::NotFound("qrc lyric timestamp is empty".into()));
        }

        let decrypted = qrc::decrypt_cloud_qrc(encrypted)
            .map_err(|error| AppError::internal(format!("qrc decrypt failed: {error}")))?;
        let lines = qrc::parse_qrc_lines(&decrypted);
        if lines.is_empty() {
            return Err(AppError::NotFound("qrc lyric has no timed lines".into()));
        }

        Ok(LyricsResp {
            songmid: songmid.to_string(),
            source: LyricSource::Qrc,
            lyric: qrc::lines_to_lrc(&lines),
            lines,
        })
    }

    async fn lrc_lyrics(&self, songmid: &str, cookie_header: Option<&str>) -> LyricsResp {
        let lyric = self.lyric(songmid, cookie_header).await.unwrap_or_default();
        let lines = qrc::parse_lrc_lines(&lyric);
        let source = if lyric.trim().is_empty() {
            LyricSource::None
        } else {
            LyricSource::Lrc
        };
        LyricsResp {
            songmid: songmid.to_string(),
            source,
            lyric,
            lines,
        }
    }

    async fn musicu_lyric_request(
        &self,
        method: &str,
        module: &str,
        param: Value,
        cookie_header: Option<&str>,
    ) -> Result<Value, AppError> {
        let session = self
            .lyric_session
            .get_or_try_init(|| async { self.fetch_lyric_session(cookie_header).await })
            .await?;
        let comm = lyric_comm(Some(session));
        self.post_musicu_lyric(comm, method, module, param, cookie_header).await
    }

    async fn fetch_lyric_session(&self, cookie_header: Option<&str>) -> Result<LyricSession, AppError> {
        let data = self
            .post_musicu_lyric(
                lyric_comm(None),
                "GetSession",
                "music.getSession.session",
                json!({ "caller": 0, "uid": "0", "vkey": 0 }),
                cookie_header,
            )
            .await?;
        let session = data.get("session").ok_or_else(|| AppError::Upstream {
            status: StatusCode::BAD_GATEWAY,
            body: "missing qq lyric session".into(),
        })?;
        Ok(LyricSession {
            uid: string_or_number(session.get("uid")).unwrap_or_else(|| "0".to_string()),
            sid: str_at(session, &["sid"]).unwrap_or("").to_string(),
            userip: str_at(session, &["userip"]).unwrap_or("").to_string(),
        })
    }

    async fn post_musicu_lyric(
        &self,
        comm: Value,
        method: &str,
        module: &str,
        param: Value,
        cookie_header: Option<&str>,
    ) -> Result<Value, AppError> {
        let body = json!({
            "comm": comm,
            "request": {
                "method": method,
                "module": module,
                "param": param,
            },
        });
        let mut builder = self
            .client
            .post(MUSICU)
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::USER_AGENT, "okhttp/3.14.9")
            .body(body.to_string());
        if let Some(cookie) = cookie_header.filter(|value| !value.trim().is_empty()) {
            builder = builder.header(header::COOKIE, cookie);
        } else {
            builder = builder.header(header::COOKIE, "tmeLoginType=-1;");
        }

        let resp = builder.send().await?;
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        if !status.is_success() {
            return Err(AppError::Upstream {
                status: StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::BAD_GATEWAY),
                body: text,
            });
        }

        let data: Value = serde_json::from_str(&text)?;
        let root_code = data.get("code").and_then(Value::as_i64).unwrap_or(-1);
        let request_code = data.pointer("/request/code").and_then(Value::as_i64).unwrap_or(-1);
        if root_code != 0 || request_code != 0 {
            return Err(AppError::Upstream {
                status: StatusCode::BAD_GATEWAY,
                body: text,
            });
        }
        data.pointer("/request/data")
            .cloned()
            .ok_or_else(|| AppError::Upstream {
                status: StatusCode::BAD_GATEWAY,
                body: "missing qq lyric response data".into(),
            })
    }

    pub fn audio_request(&self, url: &str) -> RequestBuilder {
        self.with_qq_headers(self.client.get(url), None)
    }

    pub fn image_request(&self, url: &str) -> RequestBuilder {
        self.with_qq_headers(self.client.get(url), None)
    }

    fn with_qq_headers(&self, mut builder: RequestBuilder, cookie_header: Option<&str>) -> RequestBuilder {
        builder = builder
            .header(header::REFERER, REFERER)
            .header(header::ORIGIN, ORIGIN)
            .header(header::USER_AGENT, USER_AGENT);
        if let Some(cookie) = cookie_header.filter(|value| !value.trim().is_empty()) {
            builder = builder.header(header::COOKIE, cookie);
        }
        builder
    }

    async fn qq(&self, builder: RequestBuilder, cookie_header: Option<&str>) -> Result<Value, AppError> {
        let resp = self.with_qq_headers(builder, cookie_header).send().await?;
        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(AppError::Upstream {
                status: StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::BAD_GATEWAY),
                body,
            });
        }
        Ok(resp.json::<Value>().await?)
    }
}

fn lyric_comm(session: Option<&LyricSession>) -> Value {
    let mut comm = json!({
        "ct": 11,
        "cv": "1003006",
        "v": "1003006",
        "os_ver": "15",
        "phonetype": "24122RKC7C",
        "rom": "Redmi/miro/miro:15/AE3A.240806.005/OS2.0.105.0.VOMCNXM:user/release-keys",
        "tmeAppID": "qqmusiclight",
        "nettype": "NETWORK_WIFI",
        "udid": "0",
    });
    if let Some(session) = session {
        comm["uid"] = Value::String(session.uid.clone());
        comm["sid"] = Value::String(session.sid.clone());
        comm["userip"] = Value::String(session.userip.clone());
    }
    comm
}

fn timestamp_nonzero(value: Option<&Value>) -> Option<bool> {
    let value = value?;
    if let Some(number) = value.as_i64() {
        return Some(number != 0);
    }
    if let Some(text) = value.as_str() {
        return Some(text != "0" && !text.trim().is_empty());
    }
    None
}

fn string_or_number(value: Option<&Value>) -> Option<String> {
    let value = value?;
    if let Some(text) = value.as_str() {
        return Some(text.to_string());
    }
    value.as_i64().map(|number| number.to_string())
}

struct QualitySource {
    media_mid: String,
    file: Value,
}

impl QualitySource {
    fn minimal(songmid: &str) -> Self {
        Self {
            media_mid: songmid.to_string(),
            file: Value::Null,
        }
    }
}

fn quality_fallbacks(quality: AudioQualityId) -> Vec<AudioQualityId> {
    match quality {
        AudioQualityId::Master => vec![
            AudioQualityId::Master,
            AudioQualityId::Sq,
            AudioQualityId::Hq,
            AudioQualityId::Standard,
        ],
        AudioQualityId::Sq => vec![AudioQualityId::Sq, AudioQualityId::Hq, AudioQualityId::Standard],
        AudioQualityId::Hq => vec![AudioQualityId::Hq, AudioQualityId::Standard],
        AudioQualityId::Standard => vec![AudioQualityId::Standard],
    }
}

fn quality_filenames(quality: AudioQualityId, media_mid: &str) -> Vec<String> {
    match quality {
        AudioQualityId::Standard => vec![format!("M500{media_mid}{media_mid}.mp3")],
        AudioQualityId::Hq => vec![format!("M800{media_mid}{media_mid}.mp3")],
        AudioQualityId::Sq => vec![format!("F000{media_mid}{media_mid}.flac")],
        AudioQualityId::Master => vec![
            format!("AI00{media_mid}{media_mid}.flac"),
            format!("RS01{media_mid}{media_mid}.flac"),
        ],
    }
}

fn quality_size(file: &Value, quality: AudioQualityId) -> u64 {
    match quality {
        AudioQualityId::Standard => number_at(file, &["size_128mp3", "size128mp3"]),
        AudioQualityId::Hq => number_at(file, &["size_320mp3", "size320mp3"]).or_else(|| size_new_at(file, 3)),
        AudioQualityId::Sq => number_at(file, &["size_flac", "sizeFlac"]).or_else(|| size_new_at(file, 5)),
        AudioQualityId::Master => number_at(file, &["size_hires", "sizeHires"]).or_else(|| size_new_at(file, 0)),
    }
    .unwrap_or(0)
}

fn size_new_at(file: &Value, index: usize) -> Option<u64> {
    file.get("size_new")
        .and_then(Value::as_array)
        .and_then(|items| items.get(index))
        .and_then(Value::as_u64)
        .filter(|value| *value > 0)
}

fn comment_list(value: Option<&Value>) -> Vec<SongCommentDto> {
    value
        .and_then(Value::as_array)
        .map(|items| items.iter().map(convert_comment).collect())
        .unwrap_or_default()
}

fn convert_comment(item: &Value) -> SongCommentDto {
    let content = str_at(item, &["rootcommentcontent", "commentcontent", "Content"])
        .unwrap_or("")
        .to_string();
    let replies = item
        .get("middlecommentcontent")
        .or_else(|| item.get("SubComments"))
        .and_then(Value::as_array)
        .map(|items| items.iter().map(convert_comment_reply).collect())
        .unwrap_or_default();
    SongCommentDto {
        id: str_at(item, &["rootcommentid", "commentid", "CmId", "SeqNo"])
            .unwrap_or("")
            .to_string(),
        nick: str_at(item, &["nick", "rootcommentnick", "Nick"])
            .unwrap_or("")
            .trim_start_matches('@')
            .to_string(),
        avatar_url: str_at(item, &["avatarurl", "Avatar"]).unwrap_or("").to_string(),
        content,
        like_count: number_at(item, &["praisenum", "likecount", "PraiseNum"]).unwrap_or(0),
        published_at: number_at(item, &["time", "PubTime"]).unwrap_or(0),
        location: str_at(item, &["iplocation", "location", "IPLocation", "Location"])
            .unwrap_or("")
            .to_string(),
        vip_icon: str_at(item, &["vipicon", "VipIcon"]).unwrap_or("").to_string(),
        identity_icon: str_at(item, &["identity_pic", "root_identity_pic", "IdentityPic"])
            .unwrap_or("")
            .to_string(),
        is_hot: number_at(item, &["is_hot", "is_hot_cmt", "HotScore"]).unwrap_or(0) > 0,
        replies,
    }
}

fn convert_comment_reply(item: &Value) -> SongCommentReplyDto {
    SongCommentReplyDto {
        id: str_at(item, &["subcommentid", "CmId", "SeqNo"])
            .unwrap_or("")
            .to_string(),
        nick: str_at(item, &["replynick", "Nick"])
            .unwrap_or("")
            .trim_start_matches('@')
            .to_string(),
        content: str_at(item, &["subcommentcontent", "Content"])
            .unwrap_or("")
            .to_string(),
        like_count: number_at(item, &["praisenum", "likecount", "PraiseNum"]).unwrap_or(0),
    }
}

pub fn qq_uin_from_cookie(cookie_header: &str) -> Option<String> {
    let mut wxuin = None;
    for part in cookie_header.split(';') {
        let Some((name, value)) = part.trim().split_once('=') else {
            continue;
        };
        let value = value.trim();
        match name.trim() {
            "uin" if !value.is_empty() => return Some(value.to_string()),
            "wxuin" if !value.is_empty() => wxuin = Some(value.to_string()),
            _ => {}
        }
    }
    wxuin.map(|value| {
        if let Some(rest) = value.strip_prefix('o') {
            format!("1{rest}")
        } else {
            format!("1{value}")
        }
    })
}

fn qq_login_uin_from_cookie(cookie_header: &str) -> Option<String> {
    qq_uin_from_cookie(cookie_header).map(|uin| {
        uin.strip_prefix('o')
            .unwrap_or(&uin)
            .trim_start_matches('0')
            .to_string()
    })
}

pub fn cookie_hint(cookie_header: &str) -> Option<String> {
    qq_uin_from_cookie(cookie_header).map(|uin| {
        let suffix = uin
            .chars()
            .rev()
            .take(4)
            .collect::<String>()
            .chars()
            .rev()
            .collect::<String>();
        format!("uin ****{suffix}")
    })
}

fn convert_song(item: &Value) -> SongDto {
    let songmid = str_at(item, &["mid", "songmid", "song_mid"]).unwrap_or("").to_string();
    let file = item.get("file").unwrap_or(&Value::Null);
    let media_mid = str_at(file, &["media_mid", "mediaMid"])
        .or_else(|| str_at(item, &["media_mid", "mediaMid"]))
        .unwrap_or("")
        .to_string();
    let song_id = number_at(item, &["id", "songid", "song_id"])
        .map(|value| value.to_string())
        .or_else(|| str_at(item, &["id", "songid", "song_id"]).map(str::to_string))
        .unwrap_or_default();
    let title = str_at(item, &["name", "songname", "title"])
        .unwrap_or("Unknown")
        .to_string();
    let album = item
        .get("album")
        .and_then(|album| str_at(album, &["name", "title"]))
        .or_else(|| str_at(item, &["albumname", "album_name"]))
        .unwrap_or("")
        .to_string();
    let album_mid = item
        .get("album")
        .and_then(|album| str_at(album, &["mid", "albummid"]))
        .or_else(|| str_at(item, &["albummid", "album_mid"]))
        .unwrap_or("")
        .to_string();
    let artist = item
        .get("singer")
        .and_then(Value::as_array)
        .map(|singers| {
            singers
                .iter()
                .filter_map(|singer| str_at(singer, &["name"]))
                .collect::<Vec<_>>()
                .join(" / ")
        })
        .filter(|value| !value.is_empty())
        .or_else(|| str_at(item, &["singername", "artist"]).map(str::to_string))
        .unwrap_or_default();
    let duration_ms = number_at(item, &["interval", "duration"])
        .map(|value| if value < 100_000 { value * 1000 } else { value })
        .unwrap_or(0);
    let vip = item.pointer("/pay/pay_play").and_then(Value::as_u64).unwrap_or(0) > 0;
    let artwork_url = if album_mid.is_empty() {
        String::new()
    } else {
        format!("https://y.gtimg.cn/music/photo_new/T002R300x300M000{album_mid}.jpg?max_age=2592000")
    };
    SongDto {
        id: format!("qqtrack_{songmid}"),
        song_id,
        songmid: songmid.clone(),
        media_mid,
        title,
        artist,
        album,
        album_mid,
        duration_ms,
        artwork_url,
        source_url: format!("https://y.qq.com/n/ryqq/songDetail/{songmid}"),
        vip,
        playable: !songmid.is_empty(),
        size_128_mp3: quality_size(file, AudioQualityId::Standard),
        size_320_mp3: quality_size(file, AudioQualityId::Hq),
        size_flac: quality_size(file, AudioQualityId::Sq),
        size_master: quality_size(file, AudioQualityId::Master),
    }
}

fn convert_search_playlist(item: &Value) -> PlaylistDto {
    let id = str_at(item, &["dissid", "tid", "id"]).unwrap_or("").to_string();
    PlaylistDto {
        id: format!("qqplaylist_{id}"),
        title: str_at(item, &["dissname", "title"])
            .unwrap_or("QQ Music Playlist")
            .to_string(),
        author: item
            .get("creator")
            .and_then(|creator| str_at(creator, &["name", "nick"]))
            .unwrap_or("")
            .to_string(),
        cover_img_url: str_at(item, &["imgurl", "logo", "cover"]).unwrap_or("").to_string(),
        source_url: format!("https://y.qq.com/n/ryqq/playlist/{id}"),
        count: number_at(item, &["song_count", "songnum", "count"]).unwrap_or(0) as u32,
    }
}

fn convert_recommend_playlist(item: &Value) -> PlaylistDto {
    let id = str_at(item, &["content_id", "dissid", "tid", "id"])
        .or_else(|| item.get("content_id").and_then(Value::as_u64).map(|_| ""))
        .unwrap_or("");
    let id_value = if id.is_empty() {
        item.get("content_id")
            .and_then(Value::as_u64)
            .map(|value| value.to_string())
            .unwrap_or_default()
    } else {
        id.to_string()
    };
    PlaylistDto {
        id: format!("qqplaylist_{id_value}"),
        title: str_at(item, &["title", "dissname"])
            .unwrap_or("QQ Music Playlist")
            .to_string(),
        author: str_at(item, &["username", "creator_name", "author"])
            .unwrap_or("QQ音乐")
            .to_string(),
        cover_img_url: str_at(item, &["cover", "cover_url_big", "picurl", "imgurl"])
            .unwrap_or("")
            .to_string(),
        source_url: format!("https://y.qq.com/n/ryqq/playlist/{id_value}"),
        count: number_at(item, &["listen_num", "song_count", "count"]).unwrap_or(0) as u32,
    }
}

fn convert_user_created_playlist(item: &Value) -> Option<PlaylistDto> {
    if number_at(item, &["tid"]).unwrap_or(0) == 0 {
        return None;
    }
    let dir_show = number_at(item, &["dir_show"]).unwrap_or(1);
    let name = str_at(item, &["diss_name"]).unwrap_or("");
    if dir_show == 0 && name != "我喜欢" {
        return None;
    }
    let id = number_at(item, &["tid"]).unwrap_or(0).to_string();
    let cover = if name == "我喜欢" {
        "https://y.gtimg.cn/mediastyle/y/img/cover_love_300.jpg"
    } else {
        str_at(item, &["diss_cover"]).unwrap_or("")
    };
    Some(PlaylistDto {
        id: format!("qqplaylist_{id}"),
        title: name.to_string(),
        author: String::new(),
        cover_img_url: cover.to_string(),
        source_url: format!("https://y.qq.com/n/ryqq/playlist/{id}"),
        count: number_at(item, &["song_cnt", "song_count"]).unwrap_or(0) as u32,
    })
}

fn convert_user_favorite_playlist(item: &Value) -> Option<PlaylistDto> {
    if number_at(item, &["dir_show"]).unwrap_or(1) == 0 {
        return None;
    }
    let id = str_at(item, &["dissid"])
        .map(str::to_string)
        .or_else(|| number_at(item, &["dissid"]).map(|value| value.to_string()))?;
    Some(PlaylistDto {
        id: format!("qqplaylist_{id}"),
        title: str_at(item, &["dissname"]).unwrap_or("QQ Music Playlist").to_string(),
        author: String::new(),
        cover_img_url: str_at(item, &["logo"]).unwrap_or("").to_string(),
        source_url: format!("https://y.qq.com/n/ryqq/playlist/{id}"),
        count: number_at(item, &["song_cnt", "song_count"]).unwrap_or(0) as u32,
    })
}

fn clean_playlist_id(id: &str) -> String {
    id.strip_prefix("qqplaylist_").unwrap_or(id).to_string()
}

fn str_at<'a>(value: &'a Value, keys: &[&str]) -> Option<&'a str> {
    keys.iter().find_map(|key| value.get(*key).and_then(Value::as_str))
}

fn number_at(value: &Value, keys: &[&str]) -> Option<u64> {
    keys.iter().find_map(|key| {
        value.get(*key).and_then(|item| {
            item.as_u64()
                .or_else(|| item.as_str().and_then(|raw| raw.parse::<u64>().ok()))
        })
    })
}

fn values_to_strings(value: Option<&Value>) -> Vec<String> {
    match value {
        Some(Value::Array(items)) => items.iter().filter_map(value_to_string).collect(),
        Some(Value::Object(items)) => {
            let mut keyed = items
                .iter()
                .filter_map(|(key, value)| key.parse::<usize>().ok().zip(value_to_string(value)))
                .collect::<Vec<_>>();
            keyed.sort_by_key(|(index, _)| *index);
            keyed.into_iter().map(|(_, item)| item).collect()
        }
        Some(value) => value_to_string(value).into_iter().collect(),
        None => Vec::new(),
    }
}

fn value_to_string(value: &Value) -> Option<String> {
    value
        .as_str()
        .map(str::to_string)
        .or_else(|| value.as_u64().map(|item| item.to_string()))
        .or_else(|| value.as_i64().map(|item| item.to_string()))
}

fn ensure_qq_ok(value: &Value, action: &str) -> Result<(), AppError> {
    match value.get("code").and_then(Value::as_i64).unwrap_or(0) {
        0 => Ok(()),
        1000 => Err(AppError::Unauthorized("QQ Music is not logged in".into())),
        _ => Err(AppError::Upstream {
            status: StatusCode::BAD_GATEWAY,
            body: format!(
                "{action} failed: {}",
                value
                    .get("msg")
                    .and_then(Value::as_str)
                    .unwrap_or("unknown QQ Music error")
            ),
        }),
    }
}

fn percent_encode(input: &str) -> String {
    input
        .bytes()
        .flat_map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => vec![byte as char],
            _ => {
                let hex = format!("%{byte:02X}");
                hex.chars().collect()
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{
        AudioQualityId, convert_comment, convert_song, qq_login_uin_from_cookie, qq_uin_from_cookie, quality_filenames,
        quality_size,
    };
    use serde_json::json;

    #[test]
    fn parses_uin_cookie() {
        assert_eq!(
            qq_uin_from_cookie("foo=bar; uin=o123456; other=x").as_deref(),
            Some("o123456")
        );
    }

    #[test]
    fn converts_wxuin_cookie_like_listen1() {
        assert_eq!(qq_uin_from_cookie("wxuin=o123456").as_deref(), Some("1123456"));
    }

    #[test]
    fn converts_qq_login_uin_for_vkey() {
        assert_eq!(
            qq_login_uin_from_cookie("foo=bar; uin=o00123456; other=x").as_deref(),
            Some("123456")
        );
    }

    #[test]
    fn builds_quality_filenames_from_media_mid() {
        assert_eq!(
            quality_filenames(AudioQualityId::Hq, "002E2qmX4TovcC"),
            vec!["M800002E2qmX4TovcC002E2qmX4TovcC.mp3"]
        );
        assert_eq!(
            quality_filenames(AudioQualityId::Master, "002E2qmX4TovcC"),
            vec![
                "AI00002E2qmX4TovcC002E2qmX4TovcC.flac",
                "RS01002E2qmX4TovcC002E2qmX4TovcC.flac"
            ]
        );
    }

    #[test]
    fn reads_quality_sizes_from_qq_file_payload() {
        let file = json!({
            "media_mid": "002E2qmX4TovcC",
            "size_128mp3": 4_216_943,
            "size_320mp3": 10_432_933,
            "size_flac": 59_173_376,
            "size_new": [182_812_770, 0, 0, 10_432_933, 0, 59_173_376]
        });
        assert_eq!(quality_size(&file, AudioQualityId::Standard), 4_216_943);
        assert_eq!(quality_size(&file, AudioQualityId::Hq), 10_432_933);
        assert_eq!(quality_size(&file, AudioQualityId::Sq), 59_173_376);
        assert_eq!(quality_size(&file, AudioQualityId::Master), 182_812_770);
    }

    #[test]
    fn converts_song_quality_metadata() {
        let song = convert_song(&json!({
            "mid": "0037vqfJ0s0Zlq",
            "id": 569717827,
            "name": "天下识君",
            "singer": [{"name": "王朝1982"}],
            "album": {"name": "天下识君", "mid": "0030"},
            "interval": 248,
            "file": {
                "media_mid": "002E2qmX4TovcC",
                "size_128mp3": 4216943,
                "size_320mp3": 10432933,
                "size_flac": 59173376,
                "size_new": [182812770]
            }
        }));
        assert_eq!(song.media_mid, "002E2qmX4TovcC");
        assert_eq!(song.size_128_mp3, 4216943);
        assert_eq!(song.size_320_mp3, 10432933);
        assert_eq!(song.size_flac, 59173376);
        assert_eq!(song.size_master, 182812770);
    }

    #[test]
    fn converts_comment_payload() {
        let comment = convert_comment(&json!({
            "rootcommentid": "root-1",
            "rootcommentnick": "@流浪的蛙蛙",
            "rootcommentcontent": "打卡！[em]x[/em] 期待",
            "praisenum": 417,
            "time": 1766816968,
            "avatarurl": "https://example.test/avatar.jpg",
            "vipicon": "https://example.test/vip.png",
            "iplocation": "江苏",
            "is_hot": 1,
            "middlecommentcontent": [{
                "subcommentid": "sub-1",
                "replynick": "@QQ音乐",
                "subcommentcontent": "欢迎",
                "praisenum": 2
            }]
        }));
        assert_eq!(comment.id, "root-1");
        assert_eq!(comment.nick, "流浪的蛙蛙");
        assert_eq!(comment.like_count, 417);
        assert!(comment.is_hot);
        assert_eq!(comment.replies[0].nick, "QQ音乐");
    }

    #[test]
    fn converts_musicu_comment_payload() {
        let comment = convert_comment(&json!({
            "CmId": "root-2",
            "Nick": "流浪的蛙蛙",
            "Content": "打卡！🐸🐸🐸🐸",
            "PraiseNum": 417,
            "PubTime": 1742957316,
            "Avatar": "https://example.test/avatar.jpg",
            "IdentityPic": "https://example.test/identity.png",
            "SubComments": [{
                "CmId": "sub-2",
                "Nick": "腾驹摘陌上的星辰",
                "Content": "哇蛙蛙！！！",
                "PraiseNum": 7
            }]
        }));
        assert_eq!(comment.id, "root-2");
        assert_eq!(comment.nick, "流浪的蛙蛙");
        assert_eq!(comment.content, "打卡！🐸🐸🐸🐸");
        assert_eq!(comment.like_count, 417);
        assert_eq!(comment.published_at, 1742957316);
        assert_eq!(comment.replies[0].nick, "腾驹摘陌上的星辰");
        assert_eq!(comment.replies[0].like_count, 7);
    }
}
