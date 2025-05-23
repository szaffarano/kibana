/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { orderBy } from 'lodash';
import expect from '@kbn/expect';
import { AI_ASSISTANT_KB_INFERENCE_ID } from '@kbn/observability-ai-assistant-plugin/server/service/inference_endpoint';
import type { DeploymentAgnosticFtrProviderContext } from '../../../../ftr_provider_context';
import {
  deleteKnowledgeBaseModel,
  clearKnowledgeBase,
  setupKnowledgeBase,
  getKnowledgeBaseEntries,
} from '../utils/knowledge_base';
import { restoreIndexAssets } from '../utils/index_assets';

export default function ApiTest({ getService }: DeploymentAgnosticFtrProviderContext) {
  const observabilityAIAssistantAPIClient = getService('observabilityAIAssistantApi');
  const esArchiver = getService('esArchiver');
  const es = getService('es');
  const retry = getService('retry');

  const archive =
    'x-pack/test/functional/es_archives/observability/ai_assistant/knowledge_base_8_15';

  describe('when the knowledge base index was created before 8.15', function () {
    // Intentionally skipped in all serverless environnments (local and MKI)
    // because the migration scenario being tested is not relevant to MKI and Serverless.
    this.tags(['skipServerless']);

    before(async () => {
      await deleteKnowledgeBaseModel(getService);
      await restoreIndexAssets(observabilityAIAssistantAPIClient, es);
      await clearKnowledgeBase(es);
      await esArchiver.load(archive);
      await setupKnowledgeBase(getService);
    });

    after(async () => {
      await deleteKnowledgeBaseModel(getService);
      await restoreIndexAssets(observabilityAIAssistantAPIClient, es);
    });

    describe('before migrating', () => {
      it('the docs do not have semantic_text embeddings', async () => {
        const hits = await getKnowledgeBaseEntries(es);
        const hasSemanticTextEmbeddings = hits.some((hit) => hit._source?.semantic_text);
        expect(hasSemanticTextEmbeddings).to.be(false);
      });
    });

    describe('after migrating', () => {
      before(async () => {
        const { status } = await observabilityAIAssistantAPIClient.editor({
          endpoint:
            'POST /internal/observability_ai_assistant/kb/migrations/populate_missing_semantic_text_field',
        });
        expect(status).to.be(200);
      });

      it('the docs have semantic_text embeddings', async () => {
        await retry.try(async () => {
          const hits = await getKnowledgeBaseEntries(es);
          const hasSemanticTextEmbeddings = hits.every((hit) => hit._source?.semantic_text);
          expect(hasSemanticTextEmbeddings).to.be(true);

          expect(
            orderBy(hits, '_source.title').map(({ _source }) => {
              const text = _source?.semantic_text;
              const inference = _source?._inference_fields?.semantic_text?.inference;

              return {
                text: text ?? '',
                inferenceId: inference?.inference_id,
                chunkCount: inference?.chunks?.semantic_text?.length,
              };
            })
          ).to.eql([
            {
              text: 'To infinity and beyond!',
              inferenceId: AI_ASSISTANT_KB_INFERENCE_ID,
              chunkCount: 1,
            },
            {
              text: "The user's favourite color is blue.",
              inferenceId: AI_ASSISTANT_KB_INFERENCE_ID,
              chunkCount: 1,
            },
          ]);
        });
      });

      it('returns entries correctly via API', async () => {
        const { status } = await observabilityAIAssistantAPIClient.editor({
          endpoint:
            'POST /internal/observability_ai_assistant/kb/migrations/populate_missing_semantic_text_field',
        });

        expect(status).to.be(200);

        const res = await observabilityAIAssistantAPIClient.editor({
          endpoint: 'GET /internal/observability_ai_assistant/kb/entries',
          params: {
            query: {
              query: '',
              sortBy: 'title',
              sortDirection: 'asc',
            },
          },
        });

        expect(res.status).to.be(200);

        expect(
          res.body.entries.map(({ title, text, role, type }) => ({ title, text, role, type }))
        ).to.eql([
          {
            role: 'user_entry',
            title: 'Toy Story quote',
            type: 'contextual',
            text: 'To infinity and beyond!',
          },
          {
            role: 'assistant_summarization',
            title: "User's favourite color",
            type: 'contextual',
            text: "The user's favourite color is blue.",
          },
        ]);
      });
    });
  });
}
