The purpose of this application is to provide a front-end only, single page tool that runs the IAAO's latest ratio study standards, including a new standard calle "VEI".

# Tech Stack

The application will be written in a front end library that can be statically hosted.
No server shoudld be required to operate this application. 
Initial deployment will be just displayed locally or deployed to GitHub Pages.
React is probably the best bet here.

The front end library should be able to be integrated with mainstream charting libraries.

Charting libraries need to be able to handle box plots, beeswarm plots, scatterplots, and histograms.
Plotly is probably the best choice for us here.

# User workflow

The user fill provide a CSV file, the name of the sale field, and the name of the valuation field. Once received, the application immediately starts computing the ratio study metrics.

# Expectations of user data

The user files will always contain a header row that includes both the sale field that they specified and the valuation field that they specified.

Files will be comma separated.

Rows with empty or non-numeric sale or valuation values will be ignored. Zeros are allowed in the valuation field. Rows with sale_price <= 0 are excluded from all ratio-based computations (to avoid division by zero or negative prices).


# Ratio Study metrics

## Median Ratio

Ratios are the standard valuation/price, and the median is just the median of all out valuation/price entries.

## Median Ratio 90% confidence interval

Calculated via a nonparametric bootstrap:
- Resamples: 10,000 bootstrap resamples of size N (sample with replacement).
- Statistic: median of each resample; base median uses the standard definition (for even N, average the two middle values).
- Interval: 90% percentile interval using the 5th and 95th percentiles of the bootstrap distribution.
- Determinism: seed the RNG for reproducible results.
- Edge cases: if all ratios are identical, the CI collapses to [value, value].

## COD

Coefficient of Dispersion (IAAO): COD = 100 * median(|ratio − median_ratio|) / median_ratio.

## PRB

Price-Related Bias: Regress ratio on ln(sale_price) using OLS with robust (HC3) standard errors.
- Model: ratio = a + b * ln(sale_price)
- Report: slope b and two-sided p-value; negative b indicates regressivity (ratios fall as price rises).
- Requirements: N ≥ 3 and some variation in sale_price.
- For very small N (<30), optionally also report Spearman correlation between ratio and ln(sale_price)).

## PRD

Price-Related Differential: PRD = mean(ratio) / weighted_mean(ratio), where weighted_mean(ratio) = sum(valuation) / sum(sale_price).

## VEI

This is a new metric and there's no public information on it yet. It is calculated as follows:

market_value_proxy = .5*sale_price + .5*(assessed_value / median_ratio)

Sort the proxy values of all parcels and break them up into a certain number of groups depending on your sample size
For 0 to 9 samples, this metric cannot be calculated
For 10 to 50 samples, break into 2 groups
For 51 to 500 samples, break into 4 groups
For more than 500 samples, break into 10 groups.

Grouping details and edge cases:
- Use near-equal count quantile groups; when N is not divisible by the group count, the earlier groups may have one extra observation until the remainder is exhausted.
- Ties in proxy values that straddle a boundary should be kept together when feasible, allowing slight imbalance. If not feasible, fall back to cutting by index.
- Range inclusivity: groups are [lower, upper) except the last group which is [lower, upper].
- Determinism: when proxies tie, preserve the original input row order as a stable tiebreaker.
- Per-strata CI: compute each stratum’s median ratio and 90% CI using the same bootstrap method as the overall median; a stratum should have at least 2 observations to compute a CI.

For each group, calculate the median ratio and 90% confidence intervals, using the same method as we used for the median ratio above.

For each group, calculate a median ratio for the entire sample

VEI = (median_of_last_strata - median_of_first_strata) / sample_median * 100

For example, if the median of the last strata is 0.91, the median of the first strata is 1.07, and the sample median is 0.97, VEI would be: 

VEI = (0.91 - 1.07) / 0.97 * 100 = -16.49%

After we have VEI, we also calculate VEI significance using the following formula:

vei_significance = (upper_ci_limit_for_last_strata - lower_ci_limit_for_first_strata) / sample_median * 100

For example, if the upper ci limit on the highest strata is 0.94, the lower ci limit on the lowest strata is 0.99, and the sample median is 0.97, VEI_significance would be:

vei_significance = (0.94 - 0.99) / 0.97 * 100 = -5.15%

# Precision and rounding

- All computations use double precision.
- Display precision:
  - Ratios and medians: 4 decimal places.
  - Percentage-style metrics (COD, PRD, PRB slope as % if presented, VEI, VEI significance): 2 decimal places.
  - Confidence intervals: same precision as their associated metrics.

# UX

## V0

A place to upload a file, a textbox for the sale field, a textbox for the appraised_value field.

A simple table display for the metrics calculated.

## V1

As above but also include box plots for each quantile. The box plot should plot the ratio and confidence interval of each quantile, and the quantile should be labeled by its median value.

## V2

As above but with an added Beeswarm plot, details yet to come

## V3

As above but with an added scatter plot, details yet to come

## V4

As above but with an added histogram of ratios, details yet to come
