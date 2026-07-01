use std::sync::{Arc, OnceLock};

use clap::{Parser, Subcommand};
use tokimo_app_qq_music::{app_server, handlers::AppCtx, openapi_client::OpenApiClient, qq::QqClient};
use tokimo_bus_cli::TokimoAuthArgs;
use tokimo_bus_client::{BusClient, ClientConfig};
use tracing::{error, info};

#[derive(Parser, Debug)]
#[command(name = "tokimo-app-qq-music", about = "QQ Music — Tokimo app CLI", term_width = 100)]
struct Cli {
    #[command(flatten)]
    auth: TokimoAuthArgs,
    #[command(subcommand)]
    command: Option<Command>,
}

#[derive(Subcommand, Debug)]
enum Command {
    /// Print sidecar status.
    Status,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let Cli { auth: _, command } = Cli::parse();

    match command {
        None if std::env::var_os("TOKIMO_BUS_SOCKET").is_some() => {
            tracing_subscriber::fmt()
                .with_env_filter(
                    tracing_subscriber::EnvFilter::try_from_default_env()
                        .unwrap_or_else(|_| "info,tokimo_app_qq_music=debug,tokimo_bus_client=info".into()),
                )
                .init();
            if let Err(error) = run_server().await {
                error!(%error, "qq-music: fatal");
                std::process::exit(1);
            }
        }
        None => {
            use clap::CommandFactory;
            let mut cmd = Cli::command();
            tokimo_bus_cli::print_help_unified(&mut cmd);
            std::process::exit(0);
        }
        Some(Command::Status) => {
            println!("qq-music sidecar installed");
        }
    }

    Ok(())
}

async fn run_server() -> anyhow::Result<()> {
    let cfg = ClientConfig::from_env().map_err(|error| anyhow::anyhow!("ClientConfig: {error}"))?;
    let openapi = Arc::new(OpenApiClient::from_env()?);
    let client_slot: Arc<OnceLock<Arc<BusClient>>> = Arc::new(OnceLock::new());
    let ctx = Arc::new(AppCtx {
        openapi,
        qq: Arc::new(QqClient::new()?),
        client: Arc::clone(&client_slot),
    });

    let app_socket = app_server::spawn("qq-music", Arc::clone(&ctx))
        .await
        .map_err(|error| anyhow::anyhow!("app_server spawn: {error}"))?;

    let client = BusClient::builder(cfg)
        .service("qq-music", env!("CARGO_PKG_VERSION"))
        .data_plane(app_socket)
        .build()
        .await
        .map_err(|error| anyhow::anyhow!("bus build: {error}"))?;
    client_slot
        .set(Arc::clone(&client))
        .map_err(|_| anyhow::anyhow!("client_slot already set"))?;

    info!("qq-music: registered with broker");

    let shutdown = {
        let client = Arc::clone(&client);
        tokio::spawn(async move { client.run_until_shutdown().await })
    };

    tokio::select! {
        _ = tokio::signal::ctrl_c() => {
            info!("qq-music: SIGINT received");
            client.shutdown();
        }
        _ = shutdown => info!("qq-music: broker sent Shutdown"),
    }

    Ok(())
}
