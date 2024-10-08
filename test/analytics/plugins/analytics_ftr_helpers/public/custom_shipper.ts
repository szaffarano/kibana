/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { Subject } from 'rxjs';
import type { AnalyticsClientInitContext, Event, IShipper } from '@kbn/core/public';

export class CustomShipper implements IShipper {
  public static shipperName = 'FTR-helpers-shipper';

  constructor(
    private readonly events$: Subject<Event>,
    private readonly initContext: AnalyticsClientInitContext
  ) {}

  public reportEvents(events: Event[]) {
    this.initContext.logger.info(
      `Reporting ${events.length} events to ${CustomShipper.shipperName}: ${JSON.stringify(events)}`
    );
    events.forEach((event) => {
      this.events$.next(event);
    });
  }
  optIn(isOptedIn: boolean) {}
  async flush() {}
  shutdown() {}
}
