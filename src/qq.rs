use std::collections::HashMap;

use axum::http::StatusCode;
use reqwest::{Client, RequestBuilder, header};
use serde_json::{Value, json};

use crate::{
    error::AppError,
    types::{PlaylistDetailResp, PlaylistDto, RecommendPlaylistsResp, SearchResp, SongDto, UserDto},
};

const MUSICU: &str = "https://u.y.qq.com/cgi-bin/musicu.fcg";
const REFERER: &str = "https://y.qq.com/";
const ORIGIN: &str = "https://y.qq.com";
const USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/72.0.3626.119 Safari/537.36";

#[derive(Clone)]
pub struct QqClient {
    client: Client,
}

impl QqClient {
    pub fn new() -> anyhow::Result<Self> {
        let client = Client::builder()
            .user_agent(USER_AGENT)
            .redirect(reqwest::redirect::Policy::limited(10))
            .build()
            .map_err(|error| anyhow::anyhow!("reqwest build: {error}"))?;
        Ok(Self { client })
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

    pub async fn audio_url(&self, songmid: &str, cookie_header: Option<&str>) -> Result<String, AppError> {
        let uin = cookie_header
            .and_then(qq_uin_from_cookie)
            .unwrap_or_else(|| "0".to_string());
        let file = format!("M500{songmid}{songmid}.mp3");
        let body = json!({
            "req_1": {
                "module": "vkey.GetVkeyServer",
                "method": "CgiGetVkey",
                "param": {
                    "filename": [file],
                    "guid": "10000",
                    "songmid": [songmid],
                    "songtype": [0],
                    "uin": uin,
                    "loginflag": 1,
                    "platform": "20"
                }
            },
            "loginUin": uin,
            "comm": { "uin": uin, "format": "json", "ct": 24, "cv": 0 }
        });
        let data = self.qq(self.client.post(MUSICU).json(&body), cookie_header).await?;
        let purl = data
            .pointer("/req_1/data/midurlinfo/0/purl")
            .and_then(Value::as_str)
            .unwrap_or("");
        if purl.is_empty() {
            return Err(AppError::NotFound("track is not playable from QQ Music".into()));
        }
        let sip = data
            .pointer("/req_1/data/sip/0")
            .and_then(Value::as_str)
            .unwrap_or("https://dl.stream.qqmusic.qq.com/");
        Ok(format!("{sip}{purl}"))
    }

    pub async fn lyric(&self, songmid: &str, cookie_header: Option<&str>) -> Result<String, AppError> {
        let url = format!(
            "https://i.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid={songmid}&g_tk=5381&format=json&inCharset=utf8&outCharset=utf-8&nobase64=1"
        );
        let data = self.qq(self.client.get(url), cookie_header).await?;
        Ok(data.get("lyric").and_then(Value::as_str).unwrap_or("").to_string())
    }

    pub fn audio_request(&self, url: &str) -> RequestBuilder {
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
        title,
        artist,
        album,
        album_mid,
        duration_ms,
        artwork_url,
        source_url: format!("https://y.qq.com/n/ryqq/songDetail/{songmid}"),
        vip,
        playable: !songmid.is_empty(),
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
                .filter_map(|(key, value)| {
                    key.parse::<usize>()
                        .ok()
                        .and_then(|index| value_to_string(value).map(|item| (index, item)))
                })
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
    use super::qq_uin_from_cookie;

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
}
