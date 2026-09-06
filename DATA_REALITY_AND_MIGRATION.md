# From synthetic demo data to real-world rail operations

## Decision

Do **not** present the current dataset as real operational data.  It is a useful
UI/algorithm demo fixture, but four of the six files are invented inputs and
the train timetable contains random times.  Replace public traffic and network
inputs first; obtain maintenance and possession data only through an authorised
Indian Railways data-sharing arrangement.

## What is in the repository today

| File | Records | Reality check | Can public data replace it? |
| --- | ---: | --- | --- |
| `data/track_sections.json` | 2 | Hand-authored, including section IDs, length and speed | Partly. Use OpenStreetMap/OpenRailwayMap geometry plus an approved infrastructure register for authoritative attributes. |
| `data/train_schedule.json` | 24 | Four train numbers repeated for three days, with randomly generated arrival/departure times; names/routes are not reliably matched to the numbers | Yes. Use timetable plus train-running data. |
| `data/corridor_windows.json` | 56 | Fixed 22:00–05:00 and 14:00–16:30 windows, generated without traffic occupancy | Not directly. Derive provisional gaps from real movements; validate them against the Control Office before using them as possessions. |
| `data/defects.json` | 25 | Generated descriptions, severity, location and report age | No public replacement found. Requires an authorised asset/inspection system feed. |
| `data/maintenance_tasks.json` | 34 | Generated from the synthetic defects and routine-work rules | No public replacement found. Requires an authorised maintenance-management feed. |
| `data/block_requests.json` | 14 | Generated from task criticality and random start hours | No public replacement found. Requires authorised block/disconnection workflow data. |

The optimiser currently consumes only `maintenance_tasks.json` and
`corridor_windows.json`. `train_schedule.json`, defects, and block requests are
not inputs to the decision engine. Therefore, replacing only the timetable
would improve display credibility but would **not** make a real scheduling
demonstration.

## Verified data-source landscape

### Public / usable for a realistic traffic context

1. **NTES / CRIS** is the authoritative public source for train running status,
   schedules and arrival/departure information. CRIS states that the Control
   Office Application records section movements in near real time and feeds
   NTES; RTIS supplies position and movement information. Start a conversation
   with CRIS/Indian Railways for an authorised interface rather than scraping a
   passenger website.
   - [CRIS – Control Office Application](https://cris.org.in/loadpage?page=proCOA)
   - [CRIS – Real Time Train Information System](https://cris.org.in/loadpage?page=proRTIS)
   - [Ministry/PIB description of NTES](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2295409&lang=1&reg=1)

2. **RailRadar** documents a developer API for timetable/live station-board
   observations, including scheduled times, expected times, platform and delay.
   Its free sandbox is rate-limited (1,000 calls/month) and requires a bearer
   API key. It can support a non-safety-critical prototype while approval for
   an official feed is pursued. Treat it as third-party data, preserve its
   provenance, and do not make dispatch decisions from it.
   - [RailRadar station-board API documentation](https://railradar.in/docs/station-live-board)

3. **OpenStreetMap / OpenRailwayMap** can provide display geometry and a
   station/track graph. It is useful for map visualisation and approximate
   section matching, but it is crowd-sourced—not an authoritative source for
   line capacity, direction, electrification, speed, or possession boundaries.
   - [OpenRailwayMap API guidance](https://wiki.openstreetmap.org/wiki/OpenRailwayMap/API)
   - [Geofabrik India OpenStreetMap extracts](https://download.geofabrik.de/asia/india.html)

### Restricted / needs an agreement

* **COA**: live control-chart movements, planned paths and operational
  constraints. It is the right source for capacity-aware windows.
* **TDMS / maintenance-management systems**: defects, asset condition, work
  orders, resources and electrical disconnections.
* **BDMS / possession workflow**: requested/approved blocks and cancellation
  reasons.
* **FOIS**: freight movements, wagon state and freight-path effects.

These inputs can expose operationally sensitive infrastructure information.
Only ingest the minimum fields needed, use a read-only service account, retain
source timestamps and access logs, and require human approval before a proposed
block becomes operational.

## Recommended target data contract

Retain the existing JSON shape at the application boundary, but add provenance
to every record and normalize sources into a separate ingestion layer:

```json
{
  "source_system": "NTES | COA | TDMS | BDMS | RailRadar | OSM",
  "source_record_id": "upstream immutable ID",
  "observed_at": "2026-09-06T10:30:00+05:30",
  "effective_from": "2026-09-06T00:00:00+05:30",
  "effective_to": null,
  "confidence": "official | partner | third_party | derived",
  "ingested_at": "2026-09-06T10:31:15+05:30"
}
```

For train movements, add `train_number`, `run_date`, `direction`,
`from_station`, `to_station`, `scheduled_entry`, `scheduled_exit`,
`actual_entry`, `actual_exit`, `delay_minutes`, and `movement_state`.

For a derived capacity window, add `derivation_method`, `traffic_snapshot_at`,
`headway_minutes`, `buffer_minutes`, and `approval_state`. A window derived
from public observations must start as `Proposed`, never `Available`.

## Migration sequence

1. **Make the traffic layer real.** Choose a clearly bounded corridor, import
   its OSM geometry and station codes, then poll an authorised NTES/partner
   schedule + live-running feed. Store raw responses separately from the
   normalized train-movement table.
2. **Replace fixed windows with derived candidates.** For each track section,
   subtract observed/planned train occupancy plus headway and setup/clearance
   buffers. Label results as `Proposed` and show their data freshness.
3. **Integrate authorised work data.** Map TDMS/maintenance work orders and
   defect records to the existing task schema. Preserve upstream priority,
   asset and kilometre references instead of inventing scores or durations.
4. **Integrate block workflow.** Read BDMS/COA block requests and approvals.
   The optimiser should recommend alternatives; it must not write to the
   source system or claim a block is approved.
5. **Measure a real replay.** Run against a time-bounded historical snapshot,
   then compare proposed windows with actual approved possessions: scheduled
   work, conflicts, delay impact and false-positive availability. Promote to a
   live advisory view only after domain review.

## Immediate implementation priorities

* Remove the random timetable generator from the production data path.
* Add source/provenance fields and a `data_mode` badge (`demo`, `replay`, or
  `live-advisory`) to prevent synthetic and live records being mixed.
* Change the scheduler so a corridor window carries a derived/approved state;
  schedule only approved windows by default.
* Wire train occupancy into window derivation before treating the optimiser's
  availability-gain metric as meaningful.
* Keep the existing files as `data/fixtures/` for tests and demos, rather than
  overwriting them with unversioned API snapshots.

## Prototype acceptance criteria

A demonstration is reasonably described as real-world when it can show, for a
named corridor and recorded observation period: source and freshness of each
train movement; the rule and buffers used to derive each candidate window;
authorised maintenance/block records or an explicit `synthetic-work-order`
label; and a human approval step before any recommendation is shown as a
scheduled block.
