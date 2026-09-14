import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { GenerationTopicStoreProvider } from '../StoreContext';
import GridItem from './GridItem';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@/business/client/hooks/useActiveWorkspaceId', () => ({
  useActiveWorkspaceId: () => null,
}));
vi.mock('@lobehub/ui', async (importOriginal) => ({
  ...(await importOriginal<any>()),
  ContextMenuTrigger: ({ children }: any) => children,
  Tooltip: ({ children }: any) => children,
}));
vi.mock('@lobehub/ui/base-ui', () => ({
  Avatar: ({ avatar, alt }: any) => <img alt={alt} data-testid={'cover'} src={avatar} />,
}));

const renderItem = (topic: any) =>
  render(
    <GenerationTopicStoreProvider value={{ namespace: 'video', useStore: (() => ({})) as any }}>
      <GridItem isActive={false} topic={topic} onClick={() => {}} onDelete={() => {}} />
    </GenerationTopicStoreProvider>,
  );

describe('GridItem', () => {
  it('shows the cover image when the topic has one', () => {
    renderItem({ coverUrl: 'https://cdn/cover.webp', id: 't1', title: 'a man running' });
    expect(screen.getByTestId('cover')).toHaveAttribute('src', 'https://cdn/cover.webp');
    expect(screen.queryByTestId('topic-text-tile')).toBeNull();
  });

  it('shows the title as text when nothing has rendered yet, so a stuck topic is findable', () => {
    renderItem({ coverUrl: null, id: 't2', title: 'a man running' });
    expect(screen.queryByTestId('cover')).toBeNull();
    expect(screen.getByTestId('topic-text-tile')).toHaveTextContent('a man running');
  });
});
