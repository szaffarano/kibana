/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { Client } from '@elastic/elasticsearch';

import { systemIndicesSuperuser, createEsClientForFtrConfig } from '@kbn/test';
import { FtrProviderContext } from './ftr_provider_context';

export function EsProvider({ getService }: FtrProviderContext): Client {
  const config = getService('config');
  const isServerless = !!config.get('serverless');

  return createEsClientForFtrConfig(
    config,
    isServerless
      ? {}
      : {
          // Use system indices user so tests can write to system indices
          authOverride: systemIndicesSuperuser,
        }
  );
}
