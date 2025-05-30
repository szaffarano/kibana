/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { StoryFn } from '@storybook/react';
import { EuiContextMenuPanel } from '@elastic/eui';
import { SecuritySolutionContext } from '../../../containers/security_solution_context';
import { SecuritySolutionPluginContext } from '../../..';
import { getSecuritySolutionContextMock } from '../../../mocks/mock_security_context';
import { AddToBlockListContextMenu } from './add_to_block_list';
import { BlockListProvider } from '../../indicators/containers/block_list_provider';

export default {
  title: 'AddToBlocklist',
};

export const ContextMenu: StoryFn = () => {
  const mockSecurityContext: SecuritySolutionPluginContext = getSecuritySolutionContextMock();

  const mockIndicatorFileHashValue: string = 'abc';
  const mockOnClick: () => void = () => window.alert('clicked!');
  const items = [
    <AddToBlockListContextMenu data={mockIndicatorFileHashValue} onClick={mockOnClick} />,
  ];

  return (
    <SecuritySolutionContext.Provider value={mockSecurityContext}>
      <BlockListProvider>
        <EuiContextMenuPanel items={items} />
      </BlockListProvider>
    </SecuritySolutionContext.Provider>
  );
};

export const Disabled: StoryFn = () => {
  const mockSecurityContext: SecuritySolutionPluginContext = getSecuritySolutionContextMock();
  mockSecurityContext.blockList.canWriteBlocklist = false;

  const mockIndicatorFileHashValue: string = 'abc';
  const mockOnClick: () => void = () => window.alert('clicked!');
  const items = [
    <AddToBlockListContextMenu data={mockIndicatorFileHashValue} onClick={mockOnClick} />,
  ];

  return (
    <SecuritySolutionContext.Provider value={mockSecurityContext}>
      <BlockListProvider>
        <EuiContextMenuPanel items={items} />
      </BlockListProvider>
    </SecuritySolutionContext.Provider>
  );
};
