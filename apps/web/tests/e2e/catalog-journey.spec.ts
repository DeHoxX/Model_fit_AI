import { test, expect } from '@playwright/test';

test.describe('Model Catalog and Estimation Journey', () => {
  test('user can browse models, view normalized details, and transition to memory estimation', async ({
    page,
  }) => {
    // 1. Intercept /api/v1/models list endpoint with deterministic fixture
    await page.route('**/api/v1/models*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: 'meta-llama/Meta-Llama-3-8B',
              author: 'meta-llama',
              model_name: 'Meta-Llama-3-8B',
              pipeline_tag: 'text-generation',
              likes: 8450,
              downloads: 1250000,
              is_supported: true,
              gated: false,
              license: 'llama3',
              total_params: 8030261248,
            },
          ],
          next_cursor: null,
          has_more: false,
        }),
      });
    });

    // 2. Intercept /api/v1/models/meta-llama/Meta-Llama-3-8B detail endpoint
    await page.route('**/api/v1/models/meta-llama/Meta-Llama-3-8B', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'meta-llama/Meta-Llama-3-8B',
          author: 'meta-llama',
          model_name: 'Meta-Llama-3-8B',
          pipeline_tag: 'text-generation',
          likes: 8450,
          downloads: 1250000,
          is_supported: true,
          gated: false,
          license: 'llama3',
          param_provenance: 'safetensors',
          normalized_model: {
            id: 'meta-llama/Meta-Llama-3-8B',
            architecture_name: 'LlamaForCausalLM',
            architecture_category: 'standard_transformer',
            total_params: 8030261248,
            active_params: 8030261248,
            num_layers: 32,
            hidden_size: 4096,
            num_attention_heads: 32,
            num_kv_heads: 8,
            head_dim: 128,
            vocab_size: 128256,
            max_context_length: 8192,
            intermediate_size: 14336,
            tie_word_embeddings: false,
            attention_variant: 'grouped_query',
          },
        }),
      });
    });

    // 3. Visit /models catalog discovery page
    await page.goto('/models');
    await expect(page.locator('h1')).toContainText('Model Catalog');

    // 4. Verify model card is visible
    const modelCard = page.locator('text=Meta-Llama-3-8B');
    await expect(modelCard).toBeVisible();
    await expect(page.locator('text=meta-llama')).toBeVisible();

    // 5. Click model to open detail page
    await modelCard.click();
    await expect(page).toHaveURL(/.*\/models\/meta-llama\/Meta-Llama-3-8B/);

    // 6. Verify detail specifications and provenance badge
    await expect(page.locator('text=Safetensors Verified')).toBeVisible();
    await expect(page.locator('text=LlamaForCausalLM')).toBeVisible();
    await expect(page.locator('text=grouped_query')).toBeVisible();

    // 7. Click Estimate button to transition to estimator
    const estimateBtn = page.locator('#estimate-model-btn');
    await expect(estimateBtn).toBeVisible();
    await estimateBtn.click();

    // 8. Verify redirected to /estimator with repo_id query param
    await expect(page).toHaveURL(/.*\/estimator\?repo_id=meta-llama%2FMeta-Llama-3-8B/);
  });
});
