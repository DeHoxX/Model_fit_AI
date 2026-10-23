import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EstimationResultCard } from '../src/components/estimator/EstimationResultCard';
import { EstimatorForm, EstimatorFormState } from '../src/components/estimator/EstimatorForm';
import { paths } from '../src/api/schema';

type EstimationResult =
  paths['/api/v1/estimate']['post']['responses']['200']['content']['application/json'];

describe('EstimationResultCard', () => {
  const mockResultFits: EstimationResult = {
    weights_bytes: 4_868_187_500,
    kv_cache_bytes: 1_073_741_824,
    activation_bytes: 201_326_592,
    runtime_overhead_bytes: 268_435_456,
    total_bytes: 6_411_691_372,
    per_device_bytes: null,
    verdict: 'fits',
    headroom_bytes: 5_936_339_604,
    assumptions: ['Assuming num_kv_heads equals num_attention_heads (Full MHA)'],
    warnings: ['vLLM default configuration pre-allocates 90% of GPU VRAM.'],
    unsupported_reasons: [],
    confidence: 'medium',
  };

  it('renders fits comfortably badge and formatted breakdown in GiB', () => {
    render(
      <EstimationResultCard
        result={mockResultFits}
        unit="GiB"
        totalMemoryBytes={12_884_901_888}
      />
    );

    expect(screen.getByText(/Fits Comfortably/i)).toBeDefined();
    expect(screen.getByText(/Available Headroom/i)).toBeDefined();
    expect(screen.getByText(/Confidence Level/i)).toBeDefined();
    expect(screen.getByText(/MEDIUM/i)).toBeDefined();
    expect(screen.getByText(/Zero fallback assumptions|1 fallback assumption/i)).toBeDefined();
  });

  it('renders does not fit badge when memory is exceeded', () => {
    const mockResultDoesNotFit: EstimationResult = {
      ...mockResultFits,
      verdict: 'does_not_fit',
      headroom_bytes: -2_000_000_000,
    };

    render(
      <EstimationResultCard
        result={mockResultDoesNotFit}
        unit="GiB"
        totalMemoryBytes={12_884_901_888}
      />
    );

    expect(screen.getByText(/Does Not Fit/i)).toBeDefined();
  });

  it('renders cannot estimate badge with unsupported reasons', () => {
    const mockCannotEstimate: EstimationResult = {
      weights_bytes: 0,
      kv_cache_bytes: 0,
      activation_bytes: 0,
      runtime_overhead_bytes: 0,
      total_bytes: 0,
      per_device_bytes: null,
      verdict: 'cannot_estimate',
      headroom_bytes: 0,
      assumptions: [],
      warnings: [],
      unsupported_reasons: ['UNSUPPORTED_ARCHITECTURE_MLA'],
      confidence: 'low',
    };

    render(
      <EstimationResultCard
        result={mockCannotEstimate}
        unit="GiB"
        totalMemoryBytes={12_884_901_888}
      />
    );

    expect(screen.getByText(/Cannot Estimate/i)).toBeDefined();
    expect(screen.getByText(/UNSUPPORTED_ARCHITECTURE_MLA/i)).toBeDefined();
  });
});

describe('EstimatorForm', () => {
  const dummyState: EstimatorFormState = {
    id: 'test-model',
    architecture_name: 'llama',
    architecture_category: 'standard_transformer',
    total_params_b: 8.0,
    active_params_b: 8.0,
    num_layers: 32,
    hidden_size: 4096,
    num_attention_heads: 32,
    num_kv_heads: 8,
    head_dim: 128,
    attention_variant: 'grouped_query',
    sliding_window_size: null,
    max_context_length: 8192,
    quantization: 'q4_k_m',
    kv_cache_dtype: 'fp16',
    context_length: 8192,
    batch_size: 1,
    runtime: 'llama_cpp',
    gpu_count: 1,
    tensor_parallel_degree: 1,
    selected_hardware_id: 'preset-3060',
    custom_memory_gib: 12,
    custom_reserved_gib: 0.5,
  };

  const dummyHardware = [
    {
      id: 'preset-3060',
      name: 'NVIDIA GeForce RTX 3060 12GB',
      kind: 'gpu',
      memory_bytes: 12884901888,
      reserved_memory_bytes: 536870912,
      is_verified: true,
      notes: null,
    },
  ];

  it('renders form controls and triggers callbacks', () => {
    const handleChange = vi.fn();
    const handlePreset = vi.fn();
    const handleUnit = vi.fn();
    const handleSubmit = vi.fn();

    render(
      <EstimatorForm
        state={dummyState}
        onChange={handleChange}
        hardwareList={dummyHardware}
        onLoadPreset={handlePreset}
        unit="GiB"
        onToggleUnit={handleUnit}
        isEstimating={false}
        onSubmit={handleSubmit}
      />
    );

    expect(screen.getByText(/Model & Hardware Parameters/i)).toBeDefined();

    // Trigger re-calculate
    const submitBtn = screen.getByText(/Re-calculate Estimation/i);
    fireEvent.click(submitBtn);
    expect(handleSubmit).toHaveBeenCalledTimes(1);

    // Trigger preset button
    const presetBtn = screen.getByText(/Llama-3 8B \(GQA\)/i);
    fireEvent.click(presetBtn);
    expect(handlePreset).toHaveBeenCalledWith('llama3-8b');
  });
});
