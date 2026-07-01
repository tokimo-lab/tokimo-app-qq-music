pub mod app_server;
pub mod assets;
pub mod error;
pub mod handlers;
pub mod openapi_client;
pub mod qq;
pub mod qrc;
pub mod types;

pub const MANIFEST: &str = include_str!("../tokimo-app.toml");
