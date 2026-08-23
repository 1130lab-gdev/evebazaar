use std::collections::HashMap;

use crate::db::MarketSample;

/// A single item's contribution to a basket: its representative price and
/// the quantity behind it.
#[derive(Clone, Copy, Debug)]
pub struct Item {
    pub price: f64,
    pub qty: i64,
}

/// Groups per-(item, region) market samples by item, drops any sample whose
/// price is more than one population standard deviation from that item's
/// mean price across markets, and collapses what's left into one
/// quantity-weighted price and summed quantity per item -- the (price, qty)
/// that item contributes to the Tradeable Goods Index.
pub fn build_basket(samples: &[MarketSample]) -> HashMap<i32, Item> {
    let mut by_type: HashMap<i32, Vec<&MarketSample>> = HashMap::new();
    for sample in samples {
        by_type.entry(sample.type_id).or_default().push(sample);
    }

    let mut basket = HashMap::with_capacity(by_type.len());
    for (type_id, markets) in by_type {
        let n = markets.len() as f64;
        let mean = markets.iter().map(|m| m.price).sum::<f64>() / n;
        let variance = markets.iter().map(|m| (m.price - mean).powi(2)).sum::<f64>() / n;
        let stddev = variance.sqrt();

        let kept: Vec<&MarketSample> = markets
            .iter()
            .copied()
            .filter(|m| {
                let within = (m.price - mean).abs() <= stddev;
                if !within {
                    tracing::debug!(
                        type_id,
                        region_id = m.region_id,
                        price = m.price,
                        mean,
                        stddev,
                        "dropping market sample outside 1 stddev"
                    );
                }
                within
            })
            .collect();

        let qty: i64 = kept.iter().map(|m| m.qty).sum();
        if qty == 0 {
            continue;
        }
        let price = kept.iter().map(|m| m.price * m.qty as f64).sum::<f64>() / qty as f64;

        basket.insert(type_id, Item { price, qty });
    }
    basket
}

pub fn calc_laspeyres_index(current_goods: &[Item], base_goods: &[Item]) -> f64 {
    let current_goods_sum: f64 = current_goods.iter().map(|g| g.price * g.qty as f64).sum();
    let base_goods_sum: f64 = base_goods.iter().map(|g| g.price * g.qty as f64).sum();

    current_goods_sum / base_goods_sum * 100.0
}

/// `current_goods[i]` and `base_goods[i]` must be the same item (the two
/// slices are parallel, paired by caller) -- the denominator revalues each
/// item at its base price but weights it by its *current* quantity, so
/// price and quantity have to line up per item rather than being summed
/// independently and multiplied.
pub fn calc_paasche_index(current_goods: &[Item], base_goods: &[Item]) -> f64 {
    let current_goods_sum: f64 = current_goods.iter().map(|g| g.price * g.qty as f64).sum();
    let base_goods_sum: f64 = current_goods
        .iter()
        .zip(base_goods)
        .map(|(current, base)| base.price * current.qty as f64)
        .sum();

    current_goods_sum / base_goods_sum * 100.0
}
