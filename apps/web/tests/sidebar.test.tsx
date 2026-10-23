import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Sidebar } from '../src/components/layout/Sidebar';
import { ChatConversation } from '../src/types/chat';

describe('Sidebar deterministic rendering regression test', () => {
  const dummyConversations: ChatConversation[] = [
    {
      id: 'conv-coding',
      title: 'Find a coding model',
      createdAt: 1700000000000,
      updatedAt: 1700001800000,
      messages: [],
    },
    {
      id: 'conv-llama',
      title: 'Can my laptop run Llama?',
      createdAt: 1699900000000,
      updatedAt: 1699900000000,
      messages: [],
    },
  ];

  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    conversations: dummyConversations,
    activeConversationId: 'conv-coding',
    onSelectConversation: vi.fn(),
    onNewChat: vi.fn(),
    onDeleteConversation: vi.fn(),
    onOpenHardwareModal: vi.fn(),
    onOpenSettingsModal: vi.fn(),
    onNavigateToAdvanced: vi.fn(),
    onNavigateToReport: vi.fn(),
    hasSavedReport: false,
  };

  it('renders identically on two successive renders with the same props', () => {
    // First render
    const { container: container1, unmount: unmount1 } = render(<Sidebar {...defaultProps} />);
    const htmlFirstRender = container1.innerHTML;
    expect(screen.getByText('Find a coding model')).toBeDefined();
    unmount1();

    // Second render
    const { container: container2, unmount: unmount2 } = render(<Sidebar {...defaultProps} />);
    const htmlSecondRender = container2.innerHTML;
    expect(screen.getByText('Find a coding model')).toBeDefined();
    unmount2();

    // Regression assertion: Both renders must yield 100% identical DOM markup
    expect(htmlFirstRender).toBe(htmlSecondRender);
  });

  it('renders concurrently mounted instances identically without state drift', () => {
    const { container: containerA } = render(
      <div id="instance-a">
        <Sidebar {...defaultProps} />
      </div>
    );

    const { container: containerB } = render(
      <div id="instance-b">
        <Sidebar {...defaultProps} />
      </div>
    );

    const markupA = containerA.querySelector('aside')?.innerHTML;
    const markupB = containerB.querySelector('aside')?.innerHTML;

    expect(markupA).toBeDefined();
    expect(markupB).toBeDefined();
    expect(markupA).toBe(markupB);
  });
});
