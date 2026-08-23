use utoipa::OpenApi;

use crate::domain::{
    ArbitrageOpportunity, Category, Hauler, HaulerRun, HaulerRunLeg, LegPriceCheck, MarketGroup, MarketOrder, PriceWatch, Region,
    RoutePlan, RoutePlanLeg, RunStatus, SearchResult, TypeDetail,
};

use super::{arbitrage, haulers, orders, price_checks, price_watches, route_planner, search, taxonomy};

#[derive(OpenApi)]
#[openapi(
    info(
        title = "catalog-api",
        description = "Browsing of the EVE item catalog and live ESI market orders, plus catalog-api's own hauler/run/route-planning/price-watch state.",
    ),
    paths(
        taxonomy::list_categories,
        taxonomy::list_market_groups,
        taxonomy::list_regions,
        taxonomy::get_type,
        search::search,
        orders::list_orders,
        arbitrage::list_opportunities,
        route_planner::plan_route,
        haulers::list_haulers,
        haulers::create_hauler,
        haulers::get_hauler,
        haulers::update_hauler,
        haulers::delete_hauler,
        haulers::create_run,
        haulers::list_runs,
        haulers::get_run,
        haulers::update_run_status,
        haulers::delete_run,
        haulers::set_leg_completed,
        price_watches::list_price_watches,
        price_watches::create_price_watch,
        price_watches::update_price_watch,
        price_watches::delete_price_watch,
        price_checks::check_prices,
    ),
    components(schemas(
        Category, MarketGroup, Region, TypeDetail, SearchResult, MarketOrder, ArbitrageOpportunity,
        RoutePlan, RoutePlanLeg,
        Hauler, HaulerRun, HaulerRunLeg, RunStatus,
        haulers::HaulerRequest, haulers::CreateRunRequest, haulers::CreateRunLegRequest,
        haulers::UpdateRunStatusRequest, haulers::SetLegCompletedRequest,
        PriceWatch, price_watches::PriceWatchRequest, price_watches::UpdatePriceWatchRequest,
        LegPriceCheck, price_checks::PriceCheckRequest, price_checks::PriceCheckLegRequest,
    )),
    tags(
        (name = "taxonomy", description = "Item categories, market groups, and type detail"),
        (name = "search", description = "Item name search"),
        (name = "orders", description = "Market order listings"),
        (name = "arbitrage", description = "Cross-system buy-low-sell-high opportunity scanning"),
        (name = "route-planner", description = "Branch-and-bound multi-hop hauling itinerary planning"),
        (name = "haulers", description = "Saved trader profiles and their pinned/planned runs"),
        (name = "price-watches", description = "Standing alerts on an item's best live buy order vs. a reference price"),
        (name = "price-checks", description = "On-demand re-quoting of saved/previewed legs against the live market"),
    ),
)]
pub struct ApiDoc;
