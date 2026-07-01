//! Generates TypeScript bindings to ui/src/generated/rust-types/.

use std::{
    fs,
    path::{Path, PathBuf},
};

use tokimo_app_qq_music::types::{
    AuthStatusResp, LikeSongResp, LikedSongsResp, LyricsResp, MyPlaylistsResp, PlaylistDetailResp, PlaylistDto,
    RecommendPlaylistsResp, SaveCookieReq, SearchResp, SongDto, UserDto,
};
use ts_rs::{Config, TS};

#[test]
fn export_bindings() {
    let cfg = Config::new().with_large_int("number");
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("ui/src/generated/rust-types");
    fs::create_dir_all(&dir).expect("create generated bindings directory");

    write_binding::<SongDto>(&cfg, &dir, "SongDto.ts");
    write_binding::<PlaylistDto>(&cfg, &dir, "PlaylistDto.ts");
    write_binding::<UserDto>(&cfg, &dir, "UserDto.ts");
    write_binding::<AuthStatusResp>(&cfg, &dir, "AuthStatusResp.ts");
    write_binding::<SaveCookieReq>(&cfg, &dir, "SaveCookieReq.ts");
    write_binding::<SearchResp>(&cfg, &dir, "SearchResp.ts");
    write_binding::<PlaylistDetailResp>(&cfg, &dir, "PlaylistDetailResp.ts");
    write_binding::<MyPlaylistsResp>(&cfg, &dir, "MyPlaylistsResp.ts");
    write_binding::<LikedSongsResp>(&cfg, &dir, "LikedSongsResp.ts");
    write_binding::<LikeSongResp>(&cfg, &dir, "LikeSongResp.ts");
    write_binding::<RecommendPlaylistsResp>(&cfg, &dir, "RecommendPlaylistsResp.ts");
    write_binding::<LyricsResp>(&cfg, &dir, "LyricsResp.ts");

    fs::write(
        dir.join("index.ts"),
        [
            "export type { AuthStatusResp } from \"./AuthStatusResp\";",
            "export type { LikedSongsResp } from \"./LikedSongsResp\";",
            "export type { LikeSongResp } from \"./LikeSongResp\";",
            "export type { LyricsResp } from \"./LyricsResp\";",
            "export type { MyPlaylistsResp } from \"./MyPlaylistsResp\";",
            "export type { PlaylistDetailResp } from \"./PlaylistDetailResp\";",
            "export type { PlaylistDto } from \"./PlaylistDto\";",
            "export type { RecommendPlaylistsResp } from \"./RecommendPlaylistsResp\";",
            "export type { SaveCookieReq } from \"./SaveCookieReq\";",
            "export type { SearchResp } from \"./SearchResp\";",
            "export type { SongDto } from \"./SongDto\";",
            "export type { UserDto } from \"./UserDto\";",
            "",
        ]
        .join("\n"),
    )
    .expect("write generated bindings index");
}

fn write_binding<T: TS + 'static>(cfg: &Config, dir: &Path, file_name: &str) {
    let contents = T::export_to_string(cfg).expect("render TypeScript binding");
    fs::write(dir.join(file_name), contents).expect("write TypeScript binding");
}
