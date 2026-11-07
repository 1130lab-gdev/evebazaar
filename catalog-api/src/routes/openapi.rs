use utoipa::OpenApi;

use crate::domain::{
    ArbitrageOpportunity, Category, LegPriceCheck, MarketGroup, MarketOrder, Region,
    RoutePlan, RoutePlanLeg, SearchResult, TypeDetail,
};

use super::{arbitrage, orders, price_checks, route_planner, search, taxonomy};

#[derive(OpenApi)]
#[openapi(
    info(
        title = "catalog-api",
        description = "Browsing of the EVE item catalog and live ESI market orders, plus route planning.",
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
        price_checks::check_prices,
    ),
    components(schemas(
        Category, MarketGroup, Region, TypeDetail, SearchResult, MarketOrder, ArbitrageOpportunity,
        RoutePlan, RoutePlanLeg,
        LegPriceCheck, price_checks::PriceCheckRequest, price_checks::PriceCheckLegRequest,
    )),
    tags(
        (name = "taxonomy", description = "Item categories, market groups, and type detail"),
        (name = "search", description = "Item name search"),
        (name = "orders", description = "Market order listings"),
        (name = "arbitrage", description = "Cross-system buy-low-sell-high opportunity scanning"),
        (name = "route-planner", description = "Branch-and-bound multi-hop hauling itinerary planning"),
        (name = "price-checks", description = "On-demand re-quoting of previewed legs against the live market"),
    ),
)]
pub struct ApiDoc;
