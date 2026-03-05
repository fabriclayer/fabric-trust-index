# Changelog

All notable changes to the Fabric Trust Index will be documented in this file.

## [0.3.0] - 2026-03-05

### Added
- Go module and GitHub repo support in vulnerability collector
- Search bar on marketing site with `?q=` param support
- Publisher filtering — click publisher name to filter index
- Rank numbers colored by score status (green/orange/red)
- Endpoint URL monitoring for top 50 services

### Changed
- Improved scoring accuracy for services without npm/pypi packages
- Services with GitHub repos now get vulnerability scans via OSV Go module queries

## [0.2.0] - 2026-02-28

### Added
- AI-generated trust assessments for all services
- Sub-signal breakdowns on product pages
- Alert feed with real-time trust score changes
- Service request and issue report forms
- Publisher claim flow
- Badge API for embedding trust scores

### Changed
- Scoring engine weight redistribution for missing data
- Improved CVE deduplication across OSV aliases

## [0.1.0] - 2026-02-23

### Added
- Initial release of Fabric Trust Index
- 23 sub-signals across 6 trust dimensions
- Scoring engine with composite score calculation
- 5,800+ AI services indexed
- Product detail pages with signal breakdowns
- Category and status filtering
- Health check monitoring (15-minute cycle)
- CVE tracking via OSV.dev
- Publisher trust evaluation
