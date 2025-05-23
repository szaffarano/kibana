/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';

import type { EuiDataGridSorting, EuiDataGridColumn } from '@elastic/eui';

import { ES_CLIENT_TOTAL_HITS_RELATION } from '@kbn/ml-query-utils';

import { INDEX_STATUS } from '../lib/common';
import type { ChartData } from '../lib/field_histograms';
import { ColumnChart } from '../components/column_chart';
import { MAX_ROW_COUNT, INIT_MAX_COLUMNS } from '../lib/common';
import type {
  ChartsVisible,
  ColumnId,
  DataGridItem,
  IndexPagination,
  OnChangeItemsPerPage,
  OnChangePage,
  OnSort,
  RowCountInfo,
  UseDataGridReturnType,
} from '../lib/types';

const rowCountDefault: RowCountInfo = {
  rowCount: 0,
  rowCountRelation: undefined,
};

/**
 * Custom hook to manage DataGrid state.
 *
 * @param {EuiDataGridColumn[]} columns - EUI column spec
 * @param {number} [defaultPageSize=5] - Default page size
 * @param {number} [defaultVisibleColumnsCount=INIT_MAX_COLUMNS] - Default count of visible columns
 * @param {?(id: string) => boolean} [defaultVisibleColumnsFilter] - Optional external columns filter
 * @returns {UseDataGridReturnType}
 */
export const useDataGrid = (
  columns: EuiDataGridColumn[],
  defaultPageSize = 5,
  defaultVisibleColumnsCount = INIT_MAX_COLUMNS,
  defaultVisibleColumnsFilter?: (id: string) => boolean
): UseDataGridReturnType => {
  const defaultPagination: IndexPagination = { pageIndex: 0, pageSize: defaultPageSize };

  const [ccsWarning, setCcsWarning] = useState(false);
  const [noDataMessage, setNoDataMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [status, setStatus] = useState(INDEX_STATUS.UNUSED);
  const [rowCountInfo, setRowCountInfo] = useState<RowCountInfo>(rowCountDefault);
  const [columnCharts, setColumnCharts] = useState<ChartData[]>([]);
  const [tableItems, setTableItems] = useState<DataGridItem[]>([]);
  const [pagination, setPagination] = useState(defaultPagination);
  const [sortingColumns, setSortingColumns] = useState<EuiDataGridSorting['columns']>([]);
  const [chartsVisible, setChartsVisible] = useState<ChartsVisible>(undefined);

  const { rowCount, rowCountRelation } = rowCountInfo;

  const setLimitedRowCountInfo = useCallback((info: RowCountInfo) => {
    const limitedRowCount = Math.min(info.rowCount, MAX_ROW_COUNT);
    setRowCountInfo({ rowCount: limitedRowCount, rowCountRelation: info.rowCountRelation });
  }, []);

  const toggleChartVisibility = () => {
    if (chartsVisible !== undefined) {
      setChartsVisible(!chartsVisible);
    }
  };

  const onChangeItemsPerPage: OnChangeItemsPerPage = useCallback((pageSize) => {
    setPagination((p) => {
      const pageIndex = Math.floor((p.pageSize * p.pageIndex) / pageSize);
      return { pageIndex, pageSize };
    });
  }, []);

  const onChangePage: OnChangePage = useCallback(
    (pageIndex) => setPagination((p) => ({ ...p, pageIndex })),
    []
  );

  const resetPagination = () => setPagination(defaultPagination);

  // Column visibility
  const [visibleColumns, setVisibleColumns] = useState<ColumnId[]>([]);

  const columnIds = columns.map((c) => c.id);
  const filteredColumnIds =
    defaultVisibleColumnsFilter !== undefined
      ? columnIds.filter(defaultVisibleColumnsFilter)
      : columnIds;
  const defaultVisibleColumns = filteredColumnIds.splice(0, defaultVisibleColumnsCount);

  useEffect(() => {
    setVisibleColumns(defaultVisibleColumns);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultVisibleColumns.join()]);

  const [invalidSortingColumnns, setInvalidSortingColumnns] = useState<string[]>([]);

  const onSort: OnSort = useCallback(
    (sc) => {
      // Check if an unsupported column type for sorting was selected.
      const updatedInvalidSortingColumns = sc.reduce<string[]>((arr, current) => {
        const columnType = columns.find((dgc) => dgc.id === current.id);
        if (columnType?.schema === 'json') {
          arr.push(current.id);
        }
        return arr;
      }, []);
      setInvalidSortingColumnns(updatedInvalidSortingColumns);
      if (updatedInvalidSortingColumns.length === 0) {
        setSortingColumns(sc);
      }
    },
    [columns]
  );

  const columnsWithCharts = useMemo(() => {
    const updatedColumns = columns.map((c, index) => {
      const chartData = columnCharts.find((cd) => cd.id === c.id);

      return {
        ...c,
        display:
          chartData !== undefined && chartsVisible === true ? (
            <ColumnChart
              chartData={chartData}
              columnType={c}
              dataTestSubj={`mlDataGridChart-${c.id}`}
            />
          ) : undefined,
      };
    });

    // Sort the columns to be in line with the current order of visible columns.
    // EuiDataGrid misses a callback for the order of all available columns, so
    // this only can retain the order of visible columns.
    return updatedColumns.sort((a, b) => {
      // This will always move visible columns above invisible ones.
      if (visibleColumns.indexOf(a.id) === -1 && visibleColumns.indexOf(b.id) > -1) {
        return 1;
      }
      if (visibleColumns.indexOf(b.id) === -1 && visibleColumns.indexOf(a.id) > -1) {
        return -1;
      }
      if (visibleColumns.indexOf(a.id) === -1 && visibleColumns.indexOf(b.id) === -1) {
        return a.id.localeCompare(b.id);
      }

      // If both columns are visible sort by their visible sorting order.
      return visibleColumns.indexOf(a.id) - visibleColumns.indexOf(b.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns, columnCharts, chartsVisible, JSON.stringify(visibleColumns)]);

  // Initialize the mini histogram charts toggle button.
  // On load `chartsVisible` is set to `undefined`, the button will be disabled.
  // Once we know how many rows have been returned,
  // we decide whether to show or hide the charts by default.
  useEffect(() => {
    if (chartsVisible === undefined && rowCount > 0 && rowCountRelation !== undefined) {
      setChartsVisible(rowCountRelation !== ES_CLIENT_TOTAL_HITS_RELATION.GTE);
    }
  }, [chartsVisible, rowCount, rowCountRelation]);

  return useMemo(
    () => ({
      ccsWarning,
      chartsVisible,
      chartsButtonVisible: true,
      columnsWithCharts,
      errorMessage,
      invalidSortingColumnns,
      noDataMessage,
      onChangeItemsPerPage,
      onChangePage,
      onSort,
      pagination,
      resetPagination,
      rowCount,
      rowCountRelation,
      setColumnCharts,
      setCcsWarning,
      setErrorMessage,
      setNoDataMessage,
      setPagination,
      setRowCountInfo: setLimitedRowCountInfo,
      setSortingColumns,
      setStatus,
      setTableItems,
      setVisibleColumns,
      sortingColumns,
      status,
      tableItems,
      toggleChartVisibility,
      visibleColumns,
    }),
    // custom comparison
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      ccsWarning,
      chartsVisible,
      columnsWithCharts,
      errorMessage,
      invalidSortingColumnns,
      noDataMessage,
      pagination,
      rowCount,
      rowCountRelation,
      sortingColumns,
      status,
      tableItems,
      visibleColumns,
    ]
  );
};
