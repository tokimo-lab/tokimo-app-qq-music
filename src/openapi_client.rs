use std::time::Duration;

use reqwest::{Client, Method, RequestBuilder, StatusCode};
use serde::{Serialize, de::DeserializeOwned};

use crate::error::AppError;

pub struct OpenApiClient {
    base_url: String,
    client: Client,
}

impl OpenApiClient {
    pub fn from_env() -> anyhow::Result<Self> {
        let base_url = std::env::var("TOKIMO_SERVER_URL")
            .unwrap_or_else(|_| "http://127.0.0.1:5678".to_string())
            .trim_end_matches('/')
            .to_string();
        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .user_agent("tokimo-app-qq-music/0.1.0")
            .build()
            .map_err(|error| anyhow::anyhow!("reqwest build: {error}"))?;
        Ok(Self { base_url, client })
    }

    fn url(&self, path: &str) -> String {
        if path.starts_with('/') {
            format!("{}{path}", self.base_url)
        } else {
            format!("{}/{path}", self.base_url)
        }
    }

    pub fn request(&self, method: Method, cookie_header: &str, path: &str) -> RequestBuilder {
        let mut builder = self.client.request(method, self.url(path));
        if !cookie_header.is_empty() {
            builder = builder.header(reqwest::header::COOKIE, cookie_header);
        }
        builder
    }

    pub async fn pref_get(
        &self,
        cookie_header: &str,
        scope: &str,
        scope_id: &str,
    ) -> Result<Option<serde_json::Value>, AppError> {
        let path = format!("/openapi/user/preferences/{scope}/{scope_id}");
        let env: Option<Envelope<serde_json::Value>> =
            send_json_optional(self.request(Method::GET, cookie_header, &path)).await?;
        let Some(env) = env else { return Ok(None) };
        if !env.success {
            return Ok(None);
        }
        Ok(env
            .data
            .filter(|value| !value.as_object().is_some_and(serde_json::Map::is_empty)))
    }

    pub async fn pref_put(
        &self,
        cookie_header: &str,
        scope: &str,
        scope_id: &str,
        value: impl Serialize,
    ) -> Result<(), AppError> {
        let path = format!("/openapi/user/preferences/{scope}/{scope_id}");
        let body = serde_json::json!({ "value": value });
        let _: serde_json::Value = send_json(self.request(Method::PUT, cookie_header, &path).json(&body)).await?;
        Ok(())
    }

    pub async fn pref_delete(&self, cookie_header: &str, scope: &str, scope_id: &str) -> Result<(), AppError> {
        let path = format!("/openapi/user/preferences/{scope}/{scope_id}");
        let _: serde_json::Value = send_json(self.request(Method::DELETE, cookie_header, &path)).await?;
        Ok(())
    }
}

#[derive(serde::Deserialize)]
struct Envelope<T> {
    #[serde(default)]
    success: bool,
    #[serde(default)]
    data: Option<T>,
}

async fn send_json<T: DeserializeOwned>(req: RequestBuilder) -> Result<T, AppError> {
    let resp = req.send().await?;
    let status = resp.status();
    if status.is_success() {
        Ok(resp.json::<T>().await?)
    } else {
        let body = resp.text().await.unwrap_or_default();
        Err(AppError::Upstream { status, body })
    }
}

async fn send_json_optional<T: DeserializeOwned>(req: RequestBuilder) -> Result<Option<T>, AppError> {
    let resp = req.send().await?;
    let status = resp.status();
    if status == StatusCode::NOT_FOUND {
        return Ok(None);
    }
    if status.is_success() {
        Ok(Some(resp.json::<T>().await?))
    } else {
        let body = resp.text().await.unwrap_or_default();
        Err(AppError::Upstream { status, body })
    }
}
