/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { set } from '@kbn/safer-lodash-set';
import * as Either from 'fp-ts/Either';
import _ from 'lodash';
import {
  SavedObjectTypeRegistry,
  SavedObjectsSerializer,
} from '@kbn/core-saved-objects-base-server-internal';
import {
  DocumentsTransformFailed,
  DocumentsTransformSuccess,
  migrateRawDocs,
  migrateRawDocsSafely,
} from './migrate_raw_docs';
import { TransformSavedObjectDocumentError } from './transform_saved_object_document_error';

describe('migrateRawDocs', () => {
  test('converts raw docs to saved objects', async () => {
    const transform = jest.fn<any, any>((doc: any) => [
      set(_.cloneDeep(doc), 'attributes.name', 'HOI!'),
    ]);
    const result = await migrateRawDocs(
      new SavedObjectsSerializer(new SavedObjectTypeRegistry()),
      transform,
      [
        { _id: 'a:b', _source: { type: 'a', a: { name: 'AAA' } } },
        { _id: 'a:c', _source: { type: 'a', a: { name: 'AAA' }, typeMigrationVersion: '1.0.0' } },
        { _id: 'c:d', _source: { type: 'c', c: { name: 'DDD' } } },
        {
          _id: 'c:e',
          _source: { type: 'c', c: { name: 'DDD' }, migrationVersion: { c: '2.0.0' } },
        },
      ]
    );

    expect(result).toEqual([
      {
        _id: 'a:b',
        _source: { type: 'a', a: { name: 'HOI!' }, typeMigrationVersion: '', references: [] },
      },
      {
        _id: 'a:c',
        _source: { type: 'a', a: { name: 'HOI!' }, typeMigrationVersion: '1.0.0', references: [] },
      },
      {
        _id: 'c:d',
        _source: { type: 'c', c: { name: 'HOI!' }, typeMigrationVersion: '', references: [] },
      },
      {
        _id: 'c:e',
        _source: {
          type: 'c',
          c: { name: 'HOI!' },
          migrationVersion: { c: '2.0.0' },
          references: [],
        },
      },
    ]);

    const obj1 = {
      id: 'b',
      type: 'a',
      attributes: { name: 'AAA' },
      typeMigrationVersion: '',
      references: [],
    };
    const obj2 = {
      id: 'c',
      type: 'a',
      attributes: { name: 'AAA' },
      typeMigrationVersion: '1.0.0',
      references: [],
    };
    const obj3 = {
      id: 'd',
      type: 'c',
      attributes: { name: 'DDD' },
      typeMigrationVersion: '',
      references: [],
    };
    const obj4 = {
      id: 'e',
      type: 'c',
      attributes: { name: 'DDD' },
      migrationVersion: { c: '2.0.0' },
      references: [],
    };
    expect(transform).toHaveBeenCalledTimes(4);
    expect(transform).toHaveBeenNthCalledWith(1, obj1);
    expect(transform).toHaveBeenNthCalledWith(2, obj2);
    expect(transform).toHaveBeenNthCalledWith(3, obj3);
    expect(transform).toHaveBeenNthCalledWith(4, obj4);
  });

  test('throws when encountering a corrupt saved object document', async () => {
    const transform = jest.fn<any, any>((doc: any) => [
      set(_.cloneDeep(doc), 'attributes.name', 'TADA'),
    ]);
    const result = migrateRawDocs(
      new SavedObjectsSerializer(new SavedObjectTypeRegistry()),
      transform,
      [
        { _id: 'foo:b', _source: { type: 'a', a: { name: 'AAA' } } },
        { _id: 'c:d', _source: { type: 'c', c: { name: 'DDD' } } },
      ]
    );

    expect(result).rejects.toMatchInlineSnapshot(
      `[Error: Unable to migrate the corrupt saved object document with _id: 'foo:b'.]`
    );

    expect(transform).toHaveBeenCalledTimes(0);
  });

  test('handles when one document is transformed into multiple documents', async () => {
    const transform = jest.fn<any, any>((doc: any) => [
      set(_.cloneDeep(doc), 'attributes.name', 'HOI!'),
      { id: 'bar', type: 'foo', attributes: { name: 'baz' } },
    ]);
    const result = await migrateRawDocs(
      new SavedObjectsSerializer(new SavedObjectTypeRegistry()),
      transform,
      [{ _id: 'a:b', _source: { type: 'a', a: { name: 'AAA' } } }]
    );

    expect(result).toEqual([
      {
        _id: 'a:b',
        _source: { type: 'a', a: { name: 'HOI!' }, typeMigrationVersion: '', references: [] },
      },
      {
        _id: 'foo:bar',
        _source: { type: 'foo', foo: { name: 'baz' }, references: [] },
      },
    ]);

    const obj = {
      id: 'b',
      type: 'a',
      attributes: { name: 'AAA' },
      typeMigrationVersion: '',
      references: [],
    };
    expect(transform).toHaveBeenCalledTimes(1);
    expect(transform).toHaveBeenCalledWith(obj);
  });

  test('rejects when the transform function throws an error', async () => {
    const transform = jest.fn<any, any>((doc: any) => {
      throw new Error('error during transform');
    });
    await expect(
      migrateRawDocs(new SavedObjectsSerializer(new SavedObjectTypeRegistry()), transform, [
        { _id: 'a:b', _source: { type: 'a', a: { name: 'AAA' } } },
      ])
    ).rejects.toThrowErrorMatchingInlineSnapshot(`"error during transform"`);
  });
});

describe('migrateRawDocsSafely', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('converts raw docs to saved objects', async () => {
    const transform = jest.fn<any, any>((doc: any) => [
      set(_.cloneDeep(doc), 'attributes.name', 'HOI!'),
    ]);
    const task = migrateRawDocsSafely({
      serializer: new SavedObjectsSerializer(new SavedObjectTypeRegistry()),
      migrateDoc: transform,
      rawDocs: [
        { _id: 'a:b', _source: { type: 'a', a: { name: 'AAA' } } },
        { _id: 'a:c', _source: { type: 'a', a: { name: 'AAA' }, typeMigrationVersion: '1.0.0' } },
        { _id: 'c:d', _source: { type: 'c', c: { name: 'DDD' } } },
        {
          _id: 'c:e',
          _source: { type: 'c', c: { name: 'DDD' }, migrationVersion: { c: '2.0.0' } },
        },
      ],
    });
    const result = (await task()) as Either.Right<DocumentsTransformSuccess>;
    expect(result._tag).toEqual('Right');
    expect(result.right.processedDocs).toEqual([
      {
        _id: 'a:b',
        _source: { type: 'a', a: { name: 'HOI!' }, typeMigrationVersion: '', references: [] },
      },
      {
        _id: 'a:c',
        _source: { type: 'a', a: { name: 'HOI!' }, typeMigrationVersion: '1.0.0', references: [] },
      },
      {
        _id: 'c:d',
        _source: { type: 'c', c: { name: 'HOI!' }, typeMigrationVersion: '', references: [] },
      },
      {
        _id: 'c:e',
        _source: {
          type: 'c',
          c: { name: 'HOI!' },
          migrationVersion: { c: '2.0.0' },
          references: [],
        },
      },
    ]);

    const obj1 = {
      id: 'b',
      type: 'a',
      attributes: { name: 'AAA' },
      typeMigrationVersion: '',
      references: [],
    };
    const obj2 = {
      id: 'c',
      type: 'a',
      attributes: { name: 'AAA' },
      typeMigrationVersion: '1.0.0',
      references: [],
    };
    const obj3 = {
      id: 'd',
      type: 'c',
      attributes: { name: 'DDD' },
      typeMigrationVersion: '',
      references: [],
    };
    const obj4 = {
      id: 'e',
      type: 'c',
      attributes: { name: 'DDD' },
      migrationVersion: { c: '2.0.0' },
      references: [],
    };
    expect(transform).toHaveBeenCalledTimes(4);
    expect(transform).toHaveBeenNthCalledWith(1, obj1);
    expect(transform).toHaveBeenNthCalledWith(2, obj2);
    expect(transform).toHaveBeenNthCalledWith(3, obj3);
    expect(transform).toHaveBeenNthCalledWith(4, obj4);
  });

  test('returns a `left` tag when encountering a corrupt saved object document', async () => {
    const transform = jest.fn<any, any>((doc: any) => [
      set(_.cloneDeep(doc), 'attributes.name', 'TADA'),
    ]);
    const task = migrateRawDocsSafely({
      serializer: new SavedObjectsSerializer(new SavedObjectTypeRegistry()),
      migrateDoc: transform,
      rawDocs: [
        { _id: 'foo:b', _source: { type: 'a', a: { name: 'AAA' } } },
        { _id: 'c:d', _source: { type: 'c', c: { name: 'DDD' } } },
      ],
    });
    const result = (await task()) as Either.Left<DocumentsTransformFailed>;
    expect(transform).toHaveBeenCalledTimes(1);
    expect(result._tag).toEqual('Left');
    expect(Object.keys(result.left)).toEqual([
      'type',
      'corruptDocumentIds',
      'transformErrors',
      'processedDocs',
    ]);
    expect(result.left.corruptDocumentIds.length).toEqual(1);
    expect(result.left.transformErrors.length).toEqual(0);
    expect(result.left.processedDocs.length).toEqual(1);
  });

  test('handles when one document is transformed into multiple documents', async () => {
    const transform = jest.fn<any, any>((doc: any) => [
      set(_.cloneDeep(doc), 'attributes.name', 'HOI!'),
      { id: 'bar', type: 'foo', attributes: { name: 'baz' } },
    ]);
    const task = migrateRawDocsSafely({
      serializer: new SavedObjectsSerializer(new SavedObjectTypeRegistry()),
      migrateDoc: transform,
      rawDocs: [{ _id: 'a:b', _source: { type: 'a', a: { name: 'AAA' } } }],
    });
    const result = (await task()) as Either.Right<DocumentsTransformSuccess>;
    expect(result._tag).toEqual('Right');
    expect(result.right.processedDocs).toEqual([
      {
        _id: 'a:b',
        _source: { type: 'a', a: { name: 'HOI!' }, typeMigrationVersion: '', references: [] },
      },
      {
        _id: 'foo:bar',
        _source: { type: 'foo', foo: { name: 'baz' }, references: [] },
      },
    ]);

    const obj = {
      id: 'b',
      type: 'a',
      attributes: { name: 'AAA' },
      typeMigrationVersion: '',
      references: [],
    };
    expect(transform).toHaveBeenCalledTimes(1);
    expect(transform).toHaveBeenCalledWith(obj);
  });

  test('instance of Either.left containing transform errors when the transform function throws a TransformSavedObjectDocument error', async () => {
    const transform = jest.fn<any, any>((doc: any) => {
      throw new TransformSavedObjectDocumentError(new Error('error during transform'), '8.0.0');
    });
    const task = migrateRawDocsSafely({
      serializer: new SavedObjectsSerializer(new SavedObjectTypeRegistry()),
      migrateDoc: transform,
      rawDocs: [{ _id: 'a:b', _source: { type: 'a', a: { name: 'AAA' } } }], // this is the raw doc
    });
    const result = (await task()) as Either.Left<DocumentsTransformFailed>;
    expect(transform).toHaveBeenCalledTimes(1);
    expect(result._tag).toEqual('Left');
    expect(result.left.corruptDocumentIds.length).toEqual(0);
    expect(result.left.transformErrors.length).toEqual(1);
    expect(result.left.transformErrors[0]).toMatchInlineSnapshot(`
      Object {
        "err": [Error: Migration function for version 8.0.0 threw an error],
        "rawId": "a:b",
      }
    `);
  });
});
