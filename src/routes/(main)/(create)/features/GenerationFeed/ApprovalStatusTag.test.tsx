/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ApprovalStatusTag } from './ApprovalStatusTag';

vi.mock('@lobehub/ui', () => ({
  DropdownMenu: ({
    children,
    items,
  }: {
    children: ReactNode;
    items: Array<{ key: string; label: ReactNode; onClick: (info: any) => void }>;
  }) => (
    <>
      {children}
      {items.map((item) => (
        <button
          data-testid={`option-${item.key}`}
          key={item.key}
          onClick={() => item.onClick({ domEvent: { stopPropagation: () => {} } })}
        >
          {item.label}
        </button>
      ))}
    </>
  ),
  Icon: ({ icon: IconComp }: any) => (IconComp ? <IconComp /> : null),
}));

vi.mock('@lobehub/ui/base-ui', () => ({
  Tag: ({ children, icon, ...rest }: any) => (
    <span data-testid="approval-status-tag" {...rest}>
      {icon}
      {children}
    </span>
  ),
}));

vi.mock('antd-style', () => ({
  cssVar: { colorTextSecondary: '#666' },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('ApprovalStatusTag', () => {
  it('renders the current status label', () => {
    render(<ApprovalStatusTag status="pending" onChange={vi.fn()} />);

    expect(screen.getByTestId('approval-status-tag')).toHaveTextContent(
      'generation.approval.pending',
    );
  });

  it('calls onChange when a different status is picked', () => {
    const onChange = vi.fn();
    render(<ApprovalStatusTag status="pending" onChange={onChange} />);

    fireEvent.click(screen.getByTestId('option-approved'));

    expect(onChange).toHaveBeenCalledWith('approved');
  });

  it('does not call onChange when the current status is re-selected', () => {
    const onChange = vi.fn();
    render(<ApprovalStatusTag status="approved" onChange={onChange} />);

    fireEvent.click(screen.getByTestId('option-approved'));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('renders only the badge, without the dropdown options, when disabled', () => {
    render(<ApprovalStatusTag disabled status="changesRequested" onChange={vi.fn()} />);

    expect(screen.getByTestId('approval-status-tag')).toHaveTextContent(
      'generation.approval.changesRequested',
    );
    expect(screen.queryByTestId('option-approved')).not.toBeInTheDocument();
  });
});
