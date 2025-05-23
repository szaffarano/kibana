/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import moment from 'moment';
import { upperFirst } from 'lodash';
import { checkParam } from '../error_missing_required';
import { createBeatsQuery } from './create_beats_query';
import { calculateRate } from '../calculate_rate';
import { getDiffCalculation } from './_beats_stats';
import { LegacyRequest } from '../../types';
import { ElasticsearchResponse } from '../../../common/types/es';

interface Beat {
  uuid?: string;
  name?: string;
  type?: string;
  output?: string;
  total_events_rate: number;
  bytes_sent_rate: number;
  memory?: number;
  version?: string;
  errors: any;
}

export function handleResponse(response: ElasticsearchResponse, start: number, end: number) {
  const hits = response.hits?.hits ?? [];
  const initial: { ids: Set<string>; beats: Beat[] } = { ids: new Set(), beats: [] };
  const { beats } = hits.reduce((accum, hit) => {
    const stats = hit._source.beats_stats ?? hit._source.beat?.stats;
    const statsMetrics = hit._source.beats_stats?.metrics ?? hit._source.beat?.stats;
    const uuid = stats?.beat?.uuid;

    if (!uuid) {
      return accum;
    }

    // skip this duplicated beat, newer one was already added
    if (accum.ids.has(uuid)) {
      return accum;
    }

    // add another beat summary
    accum.ids.add(uuid);

    let earliestStats = null;
    let earliestStatsMetrics = null;
    if (hit.inner_hits?.earliest?.hits?.hits && hit.inner_hits?.earliest?.hits?.hits.length > 0) {
      earliestStats =
        hit.inner_hits.earliest.hits.hits[0]._source.beats_stats ??
        hit.inner_hits.earliest.hits.hits[0]._source.beat?.stats;
      earliestStatsMetrics =
        hit.inner_hits.earliest.hits.hits[0]._source.beats_stats?.metrics ??
        hit.inner_hits.earliest.hits.hits[0]._source.beat?.stats;
    }

    //  add the beat
    const rateOptions = {
      hitTimestamp: stats?.timestamp ?? hit._source['@timestamp']!,
      earliestHitTimestamp:
        earliestStats?.timestamp ?? hit.inner_hits?.earliest.hits?.hits[0]._source['@timestamp']!,
      timeWindowMin: start,
      timeWindowMax: end,
    };

    const { rate: bytesSentRate } = calculateRate({
      latestTotal: statsMetrics?.libbeat?.output?.write?.bytes,
      earliestTotal: earliestStatsMetrics?.libbeat?.output?.write?.bytes,
      ...rateOptions,
    });

    const { rate: totalEventsRate } = calculateRate({
      latestTotal: statsMetrics?.libbeat?.pipeline?.events?.total,
      earliestTotal: earliestStatsMetrics?.libbeat?.pipeline?.events?.total,
      ...rateOptions,
    });

    const errorsWrittenLatest = statsMetrics?.libbeat?.output?.write?.errors ?? 0;
    const errorsWrittenEarliest = earliestStatsMetrics?.libbeat?.output?.write?.errors ?? 0;
    const errorsReadLatest = statsMetrics?.libbeat?.output?.read?.errors ?? 0;
    const errorsReadEarliest = earliestStatsMetrics?.libbeat?.output?.read?.errors ?? 0;
    const errors = getDiffCalculation(
      errorsWrittenLatest + errorsReadLatest,
      errorsWrittenEarliest + errorsReadEarliest
    );

    accum.beats.push({
      uuid: stats?.beat?.uuid,
      name: stats?.beat?.name,
      type: upperFirst(stats?.beat?.type),
      output: upperFirst(statsMetrics?.libbeat?.output?.type),
      total_events_rate: totalEventsRate!,
      bytes_sent_rate: bytesSentRate!,
      errors,
      memory:
        hit._source.beats_stats?.metrics?.beat?.memstats?.memory_alloc ??
        hit._source.beat?.stats?.memstats?.memory?.alloc,
      version: stats?.beat?.version,
    });

    return accum;
  }, initial);

  return beats;
}

export async function getBeats(req: LegacyRequest, beatsIndexPattern: string, clusterUuid: string) {
  checkParam(beatsIndexPattern, 'beatsIndexPattern in getBeats');

  const config = req.server.config;
  const start = moment.utc(req.payload.timeRange.min).valueOf();
  const end = moment.utc(req.payload.timeRange.max).valueOf();

  const params = {
    index: beatsIndexPattern,
    size: config.ui.max_bucket_size,
    ignore_unavailable: true,
    filter_path: [
      // only filter path can filter for inner_hits
      'hits.hits._source.beats_stats.beat.uuid',
      'hits.hits._source.beat.stats.beat.uuid',
      'hits.hits._source.beats_stats.beat.name',
      'hits.hits._source.beat.stats.beat.name',
      'hits.hits._source.beats_stats.beat.host',
      'hits.hits._source.beat.stats.beat.host',
      'hits.hits._source.beats_stats.beat.type',
      'hits.hits._source.beat.stats.beat.type',
      'hits.hits._source.beats_stats.beat.version',
      'hits.hits._source.beat.stats.beat.version',
      'hits.hits._source.beats_stats.metrics.libbeat.output.type',
      'hits.hits._source.beat.stats.libbeat.output.type',
      'hits.hits._source.beats_stats.metrics.libbeat.output.read.errors',
      'hits.hits._source.beat.stats.libbeat.output.read.errors',
      'hits.hits._source.beats_stats.metrics.libbeat.output.write.errors',
      'hits.hits._source.beat.stats.libbeat.output.write.errors',
      'hits.hits._source.beats_stats.metrics.beat.memstats.memory_alloc',
      'hits.hits._source.beat.stats.memstats.memory.alloc',

      // latest hits for calculating metrics
      'hits.hits._source.beats_stats.timestamp',
      'hits.hits._source.@timestamp',
      'hits.hits._source.beats_stats.metrics.libbeat.output.write.bytes',
      'hits.hits._source.beat.stats.libbeat.output.write.bytes',
      'hits.hits._source.beats_stats.metrics.libbeat.pipeline.events.total',
      'hits.hits._source.beat.stats.libbeat.pipeline.events.total',

      // earliest hits for calculating metrics
      'hits.hits.inner_hits.earliest.hits.hits._source.beats_stats.timestamp',
      'hits.hits.inner_hits.earliest.hits.hits._source.@timestamp',
      'hits.hits.inner_hits.earliest.hits.hits._source.beat.stats.libbeat.output.write.bytes',
      'hits.hits.inner_hits.earliest.hits.hits._source.beats_stats.metrics.libbeat.output.write.bytes',
      'hits.hits.inner_hits.earliest.hits.hits._source.beat.stats.libbeat.pipeline.events.total',
      'hits.hits.inner_hits.earliest.hits.hits._source.beats_stats.metrics.libbeat.pipeline.events.total',

      // earliest hits for calculating diffs
      'hits.hits.inner_hits.earliest.hits.hits._source.beats_stats.metrics.libbeat.output.read.errors',
      'hits.hits.inner_hits.earliest.hits.hits._source.beat.stats.libbeat.output.read.errors',
      'hits.hits.inner_hits.earliest.hits.hits._source.beats_stats.metrics.libbeat.output.write.errors',
      'hits.hits.inner_hits.earliest.hits.hits._source.beat.stats.libbeat.output.write.errors',
    ],
    query: createBeatsQuery({
      start,
      end,
      clusterUuid,
    }),
    collapse: {
      field: 'beats_stats.metrics.beat.info.ephemeral_id', // collapse on ephemeral_id to handle restarts
      inner_hits: {
        name: 'earliest',
        size: 1,
        sort: [
          { 'beats_stats.timestamp': { order: 'asc', unmapped_type: 'long' } },
          { '@timestamp': { order: 'asc', unmapped_type: 'long' } },
        ],
      },
    },
    sort: [
      { 'beats_stats.beat.uuid': { order: 'asc', unmapped_type: 'long' } }, // need to keep duplicate uuids grouped
      { timestamp: { order: 'desc', unmapped_type: 'long' } }, // need oldest timestamp to come first for rate calcs to work
    ],
  };

  const { callWithRequest } = req.server.plugins.elasticsearch.getCluster('monitoring');
  const response = await callWithRequest(req, 'search', params);

  return handleResponse(response, start, end);
}
