/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  CreateRuleActionV1,
  CreateRuleRequestBodyV1,
} from '../../../../../../../common/routes/rule/apis/create';
import type { CreateRuleData } from '../../../../../../application/rule/methods/create';
import type {
  RuleParams,
  ActionRequest,
  SystemActionRequest,
} from '../../../../../../application/rule/types';

const transformCreateBodyActions = (actions: CreateRuleActionV1[]): ActionRequest[] => {
  if (!actions) {
    return [];
  }

  return actions.map(
    ({
      group,
      id,
      params,
      frequency,
      uuid,
      alerts_filter: alertsFilter,
      use_alert_data_for_template: useAlertDataForTemplate,
    }) => {
      return {
        group: group ?? 'default',
        id,
        params,
        ...(uuid ? { uuid } : {}),
        ...(typeof useAlertDataForTemplate !== 'undefined' ? { useAlertDataForTemplate } : {}),
        ...(frequency
          ? {
              frequency: {
                summary: frequency.summary,
                throttle: frequency.throttle,
                notifyWhen: frequency.notify_when,
              },
            }
          : {}),
        ...(alertsFilter ? { alertsFilter } : {}),
      };
    }
  );
};

const transformCreateBodySystemActions = (actions: CreateRuleActionV1[]): SystemActionRequest[] => {
  if (!actions) {
    return [];
  }

  return actions.map(({ id, params, uuid }) => {
    return {
      id,
      params,
      ...(uuid ? { uuid } : {}),
    };
  });
};

const transformCreateBodyFlapping = <Params extends RuleParams = never>(
  flapping: CreateRuleRequestBodyV1<Params>['flapping']
) => {
  if (!flapping) {
    return flapping;
  }
  return {
    lookBackWindow: flapping.look_back_window,
    statusChangeThreshold: flapping.status_change_threshold,
  };
};

export const transformCreateBody = <Params extends RuleParams = never>({
  createBody,
  actions,
  systemActions,
}: {
  createBody: CreateRuleRequestBodyV1<Params>;
  actions: CreateRuleRequestBodyV1<Params>['actions'];
  systemActions: CreateRuleRequestBodyV1<Params>['actions'];
}): CreateRuleData<Params> => {
  return {
    name: createBody.name,
    alertTypeId: createBody.rule_type_id,
    enabled: createBody.enabled,
    consumer: createBody.consumer,
    tags: createBody.tags,
    ...(createBody.throttle ? { throttle: createBody.throttle } : {}),
    params: createBody.params,
    schedule: createBody.schedule,
    actions: transformCreateBodyActions(actions),
    systemActions: transformCreateBodySystemActions(systemActions),
    ...(createBody.notify_when ? { notifyWhen: createBody.notify_when } : {}),
    ...(createBody.alert_delay ? { alertDelay: createBody.alert_delay } : {}),
    ...(createBody.flapping !== undefined
      ? { flapping: transformCreateBodyFlapping(createBody.flapping) }
      : {}),
    ...(createBody.artifacts ? { artifacts: createBody.artifacts } : {}),
  };
};
